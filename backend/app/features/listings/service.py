"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.deps import get_or_404
from app.core.util import dec, iso
from app.db.models import Bag, BagPass, Company, Favorite, Listing, Order, Rating
from app.features.market.service import market_for
from app.tools.calc import coarse_km, haversine_km


def brief(l: Listing) -> dict:
    return {"id": l.id, "status": l.status, "waste_code": l.waste_code, "grade": l.grade, "total_kg": l.total_kg,
            "price_krw_per_kg": l.price_krw_per_kg}


def wname(code: str) -> str:
    return waste_names().get(code, code)


def listing_bags(session: Session, l: Listing) -> list[Bag]:
    return session.query(Bag).filter_by(listing_id=l.id).order_by(Bag.id).all()


def factory_rating(session: Session, factory_id: int) -> float | None:
    avg = session.query(func.avg(Rating.score)).filter(Rating.target_company_id == factory_id,
                                                       Rating.target == "factory").scalar()
    return round(float(avg), 2) if avg is not None else None


def listing_item(session: Session, l: Listing, me: Company | None, favorites: set[int] | None = None) -> dict:
    """목록·찜·묶음이 함께 쓰는 매물 한 줄. me가 없으면 distance_km·favorite는 null/false."""
    bags, factory = listing_bags(session, l), session.get(Company, l.factory_id)
    rated = [(dec(b.purity), dec(b.total_kg)) for b in bags if b.purity is not None]
    weight = sum((kg for _, kg in rated), Decimal(0))
    material = bags[0].target_material if bags else None
    market = market_for(material)
    issued = session.query(func.min(BagPass.issued_at)).join(Bag, Bag.id == BagPass.bag_id).filter(Bag.listing_id == l.id).scalar()
    if favorites is None:
        favorites = {f.listing_id for f in session.query(Favorite).filter_by(company_id=me.id)} if me else set()
    return {**brief(l), "factory_id": l.factory_id, "waste_name": wname(l.waste_code),
            "bag_count": len(bags), "factory_name": factory.name, "region": factory.region,
            "target_material": material, "market": market,
            "purity_avg": round(float(sum((p * kg for p, kg in rated), Decimal(0)) / weight), 4) if weight else None,
            "distance_km": coarse_km(haversine_km(me.lat, me.lon, factory.lat, factory.lon)) if me else None,
            "price_vs_market_pct": round(float((dec(l.price_krw_per_kg) - dec(market["price"])) / dec(market["price"]) * 100), 1)
            if market and market["price"] else None,
            "favorite": l.id in favorites,
            "available_from": l.available_from.isoformat() if l.available_from else None,
            "pickup_note": l.pickup_note, "factory_rating": factory_rating(session, l.factory_id),
            "factory_rating_count": session.query(func.count(Rating.id)).filter(Rating.target_company_id == l.factory_id, Rating.target == "factory").scalar() or 0,
            "issued_at": iso(issued)}


def listing_items(session: Session, me: Company | None, waste_code: str | None = None, q: str | None = None,
                  grade: str | None = None, sort: str | None = None, limit: int | None = None, offset: int = 0) -> list[dict]:
    query = session.query(Listing).filter(Listing.status == "posted")
    if waste_code:
        if waste_code not in waste_names():
            return []
        query = query.filter(Listing.waste_code == waste_code)
    if grade:
        query = query.filter(Listing.grade == grade)
    favorites = {f.listing_id for f in session.query(Favorite).filter_by(company_id=me.id)} if me else set()
    out = [listing_item(session, l, me, favorites) for l in query.order_by(Listing.id)]
    if q and q.strip():
        needle = q.strip().casefold()
        out = [i for i in out if needle in " ".join(str(i[k] or "") for k in ("target_material", "waste_name", "waste_code", "factory_name", "region")).casefold()]
    if sort == "price":
        out.sort(key=lambda i: (i["price_krw_per_kg"], i["id"]))
    elif sort == "distance":
        out.sort(key=lambda i: (i["distance_km"] is None, i["distance_km"] or 0, i["id"]))
    elif sort == "recent":
        out.sort(key=lambda i: -i["id"])
    return out[offset:offset + limit] if limit is not None else out[offset:]


def visible_listing(session: Session, listing_id: int, me: Company) -> Listing:
    l = get_or_404(session, Listing, listing_id)
    if l.status != "posted" and me.role != "operator" and me.id != l.factory_id:
        # posted 말고는(sold·withdrawn·bundle_wait) 판매 공장·주문 당사자·operator만 (§9.4, §17)
        party = session.query(Order).filter(Order.listing_id == l.id,
                                            (Order.recycler_id == me.id) | (Order.hauler_id == me.id)).first()
        if party is None:
            raise HTTPException(404, "판매를 찾을 수 없음")
    return l


def former_bags(session: Session, l: Listing) -> list[dict]:
    """내린 판매에 들어 있던 마대. withdraw가 마대 이력(Bag.history)에 남긴 기록으로 복원한다(DB 구조 변경 없음).
    available = 지금 다른 판매에 안 들어 있고 등급이 있어 POST /listings의 bag_ids로 다시 올릴 수 있는지."""
    out = []
    for b in session.query(Bag).filter_by(factory_id=l.factory_id).order_by(Bag.id):
        if any(h.get("event") == "withdrawn" and h.get("listing_id") == l.id for h in (b.history or [])):
            out.append({"id": b.id, "target_material": b.target_material, "weight_kg": b.total_kg, "grade": b.grade,
                        "available": b.listing_id is None and b.grade is not None})
    return out


def list_my_listings(session: Session, me: Company) -> list[dict]:
    """내 판매 목록(판매자 화면·판매자 첫 화면이 함께 쓴다). 역할 검사는 부르는 쪽이 한다."""
    out = []
    for l in session.query(Listing).filter_by(factory_id=me.id).order_by(Listing.id.desc()):
        order = (session.query(Order).filter(Order.listing_id == l.id, Order.status != "cancelled")
                 .order_by(Order.id.desc()).first())
        item = {**brief(l), "mode": l.mode, "waste_name": wname(l.waste_code),
                "bag_ids": [b.id for b in listing_bags(session, l)], "order_id": order.id if order else None}
        if l.status == "withdrawn":
            item["former_bags"] = former_bags(session, l)
            item["target_material"] = item["former_bags"][0]["target_material"] if item["former_bags"] else None
        out.append(item)
    return out

