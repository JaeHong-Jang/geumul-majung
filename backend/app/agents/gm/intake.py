"""gm_intake(말로 반출 등록): 집하장 담당자가 말한 글에서 반출 등록 칸을 채운다.
숫자(무게, 마대 수, 날짜, 시각)는 말한 글에서 규칙으로만 읽는다. LLM은 쓰지 않는다(현장 말투가 짧고 칸이 정해져 있어 규칙이 더 정확).
못 읽은 칸은 비우고 '확인 필요' 주장을 낸다."""
from __future__ import annotations

import re
from datetime import date, timedelta

from app.agents._common import claim, ev
from app.contracts import AgentResult
from app.features.gm.rules import CHECKS, today

ID = "gm_intake"
KINDS = ["폐어망", "폐자망", "폐통발 그물", "혼합 그물"]
MATERIALS = ["미확인", "나일론", "폴리에틸렌", "폴리프로필렌", "혼합"]
KIND_WORDS = [(r"자망", "폐자망"), (r"통발", "폐통발 그물"), (r"섞인\s*그물|혼합\s*그물|이것저것", "혼합 그물"),
              (r"그물|어망", "폐어망")]
MATERIAL_WORDS = [(r"나일론|나이론", "나일론"), (r"폴리에틸렌|(?<![a-z])pe(?![a-z])|피이", "폴리에틸렌"),
                  (r"폴리프로필렌|(?<![a-z])pp(?![a-z])|피피", "폴리프로필렌"), (r"섞여|섞인\s*재질|혼합\s*재질", "혼합"),
                  (r"재질\s*(?:은|는)?\s*(?:모름|모르|미확인)", "미확인")]
CHECK_WORDS = [(r"로프\S*\s*(?:다\s*)?(?:떼|분리|제거|뗐)", "부착 로프 분리"),
               (r"(?:고리|추|봉돌|납)\S*\s*(?:다\s*)?(?:떼|분리|제거|뗐|뺐)", "금속 고리·추 제거"),
               (r"(?:뻘|진흙|패각|조개|따개비)\S*\s*(?:다\s*)?(?:털|제거|씻|떼)", "패각·진흙 등 이물 제거"),
               (r"표본\s*사진|사진\s*(?:찍|확보)", "재질 표본 사진 확보")]
NUM_WORDS = {"한": 1, "하나": 1, "두": 2, "둘": 2, "세": 3, "셋": 3, "네": 4, "넷": 4, "다섯": 5, "여섯": 6, "일곱": 7,
             "여덟": 8, "아홉": 9, "열": 10, "열한": 11, "열두": 12, "열세": 13, "열네": 14, "열다섯": 15, "스무": 20,
             "백": 100, "이백": 200, "삼백": 300, "사백": 400, "오백": 500, "육백": 600, "칠백": 700, "팔백": 800, "구백": 900,
             "천": 1000}
WEEKDAYS = "월화수목금토일"
NUM = r"(\d+(?:\.\d+)?|" + "|".join(sorted(NUM_WORDS, key=len, reverse=True)) + ")"


def _n(s: str) -> float:
    return float(s) if s[0].isdigit() else float(NUM_WORDS[s])


def _first(pairs, text):
    return next((v for pat, v in pairs if re.search(pat, text)), None)


def _weight(t: str) -> float | None:
    if m := re.search(NUM + r"\s*(?:톤|t(?![a-z]))", t):
        return _n(m.group(1))
    if m := re.search(NUM + r"\s*(?:킬로|kg|키로)", t):
        return round(_n(m.group(1)) / 1000, 3)
    return None


def _bags(t: str) -> int | None:
    m = re.search(r"마대\s*(?:가|는|로)?\s*" + NUM + r"\s*(?:개|포|자루)?", t) or re.search(NUM + r"\s*(?:개|포|자루)?\s*마대", t)
    return int(_n(m.group(1))) if m else None


