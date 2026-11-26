"""구매자가 보는 판매 공장 정보: 회사 정보, 위치, 평점, 후기, 판매 중인 매물."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.deps import current_company, get_or_404
from app.db.models import Company, CompanyExtra, Listing, Order, Rating
from app.db.session import get_session
from app.features.listings.service import listing_item
from app.tools.calc import coarse_km, haversine_km

router = APIRouter(prefix="/v1")


def rating_summary(session: Session, company_id: int) -> dict:
    avg, count = session.query(func.avg(Rating.score), func.count(Rating.id)).filter(
        Rating.target_company_id == company_id, Rating.target == "factory").one()
    return {"rating": round(float(avg), 1) if avg is not None else None, "rating_count": int(count or 0)}


def mask(name: str) -> str:
    """후기 작성 회사 이름은 앞 두 글자만 보인다."""
    return name[:2] + "*" * max(len(name) - 2, 1)


def seller(session: Session, seller_id: int) -> Company:
    c = get_or_404(session, Company, seller_id)
    if c.role != "factory":
        raise HTTPException(404, "판매 공장을 찾을 수 없음")
    return c


@router.get("/sellers/{seller_id}")
def seller_profile(seller_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    c = seller(session, seller_id)
    extra = session.query(CompanyExtra).filter_by(company_id=c.id).first()
    listings = session.query(Listing).filter(Listing.factory_id == c.id, Listing.status == "posted").order_by(Listing.id.desc()).all()
    deals = session.query(func.count(Order.id)).join(Listing, Listing.id == Order.listing_id).filter(
        Listing.factory_id == c.id, Order.status.in_(("settled", "rated"))).scalar()
    return {"id": c.id, "name": c.name, "ceo_name": extra.ceo_name if extra else None, "intro": extra.intro if extra else None,
            "biz_no": c.biz_no, "phone": c.phone, "industry": c.industry, "region": c.region,
            "address": " ".join(x for x in (c.address, c.address_detail) if x) or None,
            "lat": c.lat, "lon": c.lon, "verified": c.verified,
            "distance_km": coarse_km(haversine_km(me.lat, me.lon, c.lat, c.lon)),
            "completed_deals": int(deals or 0), **rating_summary(session, c.id),
            "listings": [listing_item(session, l, me) for l in listings]}


@router.get("/sellers/{seller_id}/reviews")
def seller_reviews(seller_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    c = seller(session, seller_id)
    rows = session.query(Rating, Company, Listing).join(Company, Company.id == Rating.rater_id)\
        .join(Order, Order.id == Rating.order_id).join(Listing, Listing.id == Order.listing_id)\
        .filter(Rating.target_company_id == c.id, Rating.target == "factory").order_by(Rating.id.desc()).all()
    return [{"id": r.id, "score": r.score, "comment": r.comment, "writer": mask(w.name),
             "item": waste_names().get(l.waste_code, l.waste_code)} for r, w, l in rows]
