"""문의 글에서 연락처를 가린다(ARCHITECTURE §15, §17). 앱 밖 거래를 막는 것이 목적이라 '새 나가면 곤란한 것'만 가리고,
거래 글에 흔한 숫자(750kg, 380원/kg, 2026-11-05, 1,200,000원, 사업자번호 안내)는 두는 쪽으로 판단했다.
주문이 생긴 뒤의 주문 대화는 정책상 가리지 않는다(수거 연락에 전화번호가 필요하므로).

판단 근거
- 먼저 NFKC로 전각 문자(０１０, ＠)를 일반 문자로 바꾸고, 눈에 보이지 않는 제로폭 문자를 지운다(숫자 사이에 끼워 넣는 우회).
- 이메일: `@`뿐 아니라 `(at)`, `[at]`, 띄어 쓴 `at`/`dot`도 이메일로 본다. 오탐 가능성(영어 문장 'meet at store.com')은 받아들인다.
- 숫자열: 숫자 사이에 구분 문자(공백·줄바꿈·탭, 하이픈·점·밑줄·슬래시·괄호·엔/엠대시·가운뎃점·ㆍ)가 최대 3개 끼어도 한 열로 본다.
  숫자가 9~11개이고 0으로 시작하면 전화번호, +82로 시작하거나 15xx~18xx 8자리면 전화번호, 그 밖에 10~16개면 계좌번호로 본다.
  단위(원·kg)가 붙어 있어도 10자리 이상이면 가린다. 쉼표가 낀 금액(1,200,000원)은 쉼표가 구분 문자가 아니라 한 열이 되지 않는다.
- 예외는 하나: 사업자등록번호 모양(3-2-5, 하이픈)이면서 앞 세 자리가 전화 국번(01x~09x)이 아닌 것. 앱이 안내하는 공개 식별자이기 때문이다.
  010-12-34567 같은 것은 전화번호로 보고 가린다.
- 공백만으로 이어진 숫자는 평균 묶음 길이가 2.5자리 미만이면(10 20 30 40 50) 한 번호로 보지 않는다.
- 알려진 한계: "공일공"처럼 글자로 푼 번호, 숫자를 글자로 끊은 우회는 못 잡는다. 날짜 두 개를 공백으로만 이어 쓴 글(2026-11-05 2026-11-06)이나
  1500-2000 같은 값은 가려질 수 있다. 완전한 차단이 아니라 억제 장치이고, 신고 경로가 보완한다.
"""
import re
import unicodedata


MASK = "***"


ZERO_WIDTH = re.compile("[​-‏⁠﻿]")


EMAIL = re.compile(
    r"[\w.+-]+\s*(?:@|\(at\)|\[at\]|\{at\}|(?<=\s)at(?=\s))\s*[\w-]+(?:\s*(?:\.|\(dot\)|\[dot\]|\{dot\}|(?<=\s)dot(?=\s))\s*[\w-]+)+",
    re.IGNORECASE)


SEP = "[\\s\\-._/\\\\()\\[\\]ㆍ\u119e·–—−]"   # NFKC가 ㆍ(U+318D)를 U+119E로 바꾸므로 둘 다


CANDIDATE = re.compile(rf"[(\[]?\+?\d(?:{SEP}{{0,3}}\d)+[)\]]?(?!\d)")


BIZ_NO = re.compile(r"\d{3}-\d{2}-\d{5}")


PHONE_PREFIX = re.compile(r"0[1-9]\d")


def _should_mask(candidate: str) -> bool:
    core = candidate.strip("()[] ")
    digits = re.sub(r"\D", "", core)
    n = len(digits)
    if BIZ_NO.fullmatch(core) and not PHONE_PREFIX.match(digits):
        return False
    groups = re.findall(r"\d+", core)
    seps = re.findall(rf"(?<=\d)({SEP}+)(?=\d)", core)
    if seps and all(s.isspace() for s in seps) and sum(len(g) for g in groups) / len(groups) < 2.5:
        return False
    if core.startswith("+82") and n >= 10:
        return True
    if digits.startswith("0") and 9 <= n <= 11:
        return True
    if n == 8 and re.match(r"1[5-8]\d\d", digits):
        return True
    return 10 <= n <= 16


def _phone_end(candidate: str) -> int:
    """전화번호 모양(0으로 시작 9~11자리, +82로 시작 11~13자리)이 마지막 묶음 4자리에서 끝나면 거기까지의 길이. 아니면 전체 길이."""
    core = candidate.lstrip("([")
    digits_seen, lead = 0, len(candidate) - len(core)
    phone_like = core.startswith("0") or core.startswith("+82")
    if phone_like:
        for g in re.finditer(r"\d+", core):
            digits_seen += len(g.group())
            lo, hi = (11, 13) if core.startswith("+") else (9, 11)
            if len(g.group()) == 4 and lo <= digits_seen <= hi:
                end = lead + g.end()
                if candidate[end:end + 1] in ")]":
                    end += 1
                return end
    return len(candidate)


def mask_contacts(text: str) -> tuple[str, bool]:
    """(가린 글, 가렸는지)."""
    out = ZERO_WIDTH.sub("", unicodedata.normalize("NFKC", text))
    hits = 0

    def email(m: re.Match) -> str:
        nonlocal hits
        hits += 1
        return MASK

    def number(m: re.Match) -> str:
        nonlocal hits
        text = m.group()
        cut = _phone_end(text)   # 전화번호 뒤에 공백으로 이어진 750kg 같은 숫자까지 지우지 않는다
        head, tail = text[:cut], text[cut:]
        if _should_mask(head):
            hits += 1
            return MASK + tail
        return text

    out = EMAIL.sub(email, out)
    out = CANDIDATE.sub(number, out)
    return out, hits > 0
