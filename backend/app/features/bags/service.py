"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.util import iso
from app.db.models import Bag, BagPass, Company, Listing, Order


def bag_dict(b: Bag) -> dict:
    """하네스에 넘기는 마대 정보(ctx['bag'])."""
    return {"id": b.id, "factory_id": b.factory_id, "waste_code": b.waste_code, "target_material": b.target_material,
            "items": b.items, "total_kg": b.total_kg, "note": b.note, "status": b.status}


def bag_view(session: Session, b: Bag) -> dict:
    p = session.query(BagPass).filter_by(bag_id=b.id).first()
    return {"id": b.id, "waste_code": b.waste_code, "waste_name": waste_names().get(b.waste_code, b.waste_code),
            "target_material": b.target_material, "total_kg": b.total_kg, "status": b.status, "grade": b.grade,
            "purity": b.purity, "pass_id": p.id if p else None, "qr": f"MDP-{p.id}-{b.id}" if p else None,
            "listing_id": b.listing_id, "created_at": iso(b.created_at), "has_photo": b.photo_type is not None}


def can_see_photo(session: Session, bag: Bag, me: Company) -> bool:
    """그 공장, 운영자, 게시 중(posted) 매물의 마대, 또는 그 마대가 든 주문의 당사자만(§17)."""
    if me.role == "operator" or me.id == bag.factory_id:
        return True
    if bag.listing_id is not None and session.get(Listing, bag.listing_id).status == "posted":
        return True
    mine = session.query(Order).filter((Order.recycler_id == me.id) | (Order.hauler_id == me.id)).all()
    return any(bag.id in (o.bag_snapshot or []) for o in mine)
