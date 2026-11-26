"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from sqlalchemy.orm import Session

from app.core.util import iso
from app.db.models import Company, InquiryMessage, Message


def message_dict(session: Session, m: Message | InquiryMessage, from_inquiry: bool = False) -> dict:
    return {"id": m.id, "sender_id": m.sender_id, "sender_name": session.get(Company, m.sender_id).name,
            "body": m.body, "created_at": iso(m.created_at), "from_inquiry": from_inquiry}
