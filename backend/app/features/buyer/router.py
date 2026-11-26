"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import current_company, get_or_404, need_role
from app.db.models import Address, Company, Favorite, Listing, Order
from app.db.session import get_session
from app.features.buyer.schemas import AddressIn, InterestsIn
from app.features.buyer.service import address_dict, buyer_bundles, interests_of, own_address, recommended
from app.features.companies.service import me_dict
from app.features.listings.service import factory_rating, listing_item, listing_items, visible_listing
from app.features.market.service import latest_prices, market_volumes
from app.features.notifications.service import unread_count
from app.features.orders.service import list_my_orders


router = APIRouter(prefix="/v1")


ACTIVE = ("payment_held", "dispatched", "picked_up", "arrived", "disputed")


@router.get("/buyer/bundles")
def buyer_bundles_route(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    return buyer_bundles(session, me)


@router.get("/buyer/home")
def buyer_home(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    orders = list_my_orders(session, me)
    items = listing_items(session, me, sort="recent")      # 가장 최근에 올린 매물이 위로
    return {"company": me_dict(me), "listings": items, "prices": list(latest_prices()),
            "volumes": market_volumes(session), "active_orders": [o for o in orders if o["status"] in ACTIVE],
            "recommended": recommended(items, me), "bundles": buyer_bundles(session, me),
            "unread": unread_count(session, me)}


@router.get("/me/addresses")
def list_addresses(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    return [address_dict(a) for a in session.query(Address).filter_by(company_id=me.id).order_by(Address.id)]


@router.post("/me/addresses", status_code=201)
def add_address(body: AddressIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    first = session.query(Address).filter_by(company_id=me.id).first() is None   # 첫 배송지는 자동 기본
    a = Address(company_id=me.id, label=body.label, address=body.address, is_default=first)
    session.add(a)
    session.commit()
    return address_dict(a)


@router.delete("/me/addresses/{address_id}")
def delete_address(address_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    a = own_address(session, address_id, me)
    was_default = a.is_default
    session.delete(a)
    session.flush()
    if was_default:   # 기본 배송지를 지우면 남은 것 중 가장 오래된 것이 기본
        nxt = session.query(Address).filter_by(company_id=me.id).order_by(Address.id).first()
        if nxt:
            nxt.is_default = True
    session.commit()
    return {"id": address_id}


@router.put("/me/addresses/{address_id}")
def update_address(address_id: int, body: AddressIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    a = own_address(session, address_id, me)
    a.label, a.address = body.label, body.address
    session.commit()
    return address_dict(a)


@router.post("/me/addresses/{address_id}/default")
def set_default_address(address_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    a = own_address(session, address_id, me)
    for other in session.query(Address).filter_by(company_id=me.id):
        other.is_default = other.id == a.id
    session.commit()
    return address_dict(a)


@router.get("/me/interests")
def get_interests(me: Company = Depends(current_company)):
    need_role(me, "recycler")
    return interests_of(me)


@router.put("/me/interests")
def put_interests(body: InterestsIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    me.interests = {"waste_codes": list(dict.fromkeys(body.waste_codes)), "min_grade": body.min_grade}
    session.commit()
    return interests_of(me)


# ── 12.2 찜 ──
@router.get("/me/favorites")
def list_favorites(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    favs = session.query(Favorite).filter_by(company_id=me.id).order_by(Favorite.id.desc()).all()
    ids = {f.listing_id for f in favs}
    return [listing_item(session, session.get(Listing, f.listing_id), me, ids) for f in favs]


@router.put("/favorites/{listing_id}")
def put_favorite(listing_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    visible_listing(session, listing_id, me)
    if session.query(Favorite).filter_by(company_id=me.id, listing_id=listing_id).first() is None:
        session.add(Favorite(company_id=me.id, listing_id=listing_id))
        session.commit()
    return {"listing_id": listing_id, "favorite": True}


@router.delete("/favorites/{listing_id}")
def delete_favorite(listing_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    get_or_404(session, Listing, listing_id)
    session.query(Favorite).filter_by(company_id=me.id, listing_id=listing_id).delete()
    session.commit()
    return {"listing_id": listing_id, "favorite": False}


# ── 12.2 자주 거래하는 판매자·이번 달 실적 ──
@router.get("/me/frequent-sellers")
def frequent_sellers(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "recycler")
    agg: dict[int, dict] = {}
    rows = (session.query(Order, Listing).join(Listing, Listing.id == Order.listing_id)
            .filter(Order.recycler_id == me.id, Order.status.notin_(("cancelled", "returned"))))
    for o, l in rows:
        g = agg.setdefault(l.factory_id, {"order_count": 0, "total_kg": 0.0})
        g["order_count"] += 1
        g["total_kg"] += l.total_kg
    out = []
    for fid, g in agg.items():
        f = session.get(Company, fid)
        out.append({"factory_id": fid, "name": f.name, "region": f.region, "order_count": g["order_count"],
                    "total_kg": round(g["total_kg"], 3), "avg_rating": factory_rating(session, fid)})
    out.sort(key=lambda r: (-r["order_count"], -r["total_kg"], r["factory_id"]))
    return out
