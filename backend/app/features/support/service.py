"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_or_404
from app.core.util import iso
from app.db.models import Company, SupportTicket, TicketAttachment


def ticket_dict(t: SupportTicket, attachments: list[TicketAttachment] | None = None) -> dict:
    return {"id": t.id, "subject": t.subject, "body": t.body, "status": t.status, "created_at": iso(t.created_at),
            "attachments": [{"id": a.id, "content_type": a.content_type} for a in attachments or []]}


def own_ticket(session: Session, ticket_id: int, me: Company) -> SupportTicket:
    t = get_or_404(session, SupportTicket, ticket_id)
    if t.company_id != me.id:
        raise HTTPException(404, "문의를 찾을 수 없음")
    return t
