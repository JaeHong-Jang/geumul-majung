"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.deps import get_or_404
from app.core.util import iso, now
from app.db.models import Company, HandoverSection, Listing, Order
from app.features.orders.state import kg_sum, lock_order


def save_section(session: Session, order: Order, section: str, data: dict) -> dict:
    order = lock_order(session, order.id)   # 번호 입력과 칸 저장이 겹치지 않게 주문 행을 잠금(§9.2)
    if order.allbaro_no:
        raise HTTPException(409, "인계서 번호가 입력되어 더는 고칠 수 없음")
    row = session.query(HandoverSection).filter_by(order_id=order.id, section=section).first()
    if row is None:
        session.add(HandoverSection(order_id=order.id, section=section, data=data))
    else:
        row.data = data
    session.commit()
    return data


def order_for_section(session: Session, order_id: int, me: Company, who: str):
    """칸 주인 확인(남의 칸은 403)."""
    order = get_or_404(session, Order, order_id)
    listing = session.get(Listing, order.listing_id)
    owner = {"factory": listing.factory_id, "hauler": order.hauler_id, "recycler": order.recycler_id}[who]
    if me.id != owner:
        raise HTTPException(403, "내 칸이 아님")
    return order, listing


def emitter_data(session: Session, order: Order, listing: Listing, me: Company) -> dict:
    """배출자 칸(판매 공장)."""
    hauler = session.get(Company, order.hauler_id)
    return {"company_name": me.name, "biz_no": me.biz_no, "waste_code": listing.waste_code,
            "waste_name": waste_names().get(listing.waste_code, listing.waste_code),
            "bags": order.pickup_weights, "carrier_name": hauler.name, "prepared_at": iso(now())}


def carrier_data(order: Order, me: Company, vehicle_no: str) -> dict:
    """운반자 칸. 쓴 차량 번호는 회사에 기억해 다음 출고 때 미리 채운다(판매자가 대개 자기 차로 운송)."""
    me.vehicle_no = vehicle_no
    return {"company_name": me.name, "vehicle_no": vehicle_no, "picked_up_at": iso(order.picked_up_at),
            "total_kg": float(kg_sum(order.pickup_weights)), "prepared_at": iso(now())}
