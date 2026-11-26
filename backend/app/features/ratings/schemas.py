"""요청 본문 형식(입력 검증)."""
from typing import Literal

from pydantic import BaseModel, Field

from app.features._shared.schemas import Note


class RatingIn(BaseModel):
    order_id: int
    target: Literal["factory", "recycler"]
    score: int = Field(ge=1, le=5)
    comment: Note | None = None
