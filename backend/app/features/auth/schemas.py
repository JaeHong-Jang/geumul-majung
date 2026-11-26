"""요청 본문 형식(입력 검증)."""
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.features._shared.schemas import MAX_BYPRODUCTS, Byproduct, Email, LoginId, Name, Password, PasswordInput, Text500, WasteCode


SignupRole = Literal["factory", "recycler"]   # 운영자는 가입으로 만들 수 없다. 운송기사 역할은 없음


class SignupBase(BaseModel):
    role: SignupRole | None = None
    name: Name
    biz_no: Name
    address: Text500
    address_detail: Name | None = None
    phone: Name | None = None
    industry: Name | None = None
    region: Name | None = None   # 없으면 주소에서 찾는다(판매자 앱은 지역 칸이 없음)
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lon: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    permit_no: Name | None = None
    permit_codes: list[WasteCode] = Field(default=[], max_length=30)
    emitter_report: Name | None = None
    byproducts: list[Byproduct] = Field(default=[], max_length=MAX_BYPRODUCTS)   # 판매자만 저장. 나오는 부산물(선택)

    @model_validator(mode="after")
    def consistent(self):
        if self.role == "recycler" and not self.phone:
            raise ValueError("구매자는 전화번호 입력 필요")
        if (self.lat is None) != (self.lon is None):
            raise ValueError("위도와 경도를 함께 입력 필요")
        if self.role == "recycler" and not (self.permit_no and self.permit_codes):
            raise ValueError("recycler는 permit_no와 permit_codes가 필요함")
        return self


class SignupIn(SignupBase):
    login_id: LoginId | None = None
    email: Email | None = None
    password: Password

    @model_validator(mode="after")
    def account_identifier(self):
        if not (self.login_id or self.email):
            raise ValueError("아이디 입력 필요")
        return self


class SocialSignupIn(SignupBase):
    signup_token: str = Field(min_length=10, max_length=200)
    login_id: LoginId | None = None
    email: Email | None = None


class ResetIn(BaseModel):
    email: Email


class ResetConfirmIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: Password


# ── 주소 → 좌표 (§14.5) ──
class GeocodeIn(BaseModel):
    """주소 + (선택) 다음 우편번호 위젯의 행정 코드. 코드 형식이 틀리면 400이 아니라 무시하고 검색으로 넘어간다(그래서 느슨한 타입)."""
    road_address: Text500
    adm_cd: Any = None       # 법정동 코드 10자리 (위젯 bcode)
    rn_mgt_sn: Any = None    # 도로명 코드 12자리 (위젯 sigunguCode + roadnameCode)
    udrt_yn: Any = None      # 지하 여부 0|1
    buld_mnnm: Any = None    # 건물 본번
    buld_slno: Any = None    # 건물 부번


class LoginIn(BaseModel):
    login_id: LoginId
    password: PasswordInput
