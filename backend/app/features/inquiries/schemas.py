"""요청 본문 형식(입력 검증)."""
from pydantic import BaseModel

from app.features._shared.schemas import Text500


class InquiryIn(BaseModel):
    body: Text500


class ReportIn(BaseModel):
    reason: Text500
