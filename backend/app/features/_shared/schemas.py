"""입력 범위(ARCHITECTURE §8.1). 넘으면 400(RequestValidationError 핸들러)."""
import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, StringConstraints

from app.core.config import waste_names
from app.core.util import MAX_FREIGHT, round_kg, round_price


def _no_nul(s: str) -> str:
    if "\x00" in s:
        raise ValueError("NUL 문자 불가")
    return s


def _not_blank(s: str) -> str:
    if not s.strip():
        raise ValueError("공백만 불가")
    return s


def _known_waste_code(s: str) -> str:
    if s not in waste_names():
        raise ValueError("data/waste_codes.json에 없는 코드")
    return s


def _str(max_len: int):
    return Annotated[str, StringConstraints(min_length=1, max_length=max_len), AfterValidator(_no_nul), AfterValidator(_not_blank)]


Name = _str(100)                     # name, biz_no, vehicle_no, material 등


Text500 = _str(500)                  # method


Note = Annotated[str, StringConstraints(max_length=500), AfterValidator(_no_nul)]   # note, comment (빈 문자열 허용)


AllbaroNo = _str(50)


COMMON_PASSWORDS = {"password", "password1", "12345678", "123456789", "1234567890", "11111111", "00000000", "qwerty123"}


def _not_common(s: str) -> str:
    if s.lower() in COMMON_PASSWORDS:
        raise ValueError("너무 쉬운 비밀번호")
    return s


def _email(s: str) -> str:
    s = s.strip().casefold()
    if not re.fullmatch(r"[^@\s]{1,64}@[^@\s]+\.[^@\s]+", s):
        raise ValueError("이메일 형식이 아님")
    return s


Email = Annotated[str, StringConstraints(min_length=3, max_length=254), AfterValidator(_no_nul), AfterValidator(_email)]


LoginId = Annotated[_str(100), AfterValidator(lambda s: s.strip().casefold())]   # 대소문자·앞뒤 공백이 달라도 같은 계정


Password = Annotated[str, StringConstraints(min_length=8, max_length=128), AfterValidator(_no_nul),
                     AfterValidator(_not_blank), AfterValidator(_not_common)]                              # 가입


PasswordInput = Annotated[str, StringConstraints(min_length=1, max_length=128), AfterValidator(_no_nul)]   # 로그인


WasteCode = Annotated[str, AfterValidator(_known_waste_code)]


Lat = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]


Lon = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]


def _positive(x: float) -> float:
    if x <= 0:
        raise ValueError("반올림 뒤 0 초과여야 함")
    return x


def _kg3(x: float) -> float:
    return _positive(round_kg(x))


def _price2(x: float) -> float:
    return _positive(round_price(x))


Kg = Annotated[float, Field(gt=0, le=50000, allow_inf_nan=False), AfterValidator(_kg3)]   # 소수 3자리


Price = Annotated[float, Field(gt=0, le=100_000, allow_inf_nan=False), AfterValidator(_price2)]   # 소수 2자리


Won = Annotated[int, Field(ge=1, le=MAX_FREIGHT)]


class Byproduct(BaseModel):
    """판매자 공장에서 나오는 부산물 한 가지. 가입, 회사 정보에서 받고 돈이 되는 품목 추천의 바탕이 된다."""
    code: WasteCode                                                                   # 폐기물 코드(품목)
    material: Name                                                                    # 주 재질(예: PP, 철, 골판지)
    monthly_kg: float | None = Field(default=None, gt=0, le=1_000_000, allow_inf_nan=False)   # 한 달 발생량(대략, 선택)


MAX_BYPRODUCTS = 20


def unique_byproducts(rows: list[Byproduct]) -> list[dict]:
    """같은 품목, 재질은 한 번만(뒤에 온 발생량을 쓴다). 저장용 dict 목록으로 바꾼다."""
    seen: dict[tuple[str, str], dict] = {}
    for r in rows:
        material = r.material.strip()
        seen[(r.code, material.casefold())] = {"code": r.code, "material": material, "monthly_kg": r.monthly_kg}
    return list(seen.values())
