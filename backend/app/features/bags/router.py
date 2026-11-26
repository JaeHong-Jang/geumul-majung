"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.deps import current_company, get_or_404, need_role
from app.core.util import KST, dsum, iso, now
from app.db.models import Bag, BagPass, BagPhoto, Company
from app.db.session import get_session
from app.features._shared.flows import call_flow, grade_from_result, local_grade
from app.features._shared.uploads import decode_upload, file_response, ImageIn
from app.features._shared.voice import IntakeIn, agent_steps, hear, stt_status
from app.features.bags.schemas import BagIn, GradeIn
from app.features.bags.service import bag_dict, bag_view, can_see_photo
from app.features.market.service import market_volumes
from app.tools.calc import canon_material
from app.tools.data import waste_name


router = APIRouter(prefix="/v1")


@router.post("/bags", status_code=201)
def create_bag(body: BagIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory", verified=True)   # 가입 승인 전에는 만들 수 없음(§13.1)
    b = Bag(factory_id=me.id, waste_code=body.waste_code, target_material=body.target_material,
            items=[i.model_dump() for i in body.items], total_kg=float(dsum(i.kg for i in body.items)), note=body.note)
    session.add(b)
    session.commit()
    return bag_dict(b)


@router.get("/me/bags")
def my_bags(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    return [bag_view(session, b) for b in session.query(Bag).filter_by(factory_id=me.id).order_by(Bag.id.desc())]


# ---- 마대 등록 말 입력과 재질 추천 (계약 27절) ----
def _material_basis(session: Session, me: Company) -> dict:
    """재질 추천 근거: 내 지난 등록 {품목: {재질: 횟수}}, 장터 등록 물량 {품목: {재질: kg}}."""
    history: dict = defaultdict(lambda: defaultdict(int))
    for code, material in session.query(Bag.waste_code, Bag.target_material).filter(Bag.factory_id == me.id):
        if material:
            history[code][canon_material(material)] += 1
    market: dict = defaultdict(dict)
    for v in market_volumes(session):
        if v["target_material"]:
            market[v["waste_code"]][v["target_material"]] = v["total_kg"]
    return {"history": {k: dict(v) for k, v in history.items()}, "market": dict(market)}


def _material_view(result) -> dict:
    data = next((r.data for r in result.results if r.agent_id == "material"), {}) or {}
    return {"candidates": data.get("candidates", []), "auto": data.get("auto")}


@router.get("/bags/intake/status")
def intake_status(me: Company = Depends(current_company)):
    """등록 화면을 열 때 부른다: 음성 인식 사용 가능 여부. 가능하면 모델을 미리 올려 첫 녹음이 느리지 않게 한다."""
    need_role(me, "factory")
    return stt_status()


@router.get("/bags/material-suggest")
def material_suggest(waste_code: str = Query(min_length=1, max_length=20), me: Company = Depends(current_company),
                     session: Session = Depends(get_session)):
    need_role(me, "factory")
    if waste_name(waste_code) is None:
        raise HTTPException(422, "알 수 없는 품목 코드")
    ctx = {"waste_code": waste_code, "skip_llm_summary": True, **_material_basis(session, me)}
    result = call_flow(session, "material_suggest", ctx, [me.id])
    if result is None:
        raise HTTPException(503, "재질 추천을 지금 사용할 수 없음")
    return {**_material_view(result), "steps": agent_steps(result), "run_id": result.run_id}


@router.get("/bags/{bag_id}")
def get_bag(bag_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    bag = get_or_404(session, Bag, bag_id)
    if bag.factory_id != me.id:
        raise HTTPException(403, "내 등록 물품 아님")
    return {**bag_view(session, bag), "items": bag.items, "reasons": bag.reasons or [], "note": bag.note}


@router.post("/bags/{bag_id}/grade")
def grade_bag(bag_id: int, body: GradeIn | None = None, me: Company = Depends(current_company),
              session: Session = Depends(get_session)):
    need_role(me, "factory")
    bag = get_or_404(session, Bag, bag_id)
    if bag.factory_id != me.id:
        raise HTTPException(403, "내 등록 물품 아님")
    if bag.listing_id is not None:
        raise HTTPException(409, "판매에 묶인 물품은 다시 등급을 매길 수 없음")
    confirm = bool(body and body.confirm_no_hazard)
    result = call_flow(session, "grade_bag", {"bag": {**bag_dict(bag), "confirm_no_hazard": confirm}}, [me.id])
    # 등급 숫자는 grading 에이전트의 코드 계산값만 쓴다. 하네스가 없을 때만 같은 규칙으로 직접 계산.
    grade = grade_from_result(result) or local_grade(bag, confirm)
    out = {"bag_id": bag.id, "grade": grade.model_dump(), "run_id": result.run_id if result else None}
    log = [*(bag.history or []), {"at": iso(now()), "by": me.id, "confirm_no_hazard": confirm, "grade": grade.grade}]
    # 호출하는 동안 판매에 묶였을 수 있으므로 조건부 UPDATE로 확정
    got = session.execute(update(Bag).where(Bag.id == bag.id, Bag.listing_id.is_(None))
                          .values(grade=grade.grade, purity=grade.purity, reasons=grade.reasons, history=log,
                                  status="rejected" if grade.grade is None else "graded"),
                          execution_options={"synchronize_session": False})
    if got.rowcount == 0:
        session.rollback()
        raise HTTPException(409, "판매에 묶인 물품은 다시 등급을 매길 수 없음")
    bag_pass = session.query(BagPass).filter_by(bag_id=bag.id).first()
    if grade.grade is None:
        if bag_pass:
            session.delete(bag_pass)
    else:
        if bag_pass is None:
            bag_pass = BagPass(bag_id=bag.id, grade=grade.grade)
            session.add(bag_pass)
        bag_pass.grade = grade.grade
        session.flush()
        out["pass_id"] = bag_pass.id
        out["qr"] = f"MDP-{bag_pass.id}-{bag.id}"
    session.commit()
    return out


@router.put("/bags/{bag_id}/photo")
def put_photo(bag_id: int, body: ImageIn, me: Company = Depends(current_company),
              session: Session = Depends(get_session)):
    need_role(me, "factory")
    bag = get_or_404(session, Bag, bag_id)
    if bag.factory_id != me.id:
        raise HTTPException(404, "등록 물품을 찾을 수 없음")   # §12: 새 경로는 남의 데이터를 404로 숨긴다
    raw = decode_upload(body.content_type, body.data_base64)
    bag.photo_type, bag.photo_data = body.content_type, raw
    session.commit()
    return {"bag_id": bag.id, "content_type": bag.photo_type, "size": len(raw)}


MAX_PHOTOS = 5


@router.post("/bags/{bag_id}/photos", status_code=201)
def add_photo(bag_id: int, body: ImageIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """사진 한 장 더하기(최대 5장). 첫 장은 예전 한 장 칸에도 넣어 기존 화면이 그대로 보이게 한다."""
    need_role(me, "factory")
    bag = get_or_404(session, Bag, bag_id)
    if bag.factory_id != me.id:
        raise HTTPException(404, "등록 물품을 찾을 수 없음")
    count = session.query(BagPhoto).filter_by(bag_id=bag.id).count()
    if count >= MAX_PHOTOS:
        raise HTTPException(409, f"사진은 {MAX_PHOTOS}장까지 올릴 수 있음")
    raw = decode_upload(body.content_type, body.data_base64)
    p = BagPhoto(bag_id=bag.id, content_type=body.content_type, data=raw)
    session.add(p)
    if count == 0:
        bag.photo_type, bag.photo_data = body.content_type, raw
    session.commit()
    return {"id": p.id, "bag_id": bag.id, "n": count + 1}


@router.get("/bags/{bag_id}/photos")
def list_photos(bag_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    bag = get_or_404(session, Bag, bag_id)
    if not can_see_photo(session, bag, me):
        raise HTTPException(404, "등록 물품을 찾을 수 없음")
    return [{"id": p.id} for p in session.query(BagPhoto.id).filter_by(bag_id=bag.id).order_by(BagPhoto.id)]


@router.get("/bag-photos/{photo_id}")
def get_bag_photo(photo_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    p = get_or_404(session, BagPhoto, photo_id)
    bag = session.get(Bag, p.bag_id)
    if bag is None or not can_see_photo(session, bag, me):
        raise HTTPException(404, "사진 없음")
    return file_response(p.data, p.content_type)


@router.delete("/bag-photos/{photo_id}", status_code=204)
def delete_bag_photo(photo_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    p = get_or_404(session, BagPhoto, photo_id)
    bag = session.get(Bag, p.bag_id)
    if bag is None or bag.factory_id != me.id:
        raise HTTPException(404, "사진 없음")
    session.delete(p)
    session.flush()
    first = session.query(BagPhoto).filter_by(bag_id=bag.id).order_by(BagPhoto.id).first()
    bag.photo_type, bag.photo_data = (first.content_type, first.data) if first else (None, None)
    session.commit()


@router.get("/bags/{bag_id}/photo")
def get_photo(bag_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    bag = get_or_404(session, Bag, bag_id)
    if bag.photo_type is None or bag.photo_data is None or not can_see_photo(session, bag, me):
        raise HTTPException(404, "사진 없음")   # 볼 수 없는 사진도 같은 404(있는지 알려 주지 않음)
    return file_response(bag.photo_data, bag.photo_type)


@router.post("/bags/intake")
def bag_intake(body: IntakeIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """녹음(또는 글) → 음성 인식 → 말 입력 정리 → 재질 추천. 칸 값만 돌려주고 마대는 만들지 않는다(사람이 확인 후 제출)."""
    need_role(me, "factory")
    transcript, steps = hear(body)
    ctx = {"transcript": transcript, "today": now().astimezone(KST).date().isoformat(), "skip_llm_summary": True,
           **_material_basis(session, me)}
    result = call_flow(session, "bag_intake", ctx, [me.id])
    if result is None:
        raise HTTPException(503, "AI 정리를 지금 사용할 수 없음")
    data = next((r.data for r in result.results if r.agent_id == "intake"), {}) or {}
    return {"transcript": transcript, "fields": data.get("fields", {}), "sources": data.get("sources", {}),
            "material": _material_view(result), "steps": steps + agent_steps(result), "run_id": result.run_id}
