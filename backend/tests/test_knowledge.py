"""지식 질문 POST /v1/knowledge/ask: 근거는 코드가 찾고, LLM 문장은 게이트를 넘어야 한다. 빌드는 공개 조건을 지킨다."""
import csv
import importlib.util
import json
from pathlib import Path

import pytest

from app.features.knowledge import router as knowledge_router
from app.llm.base import LLMReply
from app.tools import knowledge
from tests.conftest import H
from tests.test_trade_v02 import world

DOCS = [
    {"kind": "law", "id": "wma-18-3", "title": "법 제18조 제3항 전자인계서", "text": "배출자 운반자 처리자가 인계서를 입력한다.", "source": "폐기물관리법", "url": ""},
    {"kind": "rule", "id": "crit-cl", "title": "R-8-1 기준: 염소농도", "text": "시멘트 보조연료 염소농도 무게의 2퍼센트 미만", "source": "별표 5의3", "url": ""},
    {"kind": "cement", "id": "CEM-1", "title": "삼표시멘트 삼척공장 2026Q3 폐수처리오니", "text": "삼표시멘트 삼척공장 폐수처리오니 반입량 21291.25톤", "source": "삼표시멘트 공개", "url": ""},
]
PLANTS = [
    {"id": "F1", "name": "구미플라", "park": "", "sido": "경상북도", "sigungu": "구미시", "products": "사출", "industry": "플라스틱", "wastes": "폐합성수지", "summary": "폐합성수지 10t(2024)", "completeness": "B 충분"},
    {"id": "F2", "name": "구미완전", "park": "", "sido": "경상북도", "sigungu": "구미시", "products": "사출", "industry": "플라스틱", "wastes": "폐합성수지;오니", "summary": "폐합성수지 20t(2024)", "completeness": "A 완전"},
    {"id": "F3", "name": "삼척오니", "park": "", "sido": "강원도", "sigungu": "삼척시", "products": "", "industry": "", "wastes": "오니", "summary": "오니 1t(2020)", "completeness": "D 종류만"},
]


class FakeLLM:
    name, model = "fake", "fake"

    def __init__(self, text=None, error=None):
        self.text, self.error, self.prompts = text, error, []

    def chat(self, system, user, schema=None):
        self.prompts.append(user)
        if self.error:
            raise self.error
        return LLMReply(text=self.text, model="fake")


