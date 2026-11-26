"""요청 본문 형식(입력 검증)."""
from pydantic import BaseModel

from app.features._shared.schemas import Name, Text500


class TicketIn(BaseModel):
    subject: Name
    body: Text500
