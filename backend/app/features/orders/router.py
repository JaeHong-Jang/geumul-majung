"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.deps import current_company, get_or_404, need_role
from app.core.util import dec, KST, LEGAL_NOTE, now, pct_diff, pct_text, to_kst, won
from app.db.models import BagPass, Company, Listing, Order, OrderHistory, OrderPhoto
from app.db.session import get_session
from app.features._shared.bundles import pickup_groups
from app.features._shared.flows import call_flow, dump
from app.features._shared.uploads import decode_upload, file_response
from app.features.handover.service import carrier_data, emitter_data, save_section
from app.features.orders.schemas import BatchIn, InspectIn, OrderIn, PhotoIn, PickupIn, PreviewIn, ResolveIn, WeightsIn
from app.features.orders.service import (
    check_orderable,
    check_weights,
    free_bags,
    list_my_orders,
    without_hauler_line,
    listing_bags,
    load_orderable,
    my_order_as,
    order_dict,
    order_party,
    order_summary,
    order_unit_price,
    party_order,
    photo_dict,
    place_order,
    sections,
)
from app.features.orders.state import change_status, state_ko, goods_by_weight, held_goods, kg_sum, pg_set, settle
from app.harness.runner import run_flow
from app.tools.data import assumptions


router = APIRouter(prefix="/v1")


def deal_ctx(order: Order, listing: Listing, factory: Company, recycler: Company) -> dict:
    """deal_check 흐름에 넘기는 값(주문 만들 때와 체크리스트 조회가 함께 쓴다)."""
    return {"order": {"id": order.id, "goods_krw": order.goods_krw, "freight_cap_krw": order.freight_cap_krw,
                      "held_krw": order.held_krw, "status": order.status},
            "listing": {"id": listing.id, "waste_code": listing.waste_code, "grade": listing.grade,
                        "total_kg": listing.total_kg, "price_krw_per_kg": listing.price_krw_per_kg},
            "factory": {"id": factory.id, "name": factory.name},
            "recycler": {"id": recycler.id, "name": recycler.name, "permit_no": recycler.permit_no, "permit_codes": recycler.permit_codes}}


TOLERANCE_PCT = 5   # 무게 허용 오차 ±5% (§8.4)


