"""요청 본문 형식(입력 검증)."""
from pydantic import BaseModel


class NotificationSettings(BaseModel):
    orders: bool
    market: bool
