"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import current_company, need_role
from app.db.models import Bag, Company
from app.db.session import get_session
from app.features.companies.service import me_dict
from app.features.listings.service import list_my_listings
from app.features.market.service import latest_prices, market_volumes
from app.features.notifications.service import unread_count
from app.features.orders.service import list_my_orders
from app.features.recyclers.service import recommended_for
from app.features.seller.service import byproduct_recommendations


router = APIRouter(prefix="/v1")


@router.get("/seller/home")
def seller_home(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    return {"company": me_dict(me), "listings": list_my_listings(session, me), "orders": list_my_orders(session, me),
            "prices": list(latest_prices()), "volumes": market_volumes(session),
            "bag_count": session.query(Bag).filter_by(factory_id=me.id).count(), "unread": unread_count(session, me),
            "recommended_recyclers": recommended_for(session, me),
            "byproduct_recommendations": byproduct_recommendations(session, me)}
