"""그물마중 반출 한 건의 계산·검증 규칙. 팀 시제품 model.js·Model.swift와 같은 규칙을 서버에 둔다.
틀린 입력은 RuleError(화면 문구 그대로)를 낸다."""
from __future__ import annotations

import copy
import math
import os
import re
from datetime import date, datetime, timedelta

# 사전 점검 항목 이름은 웹·iOS 화면이 보내는 값과 글자까지 같아야 한다(가운뎃점 포함)
CHECKS = ["부착 로프 분리", "금속 고리·추 제거", "패각·진흙 등 이물 제거", "재질 표본 사진 확보"]
STATUSES = ("registered", "confirmed", "settled")
MAX_SAFE = 2**53 - 1
PHOTO_RE = re.compile(r"^data:image/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$")
DEPARTURE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$")


class RuleError(ValueError):
    pass


def today() -> str:
    """시연 기준일. 현장용은 GM_TODAY를 비우고 실제 날짜를 쓴다."""
    v = os.environ.get("GM_TODAY", "2026-11-27").strip()
    return v or date.today().isoformat()


def js_round(x: float) -> int:
    """JS Math.round와 같게(0.5는 올림). 파이썬 round는 짝수로 맞추므로 쓰지 않는다."""
    return math.floor(x + 0.5)


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def require_text(v, name: str) -> None:
    if not isinstance(v, str) or not v.strip():
        raise RuleError(f"{name} 입력 필요")


def amount(v, name: str):
    if not _num(v) or v < 0 or v > MAX_SAFE:
        raise RuleError(f"{name}: 0 이상의 유효 숫자 입력 필요")
    return v


def won(v, name: str) -> int:
    amount(v, name)
    if not float(v).is_integer():
        raise RuleError(f"{name}: 원 단위 정수 입력 필요")
    return int(v)


def positive_weight(v, name: str) -> None:
    amount(v, name)
    if v == 0:
        raise RuleError(f"{name}: 0톤 초과 값 필요")


def calendar_day(v, name: str) -> str:
    try:
        if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError
        date.fromisoformat(v)
    except ValueError:
        raise RuleError(f"{name}: 올바른 날짜 입력 필요")
    return v


def check_accepted(total, accepted) -> None:
    positive_weight(total, "반출 중량")
    amount(accepted, "인수 중량")
    if accepted > total:
        raise RuleError("인수 중량의 반출 중량 초과 불가")