def _day(t: str, base: date) -> date | None:
    if m := re.search(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일", t):
        mo, d = int(m.group(1)), int(m.group(2))
        try:
            got = date(base.year, mo, d)
        except ValueError:
            return None
        return got if got >= base - timedelta(days=31) else date(base.year + 1, mo, d)
    for word, plus in (("오늘", 0), ("내일", 1), ("모레", 2)):
        if word in t:
            return base + timedelta(days=plus)
    if m := re.search(r"(다음\s*주|이번\s*주)?\s*([월화수목금토일])요일", t):
        wd = WEEKDAYS.index(m.group(2))
        if m.group(1) and "다음" in m.group(1):
            return base + timedelta(days=7 - base.weekday() + wd)
        ahead = (wd - base.weekday()) % 7
        return base + timedelta(days=ahead)
    return None


def _time(t: str) -> str | None:
    m = re.search(r"(오전|오후|아침|저녁|낮)?\s*(\d{1,2}|" + "|".join(NUM_WORDS) + r")\s*시\s*(반|(\d{1,2})\s*분)?", t)
    if not m:
        return None
    h = int(_n(m.group(2)))
    if m.group(1) in ("오후", "저녁") and h < 12:
        h += 12
    mi = 30 if m.group(3) == "반" else int(m.group(4) or 0)
    return f"{h:02d}:{mi:02d}" if h < 24 and mi < 60 else None


def read_fields(text: str, base: date | None = None) -> dict:
    t = " ".join(text.lower().split())
    base = base or date.fromisoformat(today())
    day, hm = _day(t, base), _time(t)
    fields = {"kind": _first(KIND_WORDS, t), "material": _first(MATERIAL_WORDS, t), "weight": _weight(t), "bags": _bags(t),
              "departure": f"{day.isoformat()}T{hm or '09:00'}" if day else None,
              "checks": [c for pat, c in CHECK_WORDS if re.search(pat, t)]}
    fields["packaging"] = ("톤백" if "톤백" in t else "암롤박스" if "암롤" in t else "마대" if fields["bags"] is not None or "마대" in t
                           else "더미" if re.search(r"더미|쌓아|그냥\s*쌓", t) else None)
    if fields["packaging"] == "더미" and fields["bags"] is None:
        fields["bags"] = 0
    fields["timeGuessed"] = bool(day and not hm)
    return fields


LABEL = {"kind": "어구 종류", "material": "재질", "weight": "예상 반출량", "packaging": "담는 방식", "departure": "출항 예정 일시"}


def run(ctx: dict, llm=None) -> AgentResult:
    text = str(ctx.get("text") or "")
    f = read_fields(text)
    said = ev("input", "intake.text", "말한 내용")
    got = []
    if f["kind"]:
        got.append(f"어구 {f['kind']}")
    if f["material"]:
        got.append(f"재질 {f['material']}")
    if f["weight"] is not None:
        got.append(f"{f['weight']:g}톤")
    if f["packaging"] == "더미":
        got.append("포장 없는 더미")
    elif f["bags"] is not None:
        got.append(f"{f['packaging'] or '마대'} {f['bags']}개")
    if f["departure"]:
        got.append(f"출항 {f['departure'].replace('T', ' ')}")
    claims = []
    if got:
        claims.append(claim(ID, "말한 내용에서 읽은 칸: " + ", ".join(got), "fact", said, ev("calc", "규칙 기반 낱말, 숫자 읽기")))
    if f["checks"]:
        claims.append(claim(ID, "사전 점검 완료로 읽은 항목: " + ", ".join(f["checks"]), "fact", said))
    missing = [LABEL[k] for k in LABEL if f[k] in (None, [])]
    if missing:
        claims.append(claim(ID, "말한 내용에 없어 직접 입력 필요: " + ", ".join(missing), "question", said))
    if f["timeGuessed"]:
        claims.append(claim(ID, "출항 시각을 말하지 않아 오전 9시로 채움, 확인 필요", "question", said,
                            ev("assumption", "시각 기본값 09:00(팀 가정)")))
    if f["material"] is None and f["kind"]:
        f["material"] = "미확인"
    f["checks"] = [c for c in f["checks"] if c in CHECKS]
    return AgentResult(agent_id=ID, claims=claims, data={"fields": f})
