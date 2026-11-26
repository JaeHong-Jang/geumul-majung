"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_company
from app.core.security import message_limiter
from app.db.models import Company, Inquiry, InquiryMessage, Message
from app.db.session import get_session
from app.features.messages.schemas import MessageIn
from app.features.messages.service import message_dict
from app.features.notifications.service import notify_companies
from app.features.orders.service import party_order


router = APIRouter(prefix="/v1")


@router.get("/orders/{order_id}/messages")
def list_messages(order_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    order, listing = party_order(session, order_id, me)
    rows = [(m.created_at, 1, m.id, message_dict(session, m)) for m in session.query(Message).filter_by(order_id=order_id)]
    if me.id in (listing.factory_id, order.recycler_id):   # 문의 기록은 판매·구매 업체만. 운반 업체에게는 보이지 않는다(§15)
        inquiry = session.query(Inquiry).filter_by(listing_id=listing.id, recycler_id=order.recycler_id).first()
        if inquiry is not None:
            rows += [(m.created_at, 0, m.id, message_dict(session, m, True))
                     for m in session.query(InquiryMessage).filter_by(inquiry_id=inquiry.id)]
    rows.sort(key=lambda r: (r[0] if r[0].tzinfo else r[0].replace(tzinfo=timezone.utc), r[1], r[2]))
    return [r[3] for r in rows]


@router.post("/orders/{order_id}/messages", status_code=201)
def post_message(order_id: int, body: MessageIn, me: Company = Depends(current_company),
                 session: Session = Depends(get_session)):
    order, listing = party_order(session, order_id, me)
    if message_limiter.blocked(str(me.id)):
        raise HTTPException(429, "메시지를 너무 자주 보냄, 1분 뒤에 다시 시도 필요")
    message_limiter.failed(str(me.id))
    m = Message(order_id=order.id, sender_id=me.id, body=body.body)
    session.add(m)
    session.flush()
    others = {listing.factory_id, order.recycler_id, order.hauler_id} - {None, me.id}
    notify_companies(session, others, "새 메시지", f"주문 #{order.id} {me.name} 새 메시지", order.id)
    session.commit()
    return message_dict(session, m)
