"""요청 본문 형식(입력 검증)."""
from typing import Literal

from pydantic import BaseModel, Field

from app.features._shared.schemas import Name, Text500, WasteCode


# ── 12.2 배송지 ──
class AddressIn(BaseModel):
    label: Name
    address: Text500


# ── 12.2 관심 조건 ──
class InterestsIn(BaseModel):
    waste_codes: list[WasteCode] = Field(default=[], max_length=30)
    min_grade: Literal["A", "B", "C"] | None = None