def notice_by(departure: str) -> str:
    """1톤 초과 반입은 출항 24시간 전 업체 신청."""
    return (datetime.fromisoformat(departure) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")


def defaults(weight, when: str) -> list[dict]:
    positive_weight(weight, "예상 중량")
    valid = calendar_day(str(when)[:10], "반출 예정일")
    return [
        {"label": "현 상태 인수", "condition": "로프 부착 상태로 입고 후 육상 선별",
         "expected": min(weight, js_round(weight * 0.6 * 1000) / 1000), "rate": 220000, "residualRate": 300000,
         "extra": 80000, "validUntil": valid},
        {"label": "로프 분리 후 인수", "condition": "섬에서 부착 로프 분리 후 그물만 마대 적재",
         "expected": min(weight, js_round(weight * 0.8 * 1000) / 1000), "rate": 180000, "residualRate": 300000,
         "extra": 200000, "validUntil": valid},
    ]


def calculate(record: dict, quote: dict, total, accepted, extra=None) -> dict:
    extra = quote.get("extra") if extra is None else extra
    check_accepted(total, accepted)
    base_rate = won(record.get("baseRate"), "기존 처리 단가")
    fee_rate = won(record.get("feeRate"), "운영료 단가")
    direct = won(record.get("directCost"), "팀 직접비")
    rate = won(quote.get("rate"), "인수 처리 단가")
    residual_rate = won(quote.get("residualRate"), "잔재물 처리 단가")
    extra = won(extra, "추가비")
    residual = round(total - accepted, 9)
    fee = js_round(accepted * fee_rate)
    baseline = js_round(total * base_rate)
    cost = js_round(accepted * rate) + js_round(residual * residual_rate) + extra + fee
    won(baseline, "기존 총비용")
    won(cost, "새 방식 총비용")
    ratio = accepted / total * 100
    return {"baseline": baseline, "cost": cost, "savings": baseline - cost, "fee": fee, "margin": fee - direct,
            "residual": int(residual) if float(residual).is_integer() else residual,
            "ratio": int(ratio) if float(ratio).is_integer() else ratio}


def verify(r: dict) -> dict:
    if not isinstance(r, dict):
        raise RuleError("반출 기록 확인 필요")
    for key, title in {"id": "반출 번호", "kind": "어구 종류", "material": "재질", "facility": "처리업체"}.items():
        require_text(r.get(key), title)
    bags = r.get("bags")
    if not isinstance(bags, int) or isinstance(bags, bool) or bags < 1:
        raise RuleError("마대 수: 1 이상의 정수 입력 필요")
    positive_weight(r.get("weight"), "예상 중량")
    dep = r.get("departure")
    if not isinstance(dep, str) or not DEPARTURE_RE.match(dep):
        raise RuleError("반출 예정 일시 확인 필요")
    dep_day = calendar_day(dep[:10], "반출 예정일")
    if r.get("note") is not None and not isinstance(r["note"], str):
        raise RuleError("현장 메모 확인 필요")
    checks = r.get("checks")
    if checks is not None and not (isinstance(checks, list) and all(c in CHECKS for c in checks)):
        raise RuleError("사전 점검 항목 확인 필요")
    photo = r.get("photo")
    if photo and (not isinstance(photo, str) or not PHOTO_RE.match(photo)):
        raise RuleError("첨부 사진: JPEG, PNG, WEBP, GIF 형식만 등록 가능")
    if r.get("status") not in STATUSES:
        raise RuleError("반출 단계 오류")
    quotes = r.get("quotes")
    if not isinstance(quotes, list) or not quotes:
        raise RuleError("인수 조건 1건 이상 입력 필요")
    for q in quotes:
        if not isinstance(q, dict):
            raise RuleError("인수 조건 확인 필요")
        require_text(q.get("label"), "조건 이름")
        require_text(q.get("condition"), "인수 조건")
        calendar_day(q.get("validUntil"), "견적 유효일")
        calculate(r, q, r["weight"], q.get("expected"))
    choice = r.get("choice")
    if r["status"] == "registered":
        if choice is not None:
            raise RuleError("등록 단계에는 확정 인수 조건 부재")
    else:
        if not isinstance(choice, int) or isinstance(choice, bool) or not 0 <= choice < len(quotes):
            raise RuleError("확정할 인수 조건 선택 필요")
        if quotes[choice]["validUntil"] < dep_day:
            raise RuleError("견적 유효일이 출항 예정일보다 이름, 업체 인수 조건 재확인 필요")
    actual = r.get("actual")
    if r["status"] == "settled":
        if not isinstance(actual, dict):
            raise RuleError("실제 계량 및 인수 결과 입력 필요")
        if dep_day > today():
            raise RuleError("출항 전 검수, 정산 입력 불가")
        calculate(r, quotes[choice], actual.get("total"), actual.get("accepted"), actual.get("extra"))
        require_text(actual.get("reference"), "계량 및 인수 증빙 번호")
        if actual["accepted"] < actual["total"]:
            require_text(actual.get("reason"), "잔재물 사유")
        if actual.get("signer") is not None and not isinstance(actual["signer"], str):
            raise RuleError("업체 확인자 확인 필요")
    elif actual is not None:
        raise RuleError("실제 계량 결과는 검수 완료 단계에서만 저장 가능")
    return r


def totals(r: dict) -> dict | None:
    """정산 완료면 실계량 기준, 확정이면 확정 조건의 예상 인수량 기준. 등록 단계는 없음."""
    if r.get("choice") is None:
        return None
    q = r["quotes"][r["choice"]]
    a = r.get("actual")
    if a:
        return calculate(r, q, a["total"], a["accepted"], a.get("extra"))
    return calculate(r, q, r["weight"], q["expected"])


def allocate_id(ids: list[str], when: str | None = None) -> str:
    day = calendar_day(str(when or today())[:10], "등록일")
    prefix = f"SS-{day[2:4]}{day[5:7]}-"
    seq = max((int(i[len(prefix):]) for i in ids if isinstance(i, str) and i.startswith(prefix) and i[len(prefix):].isdigit()),
              default=0)
    return f"{prefix}{seq + 1:03d}"


_LOTS = [
    ("SS-2611-006", "폐자망", "나일론", 5, 12, "2026-11-27T08:30", "confirmed", "로프 분리 후 그물을 마대별로 결속해 인계함",
     ["부착 로프 분리", "금속 고리·추 제거"], None),
    ("SS-2611-005", "폐통발 그물", "혼합", 3.2, 8, "2026-11-30T09:00", "registered", "부착 로프 혼입으로 육상 선별 조건 확인 중", None, None),
    ("SS-2611-004", "폐자망", "나일론", 4.5, 10, "2026-12-01T08:30", "confirmed", "마대별 표본 그물 별도 표시", None, None),
    ("SS-2611-003", "혼합 폐어망", "미확인", 2.4, 6, "2026-12-02T10:00", "registered", "재질 표본 확인 필요", None, None),
    ("SS-2611-002", "폐자망", "나일론", 5, 11, "2026-11-24T08:50", "settled", "지정 업체 검수 완료", None,
     {"total": 5, "accepted": 4, "reason": "부착 로프와 오염 그물", "reference": "예시-계량-1124", "signer": "업체 검수 담당 (가상)"}),
    ("SS-2611-001", "폐통발 그물", "혼합", 3, 7, "2026-11-20T09:10", "settled", "잔재물 별도 처리 완료", None,
     {"total": 3.1, "accepted": 2.8, "reason": "금속 고리 혼입", "reference": "예시-계량-1120", "extra": 90000}),
]


def seed() -> list[dict]:
    """model.js seed()와 같은 시연 6건."""
    out = []
    for id_, kind, mat, w, bags, dep, status, note, checks, actual in _LOTS:
        r = {"id": id_, "kind": kind, "material": mat, "weight": w, "bags": bags, "departure": dep, "status": status,
             "note": note, "photo": None, "facility": "보령 지정 재활용업체 (가상)", "actual": copy.deepcopy(actual),
             "baseRate": 300000, "feeRate": 40000, "directCost": 110000,
             "choice": None if status == "registered" else 1, "quotes": defaults(w, dep)}
        if checks is not None:
            r["checks"] = checks
        if id_ in SEED_SALES:
            r["sales"] = copy.deepcopy(SEED_SALES[id_])
        out.append(verify(r))
    return out


# 자원 순환 판매 시연 묶음(가상). 매입가는 팀 가정(공개 매입가 없음, 수익 구조 문서의 200원/kg 경우)
SEED_SALES = {
    "SS-2611-002": [{"id": "S1", "kind": "폐자망", "material": "나일론", "weight": 1, "origin": "쓰다가 배출", "separated": True,
                     "intact": True, "attachments": [], "note": "뜸줄, 발줄 떼어 따로 묶음", "grade": "판매 후보", "fixes": [],
                     "buyers": [], "status": "sold", "acceptedOffer": "O1", "createdAt": None,
                     "offers": [{"id": "O1", "buyer": "가상 재생나일론 업체", "price": 200000, "validUntil": "2026-11-30",
                                 "condition": "뜸줄, 발줄 제거 상태", "status": "accepted", "by": "운영", "at": None}]}],
    "SS-2611-006": [{"id": "S1", "kind": "폐로프", "material": "폴리프로필렌", "weight": 0.8, "origin": "쓰다가 배출", "separated": True,
                     "intact": True, "attachments": [], "note": "납심 없는 PP 로프만", "grade": "판매 후보", "fixes": [],
                     "buyers": [], "status": "offering", "acceptedOffer": None, "createdAt": None,
                     "offers": [{"id": "O1", "buyer": "가상 PP 펠릿 업체", "price": 120000, "validUntil": "2026-12-05",
                                 "condition": "세척 전 상태, 차량 상차 가능", "status": "open", "by": "운영", "at": None}]}],
}
