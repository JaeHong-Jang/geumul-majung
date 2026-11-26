"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.deps import current_company
from app.core.util import iso, now
from app.db.models import Company, Order
from app.db.session import get_session
from app.features.handover.schemas import CarrierIn, NumberIn, ProcessorIn
from app.features.handover.service import carrier_data, emitter_data, order_for_section, save_section
from app.features.orders.service import order_party, sections
from app.features.orders.state import kg_sum, lock_order


router = APIRouter(prefix="/v1")


AFTER_PICKUP = ("picked_up", "arrived", "confirmed", "settled", "rated")


AFTER_CONFIRM = ("confirmed", "settled", "rated")


@router.get("/orders/{order_id}/handover")
def get_handover(order_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    order, _ = order_party(session, order_id, me)
    s = sections(session, order_id)
    return {"emitter": s.get("emitter"), "carrier": s.get("carrier"), "processor": s.get("processor"),
            "allbaro_no": order.allbaro_no,
            "vehicle_hint": me.vehicle_no if me.id == order.hauler_id else None}   # 지난번 쓴 내 차량 번호


@router.post("/orders/{order_id}/handover/emitter")
def handover_emitter(order_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    order, listing = order_for_section(session, order_id, me, "factory")
    if order.status not in AFTER_PICKUP:
        raise HTTPException(409, "수거 이후에 작성할 수 있음")
    return save_section(session, order, "emitter", emitter_data(session, order, listing, me))


@router.post("/orders/{order_id}/handover/carrier")
def handover_carrier(order_id: int, body: CarrierIn, me: Company = Depends(current_company),
                     session: Session = Depends(get_session)):
    order, _ = order_for_section(session, order_id, me, "hauler")
    if order.status not in AFTER_PICKUP:
        raise HTTPException(409, "수거 이후에 작성할 수 있음")
    return save_section(session, order, "carrier", carrier_data(order, me, body.vehicle_no))


@router.post("/orders/{order_id}/handover/processor")
def handover_processor(order_id: int, body: ProcessorIn, me: Company = Depends(current_company),
                       session: Session = Depends(get_session)):
    order, _ = order_for_section(session, order_id, me, "recycler")
    if order.status not in AFTER_CONFIRM:
        raise HTTPException(409, "검수 확정 이후에 작성할 수 있음")
    data = {"company_name": me.name, "received_kg": float(kg_sum(order.inspect_weights)),
            "method": body.method, "prepared_at": iso(now())}
    return save_section(session, order, "processor", data)


@router.post("/orders/{order_id}/handover/number")
def handover_number(order_id: int, body: NumberIn, me: Company = Depends(current_company),
                    session: Session = Depends(get_session)):
    order, _ = order_for_section(session, order_id, me, "factory")
    order = lock_order(session, order.id)
    if set(sections(session, order_id)) != {"emitter", "carrier", "processor"}:
        raise HTTPException(409, "인계서 3칸이 모두 채워진 뒤에 입력할 수 있음")
    number = body.allbaro_no.strip()
    got = session.execute(update(Order).where(Order.id == order.id, Order.allbaro_no.is_(None))
                          .values(allbaro_no=number, updated_at=now()), execution_options={"synchronize_session": False})
    if got.rowcount == 0:
        raise HTTPException(409, "인계서 번호는 한 번만 입력할 수 있음")
    session.commit()
    return {"allbaro_no": number}