@router.post("/orders", status_code=201)
def create_order(body: OrderIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler", verified=True)
    listing = get_or_404(session, Listing, body.listing_id)
    check_orderable(me, listing)
    order = place_order(session, me, listing, body)
    factory = session.get(Company, listing.factory_id)
    ctx = deal_ctx(order, listing, factory, me)
    checklist = call_flow(session, "deal_check", ctx, [me.id, listing.factory_id])  # 호출 전 commit됨
    return {**order_summary(order), "checklist": dump(checklist)}


# 체크리스트 쉬운 문구(계약 22.4). 조문이 들어간 규칙 문장은 detail로 함께 보낸다.
CHECK_TEXT = {
    "recycler_permit": {True: "구매 업체 허가 품목에 이 폐기물 포함. 허가증 원본 확인 필요",
                        False: "구매 업체 허가 품목에 이 폐기물 없음. 거래 전 확인 필요",
                        None: "구매 업체 허가 품목 정보 없음. 확인 필요"},
    "seller_transport": {None: "판매자가 직접 운송, 인계서 운반자 칸도 판매자가 입력"},
    "handover_entry": {None: "인계서는 배출자, 운반자, 처리자가 올바로에 각자 입력, 앱은 입력값 정리만 담당"},
}
# 폐어구는 보통 생활폐기물이라 운반 자격과 인계서 안내가 다르다(regulation.GEAR_CODES)
GEAR_CHECK_TEXT = {
    "seller_transport": "폐어구 운반은 폐기물처리 신고나 수집, 운반업 허가를 갖춘 자만 가능. 운반자 자격 확인 필요",
    "handover_entry": "생활폐기물로 배출되면 전자인계서 대상 아님, 사업장폐기물이면 올바로 입력. 배출 지자체에 확인 필요",
}


@router.get("/orders/{order_id}/checklist")
def order_checklist(order_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """주문 법 체크리스트(저장하지 않고 LLM도 부르지 않음). 판매 공장·구매 업체·운영자만, 그 밖은 있는 주문이라도 404."""
    order = get_or_404(session, Order, order_id)
    listing = session.get(Listing, order.listing_id)
    if me.role != "operator" and me.id not in (listing.factory_id, order.recycler_id):
        raise HTTPException(404, "요청한 항목을 찾을 수 없음")
    ctx = deal_ctx(order, listing, session.get(Company, listing.factory_id), session.get(Company, order.recycler_id))
    result = run_flow("deal_check", ctx, llm=None)
    reg = next((r for r in result.results if r.agent_id == "regulation"), None)
    items = []
    if reg:
        for c, meta in zip(reg.claims, reg.data.get("checklist", [])):    # 주장 3개와 checklist 3개는 같은 순서. 게이트에 막힌 주장은 뺀다
            if not c.blocked:
                items.append({"item": meta["item"], "ok": meta["ok"], "text": (meta.get("gear") and GEAR_CHECK_TEXT.get(meta["item"])) or CHECK_TEXT[meta["item"]][meta["ok"]], "detail": c.text,
                              "laws": [{"ref": e.ref, "label": e.label} for e in c.evidence if e.kind == "law"]})
    return {"items": items, "legal_note": LEGAL_NOTE}


@router.post("/orders/batch", status_code=201)
def create_orders_batch(body: BatchIn, me: Company = Depends(current_company),
                        session: Session = Depends(get_session)):
    """한 트랜잭션: 하나라도 실패하면 선점한 매물 상태까지 전부 되돌린다. id 순서로 잠가 교착을 피한다."""
    need_role(me, "recycler", verified=True)
    listings = load_orderable(session, me, body.listing_ids)
    try:
        placed = {l.id: place_order(session, me, l, body)
                  for l in sorted(listings, key=lambda x: x.id)}
        session.commit()
    except Exception:
        session.rollback()
        raise
    return {"orders": [order_summary(placed[i]) for i in body.listing_ids]}


@router.post("/orders/preview")
def preview_orders(body: PreviewIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler", verified=True)
    listings = load_orderable(session, me, body.listing_ids)
    items = []
    for l in listings:
        goods = won(dec(l.total_kg) * dec(l.price_krw_per_kg))
        held = 0 if body.payment == "invoice" else held_goods(l.total_kg, l.price_krw_per_kg)
        items.append({"listing_id": l.id, "factory_id": l.factory_id, "total_kg": l.total_kg, "goods_krw": goods,
                      "freight_cap_krw": 0, "freight_payer": "seller" if body.transport == "seller" else "buyer", "held_krw": held})
    radius = assumptions()["bundle_radius_km"]
    return {"goods_krw": sum(i["goods_krw"] for i in items), "held_krw": sum(i["held_krw"] for i in items),
            "fee_krw": 0, "items": items, "pickup_groups": pickup_groups(session, listings, radius)}


@router.post("/orders/{order_id}/pickup")
def pickup(order_id: int, body: PickupIn, me: Company = Depends(current_company),
           session: Session = Depends(get_session)):
    order = my_order_as(session, order_id, me, "hauler")
    if order.status != "dispatched":
        raise HTTPException(409, f"현재 '{state_ko(order.status)}' 상태에서는 수거할 수 없음")
    weights = check_weights(session, order, body)
    listing = session.get(Listing, order.listing_id)
    diff = pct_diff(kg_sum(weights), listing.total_kg)
    warning = f"등록 무게와 {pct_text(diff)} 차이" if diff > TOLERANCE_PCT else None
    change_status(session, order, "picked_up", me.id, note=warning, pickup_weights=weights, picked_up_at=now(),
                  weight_warning=warning)
    session.commit()
    # 차량 번호를 주면 출고하면서 인계서 운반자 칸과(판매자 운송이면) 배출자 칸을 함께 쓴다
    if body.vehicle_no:
        if listing.factory_id == me.id and "emitter" not in sections(session, order.id):
            save_section(session, order, "emitter", emitter_data(session, order, listing, me))
        save_section(session, order, "carrier", carrier_data(order, me, body.vehicle_no))
    return {"status": order.status, **({"weight_warning": warning} if warning else {})}


@router.post("/orders/{order_id}/inspect")
def inspect(order_id: int, body: InspectIn, me: Company = Depends(current_company),
            session: Session = Depends(get_session)):
    order = my_order_as(session, order_id, me, "recycler")
    if order.status not in ("picked_up", "arrived"):
        raise HTTPException(409, f"현재 '{state_ko(order.status)}' 상태에서는 검사할 수 없음")
    weights = check_weights(session, order, body)
    listing = session.get(Listing, order.listing_id)
    diff = pct_diff(kg_sum(weights), listing.total_kg)
    saved = {"inspect_weights": weights, "inspect_note": body.note}
    if order.status == "picked_up":   # 물건을 받는 구매자가 도착과 검사를 한 번에 기록
        change_status(session, order, "arrived", me.id)
    if not body.passed or diff > TOLERANCE_PCT:
        reason = "검사 불합격" if not body.passed else f"무게 차이 {pct_text(diff)}"
        change_status(session, order, "disputed", me.id, note=reason, dispute_reason=reason, **saved)  # 운영자 중재 대기
        session.commit()
        return {"status": order.status, "dispute_reason": reason}
    # 허용 오차 안: 검사 무게 × 단가로 비례 정산
    change_status(session, order, "confirmed", me.id, **saved)
    settlement = settle(order, goods_by_weight(weights, order_unit_price(order, listing)))
    change_status(session, order, "settled", None, settlement=settlement)
    pg_set(session, order, "captured")
    session.commit()
    return {"status": order.status, "settlement": order.settlement}


@router.post("/orders/{order_id}/cancel")
def cancel(order_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    order = my_order_as(session, order_id, me, "recycler")
    change_status(session, order, "cancelled", me.id, settlement={"refund_krw": order.held_krw})
    pg_set(session, order, "refunded")
    session.execute(update(Listing).where(Listing.id == order.listing_id, Listing.status == "sold")
                    .values(status="posted"))  # 다시 게시
    session.commit()
    return {"status": order.status, "refund_krw": order.held_krw}


@router.post("/admin/orders/{order_id}/resolve")
def resolve(order_id: int, body: ResolveIn, me: Company = Depends(current_company),
            session: Session = Depends(get_session)):
    need_role(me, "operator")
    order = get_or_404(session, Order, order_id)
    if order.status != "disputed":
        raise HTTPException(409, f"현재 '{state_ko(order.status)}' 상태에서는 중재할 수 없음")
    listing = session.get(Listing, order.listing_id)
    if body.resolution == "regrade":
        if body.new_price_krw_per_kg is None:
            raise HTTPException(400, "재등급(regrade)에는 새 단가 입력 필요")
        if dec(body.new_price_krw_per_kg) > dec(order_unit_price(order, listing)):
            raise HTTPException(400, "새 단가는 원래 단가 이하만 가능")
        settlement, to = settle(order, goods_by_weight(order.inspect_weights, body.new_price_krw_per_kg)), "settled"
    elif body.resolution == "treat":
        if body.treatment_fee_krw is None:
            raise HTTPException(400, "처리(treat)에는 처리 비용 입력 필요")
        settlement, to = settle(order, 0, goods_refunded=True, factory_charge_krw=body.treatment_fee_krw,
                                recycler_fee_krw=body.treatment_fee_krw), "settled"
    else:
        settlement, to = settle(order, 0, goods_refunded=True), "returned"
    settlement = {**settlement, "resolution": body.resolution, "note": body.note}
    if body.resolution != "regrade":
        settlement["legal_note"] = LEGAL_NOTE
    change_status(session, order, to, me.id, note=f"{body.resolution}: {body.note}", settlement=settlement)
    pg_set(session, order, "captured")
    if body.resolution == "return":
        free_bags(session, listing)
    session.commit()
    return {"status": order.status, "settlement": order.settlement, **({"legal_note": LEGAL_NOTE} if "legal_note" in settlement else {})}


@router.get("/me/orders")
def my_orders(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    return list_my_orders(session, me)


@router.get("/orders/{order_id}")
def get_order(order_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    order, listing = order_party(session, order_id, me)
    out = without_hauler_line(order, order_dict(session, order, listing))
    names = {"factory_name": listing.factory_id, "recycler_name": order.recycler_id, "hauler_name": order.hauler_id}
    out.update({key: session.get(Company, cid).name if cid else None for key, cid in names.items()})
    out["waste_name"] = waste_names().get(listing.waste_code, listing.waste_code)
    out["grade"] = listing.grade
    shows_qr = listing.factory_id == me.id   # QR은 그 마대를 가진 판매자에게만(구매자·다른 공장에는 주지 않음, §20)
    passes = {p.bag_id: p.id for p in session.query(BagPass).filter(BagPass.bag_id.in_(out["bag_ids"]))} if out["bag_ids"] else {}
    out["bags"] = [{"id": b.id, "total_kg": b.total_kg, "target_material": b.target_material, "grade": b.grade,
                    "purity": b.purity, "has_photo": b.photo_type is not None,
                    **({"qr": f"MDP-{passes[b.id]}-{b.id}" if b.id in passes else None} if shows_qr else {})}
                   for b in listing_bags(session, order)]
    return out


@router.get("/me/impact")
def impact(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """이번 달(KST) 정산이 끝난 거래의 kg·건수. carbon_kg는 근거 있는 계수가 없어 null."""
    month = datetime.now(KST).strftime("%Y-%m")
    col = {"recycler": Order.recycler_id, "factory": Listing.factory_id}.get(me.role)
    kg, count = 0.0, 0
    if col is not None:
        q = (session.query(Order, OrderHistory.at).join(Listing, Listing.id == Order.listing_id)
             .join(OrderHistory, OrderHistory.order_id == Order.id)
             .filter(col == me.id, Order.status.in_(("settled", "rated")), OrderHistory.to_status == "settled"))
        for o, at in q:
            if to_kst(at).strftime("%Y-%m") == month:
                count += 1
                kg += float(kg_sum(o.inspect_weights)) if o.inspect_weights else session.get(Listing, o.listing_id).total_kg
    return {"month": month, "role": me.role, "kg": round(kg, 3), "order_count": count, "carbon_kg": None}


MAX_PHOTOS_PER_STAGE = 10


INSPECT_STATES = ("picked_up", "arrived", "confirmed", "disputed", "settled", "rated", "returned")


@router.get("/orders/{order_id}/photos")
def list_photos(order_id: int, stage: str | None = None,
                me: Company = Depends(current_company), session: Session = Depends(get_session)):
    party_order(session, order_id, me)
    if stage not in (None, "", "pickup", "inspect"):
        raise HTTPException(400, "단계는 pickup 또는 inspect만 가능")
    q = session.query(OrderPhoto).filter_by(order_id=order_id)
    if stage:
        q = q.filter_by(stage=stage)
    return [photo_dict(p) for p in q.order_by(OrderPhoto.id)]


@router.get("/orders/{order_id}/photos/{photo_id}")
def get_photo(order_id: int, photo_id: int, me: Company = Depends(current_company),
              session: Session = Depends(get_session)):
    party_order(session, order_id, me)
    p = get_or_404(session, OrderPhoto, photo_id)
    if p.order_id != order_id:
        raise HTTPException(404, "사진을 찾을 수 없음")
    return file_response(p.data, p.content_type)


@router.post("/orders/{order_id}/photos", status_code=201)
def add_photo(order_id: int, body: PhotoIn, me: Company = Depends(current_company),
              session: Session = Depends(get_session)):
    order, _ = party_order(session, order_id, me)
    uploader = order.hauler_id if body.stage == "pickup" else order.recycler_id   # pickup=배정 업체, inspect=구매 업체
    if me.id != uploader:
        raise HTTPException(403, "이 단계의 사진을 올릴 수 있는 당사자가 아님")
    allowed = order.status in INSPECT_STATES if body.stage == "inspect" else order.status not in ("ordered", "payment_held", "cancelled")
    if not allowed:
        raise HTTPException(409, f"현재 '{state_ko(order.status)}' 상태에서는 사진을 올릴 수 없음")
    if session.query(OrderPhoto).filter_by(order_id=order.id, stage=body.stage).count() >= MAX_PHOTOS_PER_STAGE:
        raise HTTPException(409, f"단계별 사진은 {MAX_PHOTOS_PER_STAGE}장까지 올릴 수 있음")
    p = OrderPhoto(order_id=order.id, stage=body.stage, uploader_id=me.id, content_type=body.content_type,
                   data=decode_upload(body.content_type, body.data_base64))
    session.add(p)
    session.commit()
    return photo_dict(p)
