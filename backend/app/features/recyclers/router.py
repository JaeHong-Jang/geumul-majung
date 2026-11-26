"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import current_company, need_role
from app.db.models import Company, FavoriteRecycler
from app.db.session import get_session
from app.features.recyclers.service import (
    favorite_ids,
    nearest_recyclers,
    recycler_item,
    visible_recycler,
    visible_recyclers,
)


router = APIRouter(prefix="/v1")


@router.get("/recyclers")
def list_recyclers(q: str | None = Query(default=None, max_length=100), waste_code: str | None = None,
                   me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    items = nearest_recyclers(session, me, {waste_code} if waste_code else None)
    if q and q.strip():
        needle = q.strip().casefold()
        items = [i for i in items if needle in f"{i['name']} {i['region'] or ''} {i['materials']}".casefold()]
    return items


@router.get("/recyclers/{recycler_id}")
def get_recycler(recycler_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    c = visible_recycler(session, recycler_id)
    return {**recycler_item(c, me, favorite_ids(session, me)), "pickup_method": c.pickup_method, "terms": c.terms,
            "permit_codes": c.permit_codes}


@router.get("/me/favorite-recyclers")
def list_favorite_recyclers(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    favorites = favorite_ids(session, me)
    items = [recycler_item(c, me, favorites) for c in visible_recyclers(session) if c.id in favorites]
    return sorted(items, key=lambda i: (i["distance_km"], i["id"]))


@router.put("/me/favorite-recyclers/{recycler_id}")
def put_favorite_recycler(recycler_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    visible_recycler(session, recycler_id)
    if session.query(FavoriteRecycler).filter_by(company_id=me.id, recycler_id=recycler_id).first() is None:
        session.add(FavoriteRecycler(company_id=me.id, recycler_id=recycler_id))
        session.commit()
    return {"id": recycler_id, "favorite": True}


@router.delete("/me/favorite-recyclers/{recycler_id}")
def delete_favorite_recycler(recycler_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory")
    visible_recycler(session, recycler_id)
    session.query(FavoriteRecycler).filter_by(company_id=me.id, recycler_id=recycler_id).delete()
    session.commit()
    return {"id": recycler_id, "favorite": False}
