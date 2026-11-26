"""요청 본문 형식(입력 검증)."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class PoolIn(BaseModel):
    listing_id: int
    target_kg: float = Field(gt=0, le=1_000_000, allow_inf_nan=False)
    deadline: date


class JoinIn(BaseModel):
    listing_id: int


class PoolPatch(BaseModel):
    target_kg: float | None = Field(default=None, gt=0, le=1_000_000, allow_inf_nan=False)
    deadline: date | None = None


class DeadlineIn(BaseModel):
    action: Literal["extend", "sell_now", "cancel"]
    new_deadline: date | None = None
