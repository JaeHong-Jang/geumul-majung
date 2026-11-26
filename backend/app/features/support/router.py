"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import current_company, get_or_404
from app.core.security import ticket_limiter
from app.core.util import now
from app.db.models import Company, SupportTicket, TicketAttachment
from app.db.session import get_session
from app.features._shared.uploads import decode_upload, DocumentIn, file_response
from app.features.companies.service import MAX_ATTACHMENT_TOTAL
from app.features.support.schemas import TicketIn
from app.features.support.service import own_ticket, ticket_dict


router = APIRouter(prefix="/v1")


# ── 12.6 고객센터 ──
FAQ = [
    {"id": 1, "question": "대금은 언제 정산됩니까?",
     "answer": "구매 업체가 검사에서 합격 처리하면 보류된 금액에서 판매 업체 몫을 정산하고 남은 금액은 환불, 운임은 판매자 부담, 시범 운영 중 수수료는 0원"},
    {"id": 2, "question": "세금계산서(직접 정산)를 고르면 무엇이 달라집니까?",
     "answer": "앱이 물건값을 보류하지 않음, 물건값은 판매 업체와 직접 정산"},
    {"id": 3, "question": "운송은 누가 맡습니까?",
     "answer": "판매 업체가 회사 차량이나 직접 구한 화물차로 입고지까지 운송, 운임은 판매자 부담"},
    {"id": 4, "question": "주문한 뒤 취소할 수 있습니까?",
     "answer": "판매자가 출고하기 전에는 취소할 수 있고 보류 금액은 전액 환불"},
    {"id": 5, "question": "검사에서 무게나 품질이 다르면 어떻게 됩니까?",
     "answer": "허용 오차(±5%)를 넘거나 불합격이면 운영자 중재 대기 상태가 되며, 운영자가 재등급, 처리, 반송 중 하나로 정산"},
]


@router.get("/support/faq")
def faq(me: Company = Depends(current_company)):
    return FAQ


@router.get("/support/tickets")
def list_tickets(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    out = []
    for t in session.query(SupportTicket).filter_by(company_id=me.id).order_by(SupportTicket.id.desc()):
        out.append(ticket_dict(t, session.query(TicketAttachment).filter_by(ticket_id=t.id).order_by(TicketAttachment.id).all()))
    return out


@router.post("/support/tickets", status_code=201)
def create_ticket(body: TicketIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    if ticket_limiter.blocked(str(me.id)):
        raise HTTPException(429, "문의를 너무 자주 보냄, 1분 뒤에 다시 시도 필요")
    ticket_limiter.failed(str(me.id))
    t = SupportTicket(company_id=me.id, subject=body.subject, body=body.body, status="open", created_at=now())
    session.add(t)
    session.commit()
    return ticket_dict(t)


@router.post("/support/tickets/{ticket_id}/attachments", status_code=201)
def add_attachment(ticket_id: int, body: DocumentIn, me: Company = Depends(current_company),
                   session: Session = Depends(get_session)):
    t = own_ticket(session, ticket_id, me)
    if session.query(TicketAttachment).filter_by(ticket_id=t.id).count() >= 5:
        raise HTTPException(409, "첨부는 문의 하나에 5개까지 올릴 수 있음")
    raw = decode_upload(body.content_type, body.data_base64)
    used = session.query(func.coalesce(func.sum(func.length(TicketAttachment.data)), 0)).filter_by(ticket_id=t.id).scalar()
    if used + len(raw) > MAX_ATTACHMENT_TOTAL:
        raise HTTPException(400, "첨부 합계는 6MB 이하만 가능")
    a = TicketAttachment(ticket_id=t.id, content_type=body.content_type, data=raw)
    session.add(a)
    session.commit()
    return {"id": a.id, "content_type": a.content_type, "ticket_id": t.id}


@router.get("/support/tickets/{ticket_id}/attachments/{attachment_id}")
def get_attachment(ticket_id: int, attachment_id: int, me: Company = Depends(current_company),
                   session: Session = Depends(get_session)):
    t = own_ticket(session, ticket_id, me)
    a = get_or_404(session, TicketAttachment, attachment_id)
    if a.ticket_id != t.id:
        raise HTTPException(404, "첨부 파일을 찾을 수 없음")
    return file_response(a.data, a.content_type)
