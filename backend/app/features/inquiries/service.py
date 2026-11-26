"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_or_404
from app.core.security import inquiry_limiter
from app.core.util import iso, now
from app.db.models import Bag, Company, Inquiry, InquiryMessage, Listing
from app.features.inquiries.contact_mask import mask_contacts
from app.features.listings.service import wname
from app.features.notifications.service import notify_companies


def party_inquiry(session: Session, inquiry_id: int, me: Company) -> Inquiry:
    q = get_or_404(session, Inquiry, inquiry_id)
    if me.id not in (q.recycler_id, q.factory_id):
        raise HTTPException(404, "문의를 찾을 수 없음")
    return q


def message_dict(session: Session, m: InquiryMessage) -> dict:
    return {"id": m.id, "sender_id": m.sender_id, "sender_name": session.get(Company, m.sender_id).name, "body": m.body,
            "masked": m.masked, "created_at": iso(m.created_at)}


def throttle(me: Company) -> None:
    if inquiry_limiter.blocked(str(me.id)):
        raise HTTPException(429, "문의를 너무 자주 보냄, 1분 뒤에 다시 시도 필요")
    inquiry_limiter.failed(str(me.id))


def append(session: Session, q: Inquiry, me: Company, text: str) -> InquiryMessage:
    masked_text, masked = mask_contacts(text)   # 원문은 저장하지 않는다
    m = InquiryMessage(inquiry_id=q.id, sender_id=me.id, body=masked_text, masked=masked)
    session.add(m)
    session.flush()
    q.updated_at = now()
    if me.id == q.recycler_id:   # 보낸 사람은 자기 글까지 읽은 것으로 본다
        q.recycler_read_id = m.id
        other = q.factory_id
    else:
        q.factory_read_id = m.id
        other = q.recycler_id
    notify_companies(session, {other}, "새 문의 메시지", f"매물 #{q.listing_id} {me.name} 문의 도착")
    return m


def inquiry_item(session: Session, q: Inquiry, me: Company) -> dict:
    l = session.get(Listing, q.listing_id)
    bag = session.query(Bag).filter_by(listing_id=l.id).order_by(Bag.id).first()
    other = session.get(Company, q.factory_id if me.id == q.recycler_id else q.recycler_id)
    last = session.query(InquiryMessage).filter_by(inquiry_id=q.id).order_by(InquiryMessage.id.desc()).first()
    read_id = q.recycler_read_id if me.id == q.recycler_id else q.factory_read_id
    unread = session.query(func.count(InquiryMessage.id)).filter(
        InquiryMessage.inquiry_id == q.id, InquiryMessage.id > read_id, InquiryMessage.sender_id != me.id).scalar()
    return {"id": q.id, "listing_id": q.listing_id,
            "listing_name": f"{wname(l.waste_code)} {bag.target_material if bag else ''}".strip(),
            "other_name": other.name, "last_message": last.body if last else None, "unread": unread,
            "updated_at": iso(q.updated_at), "reported": q.reported}
