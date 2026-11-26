"""문구 규칙 재발 방지(ARCHITECTURE §23.1). 화면에 나가는 문자열에 중간점이나 구어체 끝맺음이 있으면 실패한다."""
import ast
import json
import re
from pathlib import Path

from app.core.config import waste_names
from app.features.market.service import latest_prices
from app.harness.gates import has_colloquial_ending, strip_ungrounded, to_noun_style
from app.tools.data import DATA_DIR, load_json, plain_marks

BACKEND = Path(__file__).resolve().parents[1]
MID_DOT = re.compile("[·･・‧]")
COLLOQUIAL = re.compile(r"(십시오|세요|해요|입니다|합니다|습니다|됩니다|니다|까요|주세요)")

# 파일 -> 이 글자로 시작하는 문자열은 검사하지 않는다. 사유는 줄 끝에 적는다.
EXCEPTIONS = {
    "app/agents/_common.py": ["너는 폐기물 거래 앱의 설명 도우미다"],             # LLM 시스템 프롬프트(지시문과 금지할 끝맺음 예시)
    "app/agents/orchestrator.py": ["문장은 '있음'", "너는 폐기물 거래 앱의 대화 도우미다"],   # LLM 시스템 프롬프트
    "app/features/knowledge/router.py": ["당신은 산업 폐기물 자료 안내원입니다"],        # LLM 시스템 프롬프트
    "app/agents/sorting/intake.py": ["너는 폐기물 마대 등록 화면의 칸을 채우는 도우미다"],   # LLM 시스템 프롬프트('아니다'의 '니다')
    "app/agents/trade/want_intake.py": ["너는 폐기물 원료 구매 희망 화면의 칸을 채우는 도우미다"],   # LLM 시스템 프롬프트('아니다'의 '니다')
    "app/features/inquiries/contact_mask.py": ["[\\s\\-._/"],                   # 연락처 가림 정규식(구분 문자 집합)
    "app/harness/gates.py": [                                                   # 말투 변환과 검사 규칙 정의
        "(모르|미확인", "니다", "\\s*[·･・‧]\\s*", "(?:니다|세요", "입니다", "있습니다", "없습니다", "않습니다",
        "됩니다", "되었습니다", "했습니다", "합니다"],
    "app/tools/data.py": ["\\s*[·･・‧]\\s*"],                                    # 데이터 읽기 중간점 변환 정규식
    "app/tools/knowledge.py": ["해야\\s*할|알려\\s*줘"],                           # 질문에서 뺄 말 정규식(사용자가 쓰는 말)
}


def _docstring_ids(tree):
    ids = set()
    for n in ast.walk(tree):
        if isinstance(n, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and n.body:
            first = n.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) and isinstance(first.value.value, str):
                ids.add(id(first.value))
    return ids


def _violations():
    out = []
    for root in ("app", "seed"):
        for path in sorted((BACKEND / root).rglob("*.py")):
            rel = path.relative_to(BACKEND).as_posix()
            tree = ast.parse(path.read_text(encoding="utf-8"))
            skip = _docstring_ids(tree)
            allowed = EXCEPTIONS.get(rel, [])
            for n in ast.walk(tree):
                if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in skip:
                    s = n.value
                    if any(s.startswith(a) for a in allowed):
                        continue
                    if MID_DOT.search(s) or COLLOQUIAL.search(s):
                        out.append(f"{rel}:{n.lineno}: {s[:60]!r}")
    return out


def test_source_strings_follow_copy_rules():
    assert _violations() == []


def test_exceptions_still_exist():
    """예외 목록이 낡아 아무것도 가리키지 않으면 지운다."""
    for rel, prefixes in EXCEPTIONS.items():
        tree = ast.parse((BACKEND / rel).read_text(encoding="utf-8"))
        strings = [n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str)]
        for p in prefixes:
            assert any(s.startswith(p) for s in strings), (rel, p)


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for v in value:
            yield from _strings(v)
    elif isinstance(value, dict):
        for v in value.values():
            yield from _strings(v)


def test_load_json_has_no_middle_dots():
    for f in sorted(DATA_DIR.glob("*.json")):
        bad = [s for s in _strings(load_json(f.name)) if MID_DOT.search(s)]
        assert not bad, (f.name, bad[:2])


def test_load_json_keeps_keys_and_original_files():
    raw = json.loads((DATA_DIR / "prices.json").read_text(encoding="utf-8"))
    assert any(MID_DOT.search(r["basis"]) for r in raw)        # 원본 파일은 그대로
    assert plain_marks({"a·b": "건조･선별 ·세척"}) == {"a·b": "건조, 선별, 세척"}
    assert load_json("prices.json")[0].keys() == raw[0].keys()


def test_other_data_readers_have_no_middle_dots():
    assert not [n for n in waste_names().values() if MID_DOT.search(n)]
    assert any("," in n for n in waste_names().values())
    assert not [r for r in latest_prices() if MID_DOT.search(str(r))]


def test_to_noun_style_rules():
    assert to_noun_style("수거·운반 가능합니다. 허가가 있습니다.") == "수거, 운반 가능\n허가가 있음"
    assert to_noun_style("A등급입니다.") == "A등급"
    assert to_noun_style("서류가 없습니다. 검사는 끝났습니다.") == "서류가 없음\n검사는 끝났습니다"
    assert has_colloquial_ending("검사는 끝났습니다")
    assert not has_colloquial_ending(to_noun_style("승인됩니다. 수 있습니다."))
    assert has_colloquial_ending(to_noun_style("서류를 확인하세요."))


def test_grounding_check_works_on_noun_style():
    sources = ["PP 압축 최근 시세 340원/kg 확인 필요", "허가 코드가 들어 있음"]
    kept, dropped = strip_ungrounded("PP 압축 시세 확인 필요\n태양광 발전소 설치 비용 지원 있음", sources)
    assert "PP 압축" in kept and "태양광" not in kept and dropped == ["근거 밖 문장"]
