"""요청 본문 형식(입력 검증)."""
from typing import Literal

from pydantic import BaseModel, Field

from app.contracts import Role
from app.features._shared.schemas import MAX_BYPRODUCTS, Byproduct, Lat, LoginId, Lon, Name, Note, Password, Text500, WasteCode
from app.features._shared.uploads import DocumentIn


class CompanyIn(BaseModel):
    name: Name
    role: Role
    biz_no: Name
    lat: Lat
    lon: Lon
    permit_no: Name | None = None
    permit_codes: list[WasteCode] = Field(default=[], max_length=30)
    industry: Name | None = None
    region: Name | None = None
    login_id: LoginId | None = None
    password: Password | None = None


class FixIn(BaseModel):
    note: Text500
    missing: list[Name] = Field(default=[], max_length=10)


class ProfilePatch(BaseModel):
    region: Name | None = None
    address: Text500 | None = None
    name: Name | None = None
    phone: Name | None = None
    industry: Name | None = None
    address_detail: Name | None = None
    emitter_report: Name | None = None
    lat: Lat | None = None   # 지도 핀으로 보정한 좌표(§14.5). lat·lon은 함께
    lon: Lon | None = None
    pickup_method: Text500 | None = None   # recycler 소개 (§13.3)
    terms: Text500 | None = None
    byproducts: list[Byproduct] | None = Field(default=None, max_length=MAX_BYPRODUCTS)   # 판매자만. 빈 목록이면 모두 지움


class DocumentPut(DocumentIn):
    kind: Literal["business_license", "emitter_report"]


class ResubmitIn(BaseModel):
    note: Note | None = None
