"""요청 본문 형식(입력 검증)."""
from pydantic import BaseModel

from app.features._shared.schemas import AllbaroNo, Name, Text500


# ── 인계서 ──
class CarrierIn(BaseModel):
    vehicle_no: Name


class ProcessorIn(BaseModel):
    method: Text500


class NumberIn(BaseModel):
    allbaro_no: AllbaroNo
