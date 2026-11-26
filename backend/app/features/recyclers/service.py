"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.deps import get_or_404
from app.db.models import Bag, Company, FavoriteRecycler
from app.tools.calc import coarse_km, haversine_km


def recycler_item(c: Company, me: Company, favorites: set[int]) -> dict:
    names = [waste_names().get(code, code) for code in c.permit_codes or []]
    return {"id": c.id, "name": c.name, "region": c.region, "materials": ", ".join(names),
            "distance_km": coarse_km(haversine_km(me.lat, me.lon, c.lat, c.lon)), "favorite": c.id in favorites}


def favorite_ids(session: Session, me: Company) -> set[int]:
    return {f.recycler_id for f in session.query(FavoriteRecycler).filter_by(company_id=me.id)}


def visible_recyclers(session: Session) -> list[Company]:
    return session.query(Company).filter_by(role="recycler", verified=True).all()


def nearest_recyclers(session: Session, me: Company, codes: set[str] | None = None, limit: int | None = None) -> list[dict]:
    favorites = favorite_ids(session, me)
    rows = [c for c in visible_recyclers(session) if codes is None or codes & set(c.permit_codes or [])]
    items = sorted((recycler_item(c, me, favorites) for c in rows), key=lambda i: (i["distance_km"], i["id"]))
    return items[:limit]


def recommended_for(session: Session, me: Company) -> list[dict]:
    """내 마대 폐기물 코드와 허가가 맞는 가까운 재활용업체 최대 2곳."""
    codes = {code for (code,) in session.query(Bag.waste_code).filter_by(factory_id=me.id).distinct()}
    return nearest_recyclers(session, me, codes, 2) if codes else []


def visible_recycler(session: Session, recycler_id: int) -> Company:
    c = get_or_404(session, Company, recycler_id)
    if c.role != "recycler" or not c.verified:
        raise HTTPException(404, "재활용업체를 찾을 수 없음")
    return c
