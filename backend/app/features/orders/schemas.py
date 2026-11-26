"""요청 본문 형식(입력 검증)."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.util import MAX_FREIGHT
from app.features._shared.schemas import Email, Kg, Name, Note, Price, Text500
from app.features._shared.uploads import ImageIn


class OrderOptions(BaseModel):
    transport: Literal["seller", "self"] = "seller"   # 판매자 운송(운임 판매자 부담) | 구매 업체 직접 수거
    payment: Literal["escrow", "invoice"] = "escrow"


class DockIn(BaseModel):
    """구매자 입고지 상·하차 조건. 판매자가 운송 차와 장비를 고르는 데 쓴다."""
    unload: Literal["forklift", "crane", "both", "manual", "none"]   # 입고지 하차 장비: 지게차, 크레인·호이스트, 둘 다, (인력), 없음
    load_ok: bool = False
    max_vehicle: Literal["1t", "2.5t", "5t", "11t", "25t"] = "11t"
    hours: Text500 | None = None
    note: Note | None = None


class InvoiceIn(BaseModel):
    """안전결제와 함께 세금계산서 발행 요청."""
    email: Email


class OrderExtras(OrderOptions):
    delivery_address: Text500 | None = None
    desired_date: date | None = None
    note: Note | None = None
    dock: DockIn | None = None
    tax_invoice: InvoiceIn | None = None


class OrderIn(OrderExtras):
    listing_id: int


class PreviewIn(OrderOptions):
    listing_ids: list[int] = Field(min_length=1, max_length=20)

    @field_validator("listing_ids")
    @classmethod
    def unique(cls, v):
        if len(set(v)) != len(v):
            raise ValueError("listing_ids 중복 불가")
        return v


class BatchIn(PreviewIn):
    delivery_address: Text500 | None = None
    desired_date: date | None = None
    note: Note | None = None
    dock: DockIn | None = None
    tax_invoice: InvoiceIn | None = None


class BagWeight(BaseModel):
    bag_id: int
    kg: Kg


class WeightsIn(BaseModel):
    bag_weights: list[BagWeight] = Field(max_length=50)


class PickupIn(WeightsIn):
    vehicle_no: Name | None = None     # 주면 배출자, 운반자 인계서를 출고와 함께 작성


class InspectIn(WeightsIn):
    passed: bool
    note: Note | None = None


class ResolveIn(BaseModel):
    resolution: Literal["regrade", "treat", "return"]
    new_price_krw_per_kg: Price | None = None
    treatment_fee_krw: int | None = Field(default=None, ge=0, le=MAX_FREIGHT)
    note: Text500


class PhotoIn(ImageIn):
    stage: Literal["pickup", "inspect"]
