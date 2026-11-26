"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, update
from sqlalchemy.orm import Session

from app.core.deps import current_company, get_or_404, need_role, optional_company
from app.core.util import dec, dsum, iso, MAX_GOODS, MAX_ID, now, won
from app.db.models import Bag, BagPass, BagPhoto, Company, Listing, ListingTerms, Order, PoolMember
from app.db.session import get_session
from app.features._shared.flows import call_flow, dump
from app.features.listings.schemas import ListingIn, ListingPatch
from app.features.listings.service import (
    brief,
    former_bags,
    list_my_listings,
    listing_bags,
    listing_item,
    listing_items,
    visible_listing,
    wname,
)
from app.features.market.service import market_for
from app.features.pools.service import drop_listing


router = APIRouter(prefix="/v1")



def save_terms(session: Session, listing_id: int, transport: str | None, ship_hours: str | None,
               unload_forklift: bool | None = None, unload_crane: bool | None = None) -> None:
    """판매자가 적은 운송 방법, 출고 시간, 하차 지원을 저장(있으면 고친다)."""
    if transport is None and ship_hours is None and unload_forklift is None and unload_crane is None:
        return
    t = session.query(ListingTerms).filter_by(listing_id=listing_id).first()
    if t is None:
        t = ListingTerms(listing_id=listing_id, transport=transport or "own")
        session.add(t)
    if transport is not None:
        t.transport = transport
    if ship_hours is not None:
        t.ship_hours = ship_hours.strip() or None
    if unload_forklift is not None:
        t.unload_forklift = unload_forklift
    if unload_crane is not None:
        t.unload_crane = unload_crane


def terms_dict(session: Session, listing_id: int) -> dict:
    t = session.query(ListingTerms).filter_by(listing_id=listing_id).first()
    return {"transport": t.transport if t else "own", "ship_hours": t.ship_hours if t else None,
            "unload_forklift": bool(t and t.unload_forklift), "unload_crane": bool(t and t.unload_crane),
            "freight_payer": "seller"}

