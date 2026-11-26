"""요청 본문 형식(입력 검증)."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.features._shared.schemas import Name, Note, Price


Transport = Literal["matched", "own"]   # 판매자가 화물차를 따로 구함 | 판매자 회사 차량


class ListingIn(BaseModel):
    bag_ids: list[int] = Field(min_length=1, max_length=50)
    mode: Literal["now", "bundle"]
    price_krw_per_kg: Price
    available_from: date | None = None
    pickup_note: Note | None = None
    transport: Transport | None = None    # 운송 방법(운임은 늘 판매자 부담)
    ship_hours: Name | None = None        # 출고 가능 시간
    unload_forklift: bool | None = None   # 입고지 하차 때 지게차 지원
    unload_crane: bool | None = None      # 입고지 하차 때 크레인 지원

    @field_validator("bag_ids")
    @classmethod
    def unique(cls, v):
        if len(set(v)) != len(v):
            raise ValueError("bag_ids 중복 불가")
        return v


class ListingPatch(BaseModel):
    price_krw_per_kg: Price | None = None
    available_from: date | None = None
    pickup_note: Note | None = None
    transport: Transport | None = None
    ship_hours: Name | None = None
    unload_forklift: bool | None = None
    unload_crane: bool | None = None
