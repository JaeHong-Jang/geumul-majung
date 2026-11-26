"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import current_company, get_or_404, need_role
from app.db.models import Company, Inquiry, InquiryMessage, Listing, SupportTicket
from app.db.session import get_session
from app.features.inquiries.schemas import InquiryIn, ReportIn
from app.features.inquiries.service import append, inquiry_item, message_dict, party_inquiry, throttle


router = APIRouter(prefix="/v1")


@router.post("/listings/{listing_id}/inquiries", status_code=201)
def start_inquiry(listing_id: int, body: InquiryIn, me: Company = Depends(current_company),
                  session: Session = Depends(get_session)):
    need_role(me, "recycler", verified=True)   # 공장이 먼저 시작할 수 없고, 승인 전 구매 업체도 불가
    l = get_or_404(session, Listing, listing_id)
    q = session.query(Inquiry).filter_by(listing_id=l.id, recycler_id=me.id).first()
    if q is None:
        if l.status != "posted":   # bundle_wait는 구매자에게 비공개라 새 문의도 받지 않는다(§17)
            raise HTTPException(409, "게시 중인 판매에만 새로 문의할 수 있음")
        throttle(me)
        try:
            with session.begin_nested():   # 동시에 두 번 시작해도 한 건으로 이어 쓴다
                q = Inquiry(listing_id=l.id, recycler_id=me.id, factory_id=l.factory_id)
                session.add(q)
                session.flush()
        except IntegrityError:
            q = session.query(Inquiry).filter_by(listing_id=l.id, recycler_id=me.id).one()
    else:
        throttle(me)
    m = append(session, q, me, body.body)
    session.commit()
    return {"id": q.id, "listing_id": l.id, "message": message_dict(session, m)}


@router.get("/inquiries")
def list_inquiries(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    rows = (session.query(Inquiry).filter((Inquiry.recycler_id == me.id) | (Inquiry.factory_id == me.id))
            .order_by(Inquiry.updated_at.desc(), Inquiry.id.desc()))
    return [inquiry_item(session, q, me) for q in rows]


@router.get("/inquiries/{inquiry_id}/messages")
def inquiry_messages(inquiry_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    q = party_inquiry(session, inquiry_id, me)
    return [message_dict(session, m) for m in session.query(InquiryMessage).filter_by(inquiry_id=q.id).order_by(InquiryMessage.id)]


@router.post("/inquiries/{inquiry_id}/messages", status_code=201)
def post_inquiry_message(inquiry_id: int, body: InquiryIn, me: Company = Depends(current_company),
                         session: Session = Depends(get_session)):
    q = party_inquiry(session, inquiry_id, me)
    throttle(me)
    m = append(session, q, me, body.body)
    session.commit()
    return message_dict(session, m)


@router.post("/inquiries/{inquiry_id}/read")
def read_inquiry(inquiry_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    q = party_inquiry(session, inquiry_id, me)
    last = session.query(func.max(InquiryMessage.id)).filter_by(inquiry_id=q.id).scalar() or 0
    if me.id == q.recycler_id:
        q.recycler_read_id = last
    else:
        q.factory_read_id = last
    session.commit()
    return {"id": q.id, "unread": 0}


@router.post("/inquiries/{inquiry_id}/report")
def report_inquiry(inquiry_id: int, body: ReportIn, me: Company = Depends(current_company),
                   session: Session = Depends(get_session)):
    """고객센터 티켓을 만든다. 기록은 지우지 않는다."""
    q = party_inquiry(session, inquiry_id, me)
    t = SupportTicket(company_id=me.id, subject=f"문의 신고 #{q.id}", status="open",
                      body=f"매물 #{q.listing_id} 문의 #{q.id} 신고. 사유: {body.reason}")
    session.add(t)
    q.reported = True
    session.commit()
    return {"id": q.id, "reported": True, "ticket_id": t.id}