@router.post("/listings", status_code=201)
def create_listing(body: ListingIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory", verified=True)   # 가입 승인 전에는 만들 수 없음(§13.1)
    bags = [session.get(Bag, i) if 1 <= i <= MAX_ID else None for i in body.bag_ids]
    if any(b is None for b in bags):
        raise HTTPException(404, "없는 등록 물품")
    if any(b.factory_id != me.id for b in bags):
        raise HTTPException(403, "내 등록 물품 아님")
    if any(session.query(BagPass).filter_by(bag_id=b.id).first() is None for b in bags):
        raise HTTPException(409, "통과증이 없는 등록 물품")
    if len({(b.waste_code, b.grade) for b in bags}) != 1:
        raise HTTPException(400, "폐기물 코드와 등급이 모두 같은 물품만 함께 팔 수 있음")
    if any(b.listing_id is not None for b in bags):
        raise HTTPException(409, "이미 다른 판매에 묶인 물품")
    total_kg = float(dsum(b.total_kg for b in bags))
    if won(dec(total_kg) * dec(body.price_krw_per_kg)) > MAX_GOODS:
        raise HTTPException(400, "판매 1건의 물건값은 100억 원 이하만 가능")
    l = Listing(factory_id=me.id, mode=body.mode, status="bundle_wait" if body.mode == "bundle" else "posted",
                waste_code=bags[0].waste_code, grade=bags[0].grade, total_kg=total_kg,
                price_krw_per_kg=body.price_krw_per_kg, available_from=body.available_from,
                pickup_note=body.pickup_note)
    session.add(l)
    session.flush()
    save_terms(session, l.id, body.transport, body.ship_hours, body.unload_forklift, body.unload_crane)
    # 마대 선점: 아직 안 묶인 마대만 한 번에 묶는다. 개수가 다르면 전부 롤백(동시 요청 방어)
    # 통과증이 있고 판매 등급과 같은 마대만(재등급과 경합하면 개수가 달라져 409)
    got = session.execute(update(Bag).where(Bag.id.in_([b.id for b in bags]), Bag.listing_id.is_(None),
                                            Bag.grade == l.grade,
                                            exists().where(BagPass.bag_id == Bag.id, BagPass.grade == l.grade))
                          .values(listing_id=l.id), execution_options={"synchronize_session": False})
    if got.rowcount != len(bags):
        session.rollback()
        raise HTTPException(409, "이미 다른 판매에 묶인 물품")
    others = session.query(Listing).filter(Listing.status.in_(("posted", "bundle_wait")), Listing.id != l.id).all()
    owners = {c.id: c for c in session.query(Company).filter(Company.id.in_({o.factory_id for o in others}))}
    ctx = {"listing": {**brief(l), "mode": l.mode, "factory_id": me.id},
           "bags": [{"id": b.id, "target_material": b.target_material, "total_kg": b.total_kg, "grade": b.grade} for b in bags],
           "nearby_listings": [{**brief(o), "factory_id": o.factory_id, "lat": owners[o.factory_id].lat,
                                "lon": owners[o.factory_id].lon} for o in others],
           "factory": {"id": me.id, "name": me.name, "lat": me.lat, "lon": me.lon}}
    advice = call_flow(session, "listing_advice", ctx, [me.id])  # 호출 전 commit됨
    return {**brief(l), "advice": dump(advice)}


@router.get("/listings")
def list_listings(waste_code: str | None = None, q: str | None = Query(default=None, max_length=100),
                  grade: str | None = None, sort: str | None = None, limit: str | None = None, offset: str | None = None,
                  me: Company | None = Depends(optional_company), session: Session = Depends(get_session)):
    # 앱이 `?q=&grade=&sort=distance`처럼 빈 값을 보내므로 빈 문자열은 '없음'으로 본다. 값이 있는데 틀리면 400.
    grade, sort = grade or None, sort or None
    if grade not in (None, "A", "B", "C") or sort not in (None, "price", "distance", "recent"):
        raise HTTPException(400, "등급은 A, B, C, 정렬은 price, distance, recent 중 선택 필요")
    try:   # 빈 값은 기본값. limit 기본 50·최대 200(그 이상은 200으로), offset 기본 0
        n = int(limit) if limit else 50
        skip = int(offset) if offset else 0
    except ValueError:
        raise HTTPException(400, "limit, offset은 정수만 가능")
    if n < 1 or skip < 0:
        raise HTTPException(400, "limit은 1 이상, offset은 0 이상만 가능")
    return listing_items(session, me, waste_code, q, grade, sort, min(n, 200), skip)


@router.get("/me/listings")
def my_listings(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    return list_my_listings(session, me)


@router.get("/listings/{listing_id}")
def get_listing(listing_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    l = visible_listing(session, listing_id, me)
    bags = listing_bags(session, l)
    from app.tools.calc import known_materials, normalize_items
    known = known_materials()
    mats: dict[str, Decimal] = {}
    for b in bags:
        for it in b.items:
            k = next(iter(normalize_items([{"material": it["material"], "kg": 1}])), "")  # 별칭 → 표준 이름
            k = k if k in known else "기타"  # 계약 9.3: 공개 화면에 사용자 재질명 원문 금지
            mats[k] = mats.get(k, Decimal(0)) + dec(it["kg"])
    total = sum(mats.values(), Decimal(0))
    purities = [(dec(b.purity), dec(b.total_kg)) for b in bags if b.purity is not None]
    weight = sum((kg for _, kg in purities), Decimal(0))
    f = session.get(Company, l.factory_id)
    passes = {p.bag_id: p.id for p in session.query(BagPass).filter(BagPass.bag_id.in_([b.id for b in bags]))} if bags else {}
    photo_ids: dict[int, list[int]] = {}
    for pid, bid in (session.query(BagPhoto.id, BagPhoto.bag_id).filter(BagPhoto.bag_id.in_([b.id for b in bags]))
                     .order_by(BagPhoto.id) if bags else []):
        photo_ids.setdefault(bid, []).append(pid)
    # 통과증 번호와 QR은 소유 공장과 배정된 운반 업체에게만(QR을 알면 수거 스캔을 흉내 낼 수 있음)
    shows_qr = me.id == l.factory_id or session.query(Order.id).filter(Order.listing_id == l.id, Order.hauler_id == me.id).first() is not None
    extra = listing_item(session, l, me)
    former = former_bags(session, l) if l.status == "withdrawn" and me.id == l.factory_id else None
    return {**brief(l), "waste_name": wname(l.waste_code),
            **({"former_bags": former} if former is not None else {}),
            "target_material": bags[0].target_material if bags else (former[0]["target_material"] if former else None),
            "market": market_for(bags[0].target_material if bags else None),
            **{k: extra[k] for k in ("distance_km", "price_vs_market_pct", "favorite", "available_from", "pickup_note",
                                     "factory_rating", "factory_rating_count", "issued_at")},
            "factory_id": l.factory_id,
            "terms": terms_dict(session, l.id),
            "seller_notes": list(dict.fromkeys(b.note.strip() for b in bags if b.note and b.note.strip())),
            "purity_avg": round(float(sum((p * kg for p, kg in purities), Decimal(0)) / weight), 4) if weight else None,
            "composition": {k: round(float(v / total), 4) for k, v in mats.items()} if total else {},
            "bag_count": len(bags), "factory_name": f.name, "region": f.region,
            "bags": [{"id": b.id, "total_kg": b.total_kg, "grade": b.grade, "purity": b.purity,
                      "pass_id": passes.get(b.id) if shows_qr else None,
                      "qr": f"MDP-{passes[b.id]}-{b.id}" if shows_qr and b.id in passes else None,
                      "pass_issued": b.id in passes,   # 통과증 발급 여부(번호는 당사자에게만 보이지만 발급 사실은 누구나 본다)
                      "has_photo": b.photo_type is not None or b.id in photo_ids,
                      "photo_ids": photo_ids.get(b.id, [])} for b in bags],
            "area": {"lat": round(f.lat, 2), "lon": round(f.lon, 2)}}


@router.post("/listings/{listing_id}/withdraw")
def withdraw_listing(listing_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    l = get_or_404(session, Listing, listing_id)
    if l.factory_id != me.id:
        raise HTTPException(403, "내 판매 아님")
    got = session.execute(update(Listing).where(Listing.id == l.id, Listing.status.in_(("posted", "bundle_wait")))
                          .values(status="withdrawn"), execution_options={"synchronize_session": False})
    if got.rowcount == 0:
        raise HTTPException(409, "게시 중이거나 묶음 대기 중인 판매만 내릴 수 있음")
    for bag in session.query(Bag).filter_by(listing_id=l.id):   # 어느 판매에서 내려왔는지 마대 이력에 남긴다(새 표 없이 복구, §20)
        bag.history = [*(bag.history or []), {"event": "withdrawn", "listing_id": l.id, "at": iso(now())}]
    session.flush()
    session.execute(update(Bag).where(Bag.listing_id == l.id).values(listing_id=None),
                    execution_options={"synchronize_session": False})  # 마대 풀림
    drop_listing(session, l.id)   # 공동판매에 들어 있었다면 참여도 뺀다(§13.2)
    session.commit()
    return {"id": l.id, "status": "withdrawn"}


@router.patch("/listings/{listing_id}")
def patch_listing(listing_id: int, body: ListingPatch, me: Company = Depends(current_company),
                  session: Session = Depends(get_session)):
    need_role(me, "factory")
    l = get_or_404(session, Listing, listing_id)
    if l.factory_id != me.id:
        raise HTTPException(404, "판매를 찾을 수 없음")
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    transport, ship_hours = changes.pop("transport", None), changes.pop("ship_hours", None)
    forklift, crane = changes.pop("unload_forklift", None), changes.pop("unload_crane", None)
    if "price_krw_per_kg" in changes and won(dec(l.total_kg) * dec(changes["price_krw_per_kg"])) > MAX_GOODS:
        raise HTTPException(400, "판매 1건의 물건값은 100억 원 이하만 가능")
    if "price_krw_per_kg" in changes and session.query(PoolMember).filter_by(listing_id=l.id).first():
        raise HTTPException(409, "공동판매에 참여 중인 판매는 단가를 바꿀 수 없음(공동 단가는 참여 단가 중 최저로 결정)")
    # 조건부 UPDATE: 그 사이 팔렸거나 내려간 판매는 고치지 못한다
    got = session.execute(update(Listing).where(Listing.id == l.id, Listing.status.in_(("posted", "bundle_wait")))
                          .values(**(changes or {"status": l.status})), execution_options={"synchronize_session": False})
    if got.rowcount == 0:
        raise HTTPException(409, "게시 중이거나 묶음 대기 중인 판매만 고칠 수 있음")
    save_terms(session, l.id, transport, ship_hours, forklift, crane)
    session.commit()
    session.refresh(l)
    return listing_item(session, l, me)
