"""요청 본문 형식(입력 검증)."""
from pydantic import BaseModel, Field, model_validator

from app.core.util import dsum
from app.features._shared.schemas import Kg, Name, Note, WasteCode


class Item(BaseModel):
    material: Name
    kg: Kg


class BagIn(BaseModel):
    waste_code: WasteCode
    target_material: Name
    items: list[Item] = Field(min_length=1, max_length=20)
    note: Note | None = None

    @model_validator(mode="after")
    def total_limit(self):
        if dsum(i.kg for i in self.items) > 50000:
            raise ValueError("한 번에 등록하는 무게는 합계 50t(50,000kg) 이하")
        return self


class GradeIn(BaseModel):
    confirm_no_hazard: bool = False