@pytest.fixture
def setup(tmp_path, monkeypatch, client):
    (tmp_path / "docs.json").write_text(json.dumps(DOCS, ensure_ascii=False), encoding="utf-8")
    (tmp_path / "factories.json").write_text(json.dumps(PLANTS, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setenv("KNOWLEDGE_DIR", str(tmp_path))
    knowledge._index.cache_clear()
    yield world(client)["f"]
    knowledge._index.cache_clear()


def use_llm(monkeypatch, llm):
    monkeypatch.setattr(knowledge_router, "get_provider", lambda: llm)
    return llm


def ask(client, who, question):
    return client.post("/v1/knowledge/ask", headers=H(who), json={"question": question})


def test_needs_login(setup, client):
    assert client.post("/v1/knowledge/ask", json={"question": "인계서"}).status_code in (401, 403)


def test_question_length_and_missing_data(setup, client, monkeypatch):
    who = setup
    assert ask(client, who, "   ").status_code == 422
    assert ask(client, who, "가" * 301).status_code == 422
    monkeypatch.setenv("KNOWLEDGE_DIR", "/없는/폴더")
    assert ask(client, who, "인계서").status_code == 503


def test_unrelated_question_does_not_call_llm(setup, client, monkeypatch):
    llm = use_llm(monkeypatch, FakeLLM("아무 말 [1]"))
    body = ask(client, setup, "오늘 날씨 어때?").json()
    assert body["source"] == "none" and body["sources"] == [] and llm.prompts == []


def test_llm_answer_is_used_when_grounded(setup, client, monkeypatch):
    use_llm(monkeypatch, FakeLLM("염소농도는 무게의 2퍼센트 미만입니다 [1]."))
    body = ask(client, setup, "시멘트 보조연료 염소 기준이 뭐야?").json()
    assert body["source"] == "llm" and "[1]" in body["answer"] and body["sources"][0]["id"] == "crit-cl"


def test_citation_after_final_period_counts(setup, client, monkeypatch):
    """실제 모델은 '...입니다. [1]'로 끝내고, clean_llm_text는 그 번호를 지운다."""
    use_llm(monkeypatch, FakeLLM("염소농도는 무게의 2퍼센트 미만입니다. [1]"))
    body = ask(client, setup, "시멘트 보조연료 염소 기준이 뭐야?").json()
    assert body["source"] == "llm" and body["answer"].startswith("염소농도는")


@pytest.mark.parametrize("reply", [
    "염소농도는 무게의 7퍼센트 미만입니다 [1].",      # 자료에 없는 숫자
    "염소농도 기준이 있습니다.",                     # 근거 번호 없음
    "염소농도 기준이 있습니다 [9].",                  # 없는 근거 번호
    "",
])
def test_ungrounded_llm_answer_falls_back_to_sources(setup, client, monkeypatch, reply):
    use_llm(monkeypatch, FakeLLM(reply))
    body = ask(client, setup, "시멘트 보조연료 염소 기준이 뭐야?").json()
    assert body["source"] == "template" and body["answer"] == knowledge_router.TEMPLATE_ANSWER and body["sources"]


def test_llm_failure_falls_back(setup, client, monkeypatch):
    use_llm(monkeypatch, FakeLLM(error=TimeoutError("끊김")))
    assert ask(client, setup, "인계서 입력").json()["source"] == "template"
    use_llm(monkeypatch, None)
    assert ask(client, setup, "인계서 입력").json()["source"] == "template"


def test_factory_question_uses_alias_region_order_and_limit_note(setup, client, monkeypatch):
    llm = use_llm(monkeypatch, FakeLLM("지어낸 공장 [1]"))
    body = ask(client, setup, "구미에 플라스틱 배출하는 공장 어디 있어?").json()
    assert body["factory_total"] == 2 and body["source"] == "data" and "구미 폐합성수지 기록이 있는 공장 2곳" in body["answer"]
    assert [s["id"] for s in body["sources"]] == ["F2", "F1"]     # 기록이 완전한 공장 먼저
    assert "앱 가입 업체가 아니며" in body["notes"][0] and llm.prompts == []


def test_document_question_with_factory_word_stays_on_documents(setup, client, monkeypatch):
    use_llm(monkeypatch, None)
    body = ask(client, setup, "삼표시멘트 삼척공장 폐수처리오니 반입량").json()
    assert body["sources"][0]["id"] == "CEM-1" and body["factory_total"] == 0 and body["notes"] == []


def _load_builder():
    path = Path(__file__).resolve().parents[1] / "scripts" / "build_knowledge.py"
    spec = importlib.util.spec_from_file_location("build_knowledge", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_builder_drops_personal_rows_coordinates_and_contacts(tmp_path):
    path = tmp_path / "service_factories.csv"
    fields = ["factory_id", "회사명", "단지명", "시도", "시군구", "주소", "생산품", "업종_묶음", "lat", "lon", "좌표_출처", "폐기물_목록", "폐기물_요약", "최고_완전도", "연락처"]
    row = {k: "" for k in fields}
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fields)
        w.writeheader()
        w.writerow({**row, "factory_id": "1", "회사명": "개인", "좌표_출처": "공공"})
        w.writerow({**row, "factory_id": "2", "회사명": "가상공업", "lat": "36.1234", "lon": "128.5678", "좌표_출처": "카카오(내부)", "연락처": "054-000-0000"})
        w.writerow({**row, "factory_id": "3", "회사명": "공공공업", "lat": "36.5", "lon": "128.5", "좌표_출처": "공공"})
        w.writerow({**row, "factory_id": "4", "회사명": "변환공업", "lat": "36.1111", "lon": "128.1111", "좌표_출처": "카카오(내부)"})
    plants, _ = _load_builder().factories(path, {"4": (36.2, 128.2)})
    by_id = {p["id"]: p for p in plants}
    assert sorted(by_id) == ["2", "3", "4"]
    assert (by_id["2"]["lat"], by_id["2"]["coord_source"]) == (None, None)      # 카카오 좌표는 옮기지 않는다
    assert (by_id["3"]["lat"], by_id["3"]["coord_source"]) == (36.5, "public")
    assert (by_id["4"]["lat"], by_id["4"]["coord_source"]) == (36.2, "juso")    # 행안부 변환값이 카카오 값을 대신한다
    text = json.dumps(plants, ensure_ascii=False)
    for hidden in ("36.1234", "128.5678", "36.1111", "054-000-0000"):
        assert hidden not in text


def test_builder_hides_recognition_holder_and_evaluation_applicant():
    b = _load_builder()
    rows = [{"material": "(51-03-01) 폐합성수지류", "use": "[R-4-4] 제조", "holder": "숨길회사", "year": y, "region": "충남 천안시"} for y in (2024, 2026)]
    docs = b.recognition_docs(rows)
    assert len(docs) == 1 and "2건" in docs[0]["text"] and "숨길회사" not in json.dumps(docs, ensure_ascii=False)
    evals = b.eval_docs([{"no": "제1호", "date": "2017-07-28", "waste": "받침목", "wasteCode": "51-22-02", "method": "재활용", "applicant": "숨길회사", "address": "숨길주소"}])
    text = json.dumps(evals, ensure_ascii=False)
    assert "숨길회사" not in text and "숨길주소" not in text


def _load_geocoder():
    path = Path(__file__).resolve().parents[1] / "scripts" / "geocode_factories.py"
    spec = importlib.util.spec_from_file_location("geocode_factories", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("address, expected", [
    ("서울특별시 중구 창경궁로1길 14, B1층(충무로4가)", "서울특별시 중구 창경궁로1길 14"),     # 로 바로 뒤 숫자는 도로 이름
    ("서울특별시 금천구 가산디지털2로 123 7층 714호 (가산동)", "서울특별시 금천구 가산디지털2로 123"),
    ("전라남도 목포시 삼학로158번길 31 외 4필지", "전라남도 목포시 삼학로158번길 31"),
    ("경기도 화성시 팔탄면 구장리 산 12", "경기도 화성시 팔탄면 구장리 산 12"),
    ("경북 구미시 경인로154", "경북 구미시 경인로154"),
])
def test_geocoder_cleans_address(address, expected):
    assert _load_geocoder().clean_address(address) == expected


def test_geocoder_does_not_guess_between_several_results():
    g = _load_geocoder()
    a, b = {"roadAddrPart1": "구미시 가상로 1", "jibunAddr": "구미시 가상동 1"}, {"roadAddrPart1": "구미시 가상로 12", "jibunAddr": "구미시 가상동 2"}
    assert g.pick("구미시 가상로 1", [a]) == a
    assert g.pick("구미시 가상로 1", [a, b]) == a      # 똑같이 맞는 것 하나
    assert g.pick("구미시 가상로", [a, b]) is None     # 똑같이 맞는 것 없음
    assert g.pick("구미시 가상로 1", [a, a]) is None   # 여럿이 똑같이 맞음
