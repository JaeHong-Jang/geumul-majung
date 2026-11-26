"""구매 희망: 구매자가 사고 싶은 원료를 올리고, 판매 공장이 열린 요청을 본다."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.agents.sorting.intake import find_materials
from app.core.deps import current_company, get_or_404, need_role
from app.core.util import KST, now
from app.db.models import BuyRequest, Company
from app.db.session import get_session
from app.features._shared.flows import call_flow
from app.features._shared.schemas import Name, Note, Price, Text500, WasteCode
from app.features._shared.voice import IntakeIn, agent_steps, hear, stt_status
from app.features.listings.service import listing_items
from app.features.notifications.service import notify_companies
from app.tools.calc import canon_material, coarse_km, fmt, haversine_km

router = APIRouter(prefix="/v1")

MAX_QTY_KG = 1_000_000   # 한 요청 최대 1,000톤


class BuyRequestIn(BaseModel):
    material: Name
    item: Name
    waste_code: WasteCode | None = None
    qty_kg: float = Field(gt=0, le=MAX_QTY_KG, allow_inf_nan=False)
    price_krw_per_kg: Price | None = None
    price_min_krw_per_kg: Price | None = None   # 희망 가격 하한(원/kg)
    price_max_krw_per_kg: Price | None = None   # 희망 가격 상한(원/kg)
    negotiable: bool = True                     # 가격 협상 가능 여부
    price_unit: Literal["kg", "ton"] = "kg"
    need_by: date | None = None
    repeat: Literal["once", "monthly"] = "once"
    delivery_address: Text500 | None = None
    note: Note | None = None


    @model_validator(mode="after")
    def _range(self):
        lo, hi = self.price_min_krw_per_kg, self.price_max_krw_per_kg
        if (lo is None) != (hi is None):
            raise ValueError("희망 가격은 하한가와 상한가를 함께 입력")
        if lo is not None and hi is not None:
            if lo > hi:
                raise ValueError("하한가는 상한가 이하여야 함")
            self.price_krw_per_kg = hi   # 예전 화면, 판매자 목록이 읽는 한 가격은 상한가
        return self


class StatusIn(BaseModel):
    status: Literal["open", "closed"]


def as_dict(r: BuyRequest, buyer: Company | None = None, me: Company | None = None) -> dict:
    out = {"id": r.id, "material": r.material, "item": r.item, "waste_code": r.waste_code, "qty_kg": r.qty_kg,
           "price_krw_per_kg": r.price_krw_per_kg, "price_unit": r.price_unit,
           "price_min_krw_per_kg": r.price_min_krw_per_kg, "price_max_krw_per_kg": r.price_max_krw_per_kg,
           "negotiable": r.negotiable is not False,
           "need_by": r.need_by.isoformat() if r.need_by else None, "repeat": r.repeat,
           "delivery_address": r.delivery_address, "note": r.note, "status": r.status,
           "created_at": r.created_at.isoformat(), "updated_at": r.updated_at.isoformat()}
    if buyer is not None:
        out |= {"buyer_name": buyer.name, "region": buyer.region}
        if me is not None:
            out["distance_km"] = coarse_km(haversine_km(me.lat, me.lon, buyer.lat, buyer.lon))
    return out


def mine(session: Session, request_id: int, me: Company) -> BuyRequest:
    r = get_or_404(session, BuyRequest, request_id)
    if r.recycler_id != me.id:
        raise HTTPException(404, "요청한 항목을 찾을 수 없음")
    return r


def open_listings(session: Session, me: Company, material: str) -> list[dict]:
    """게시 중인 같은 재질 매물(희망가 추천과 판매 매물 맞추기 근거). 화면용 전체 항목."""
    want = canon_material(material)
    return [i for i in listing_items(session, me) if i["target_material"] and canon_material(i["target_material"]) == want]


SLIM = ("id", "factory_id", "factory_name", "region", "target_material", "total_kg", "price_krw_per_kg", "distance_km")


def slim(items: list[dict]) -> list[dict]:
    """에이전트에 넘기고 실행 기록에 남는 칸만(거리는 대략 km, 좌표 없음)."""
    return [{k: i[k] for k in SLIM} for i in items]


def match_view(result, items: list[dict]) -> dict:
    """판매 매물 맞추기 결과에 화면이 그릴 매물 한 줄을 붙인다."""
    d = _agent_data(result, "want_match")
    by_id = {i["id"]: i for i in items}
    return {"count": d.get("count", 0), "fit_all": d.get("fit_all", 0),
            "matches": [{**{k: m[k] for k in ("price_fit", "qty_fit", "reasons")}, "listing": by_id[m["id"]]}
                        for m in d.get("matches", []) if m["id"] in by_id]}


def _agent_data(result, agent_id: str) -> dict:
    return next((r.data for r in result.results if r.agent_id == agent_id), {}) or {}


def _price_view(result) -> dict:
    d = _agent_data(result, "want_price")
    return {"auto": d.get("auto"), "market": d.get("market"), "listings": d.get("listings")}


@router.get("/buy-requests/intake/status")
def intake_status(me: Company = Depends(current_company)):
    """구매 희망 화면을 열 때 부른다: 음성 인식 사용 가능 여부."""
    need_role(me, "recycler")
    return stt_status()


@router.post("/buy-requests/intake")
def want_intake(body: IntakeIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """녹음(또는 글) → 음성 인식 → 구매 희망 정리 → 희망가 추천. 칸 값만 돌려주고 구매 희망은 올리지 않는다(사람이 확인 후 제출)."""
    need_role(me, "recycler")
    transcript, steps = hear(body)
    ctx = {"transcript": transcript, "today": now().astimezone(KST).date().isoformat(), "skip_llm_summary": True}
    mats = find_materials(transcript)   # 재질을 먼저 알아야 같은 재질 매물을 희망가 추천과 매물 맞추기에 넘길 수 있다
    items = open_listings(session, me, mats[0]) if mats else []
    ctx["listings"] = slim(items)
    result = call_flow(session, "want_intake", ctx, [me.id])
    if result is None:
        raise HTTPException(503, "AI 정리를 지금 사용할 수 없음")
    data = _agent_data(result, "want_intake")
    return {"transcript": transcript, "fields": data.get("fields", {}), "sources": data.get("sources", {}),
            "price": _price_view(result), "match": match_view(result, items),
            "steps": steps + agent_steps(result), "run_id": result.run_id}


@router.get("/buy-requests/price-suggest")
def price_suggest(material: str = Query(min_length=1, max_length=100), me: Company = Depends(current_company),
                  session: Session = Depends(get_session)):
    """재질을 고르면 희망가 추천 에이전트가 시세와 판매 중 매물로 희망 가격 범위를 낸다."""
    need_role(me, "recycler")
    ctx = {"material": material, "listings": slim(open_listings(session, me, material)), "skip_llm_summary": True}
    result = call_flow(session, "want_price", ctx, [me.id])
    if result is None:
        raise HTTPException(503, "희망가 추천을 지금 사용할 수 없음")
    return {**_price_view(result), "steps": agent_steps(result), "run_id": result.run_id}


@router.get("/buy-requests/match")
def match(material: str = Query(min_length=1, max_length=100), qty_kg: float | None = Query(None, gt=0, le=MAX_QTY_KG),
          price_max: float | None = Query(None, gt=0, le=100_000), me: Company = Depends(current_company),
          session: Session = Depends(get_session)):
    """구매 희망 칸(재질, 수량, 상한가)으로 지금 판매 중인 매물을 맞춰 본다. 화면은 칸이 바뀔 때마다 부른다."""
    need_role(me, "recycler")
    items = open_listings(session, me, material)
    ctx = {"want": {"material": material, "qty_kg": qty_kg, "price_max_krw_per_kg": price_max},
           "listings": slim(items), "skip_llm_summary": True}
    result = call_flow(session, "want_match", ctx, [me.id])
    if result is None:
        raise HTTPException(503, "판매 매물 맞추기를 지금 사용할 수 없음")
    return {**match_view(result, items), "steps": agent_steps(result), "run_id": result.run_id}


def notify_matching_sellers(session: Session, me: Company, r: BuyRequest) -> None:
    """새 구매 희망과 재질이 같은 매물을 판매 중인 공장에 알린다(상한가 안이거나 협상 가능일 때)."""
    hi = r.price_max_krw_per_kg or r.price_krw_per_kg
    ids = {i["factory_id"] for i in open_listings(session, me, r.material)
           if hi is None or r.negotiable is not False or i["price_krw_per_kg"] <= hi}
    if ids:
        qty = f"{fmt(r.qty_kg / 1000)}t" if r.qty_kg >= 1000 else f"{fmt(r.qty_kg)}kg"
        notify_companies(session, ids, "구매 희망 맞음", f"{me.name} {r.material} {qty} 구매 희망, 판매 중인 내 매물과 재질 같음")


@router.post("/buy-requests", status_code=201)
def create(body: BuyRequestIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler", verified=True)
    if body.need_by and body.need_by < date.today():
        raise HTTPException(400, "희망 시기는 오늘 이후여야 함")
    r = BuyRequest(recycler_id=me.id, **body.model_dump())
    session.add(r)
    session.commit()
    notify_matching_sellers(session, me, r)
    session.commit()
    return as_dict(r)


@router.get("/me/buy-requests")
def list_mine(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    rows = session.query(BuyRequest).filter_by(recycler_id=me.id).order_by(BuyRequest.id.desc()).all()
    return [as_dict(r) for r in rows]


@router.put("/buy-requests/{request_id}")
def update(request_id: int, body: BuyRequestIn, me: Company = Depends(current_company),
           session: Session = Depends(get_session)):
    need_role(me, "recycler", verified=True)
    r = mine(session, request_id, me)
    for k, v in body.model_dump().items():
        setattr(r, k, v)
    r.updated_at = now()
    session.commit()
    return as_dict(r)


@router.post("/buy-requests/{request_id}/status")
def set_status(request_id: int, body: StatusIn, me: Company = Depends(current_company),
               session: Session = Depends(get_session)):
    need_role(me, "recycler")
    r = mine(session, request_id, me)
    r.status, r.updated_at = body.status, now()
    session.commit()
    return as_dict(r)


@router.delete("/buy-requests/{request_id}", status_code=204)
def delete(request_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    session.delete(mine(session, request_id, me))
    session.commit()


@router.get("/buy-requests")
def list_open(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """판매 공장이 보는 열린 구매 희망(가까운 순). 판매자 화면 연결은 다음 단계."""
    need_role(me, "factory", "operator")
    rows = session.query(BuyRequest, Company).join(Company, Company.id == BuyRequest.recycler_id)\
        .filter(BuyRequest.status == "open").all()
    items = [as_dict(r, c, me) for r, c in rows]
    return sorted(items, key=lambda i: (i["distance_km"], -i["id"]))
