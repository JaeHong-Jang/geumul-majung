"""계약 27절: 마대 등록 말 입력(음성 인식 → 말 입력 정리 → 재질 추천). AI 값은 말한 글에 있어야 하고 자동 제출은 없다."""
from datetime import date

import pytest

from app.agents.sorting import intake, material
from app.features._shared import flows
from app.harness.runner import run_flow
from app.llm.mock import MockProvider
from app.tools import stt
from tests.conftest import H
from tests.test_trade_scenario import make_bag, setup_world

TODAY = date(2026, 11, 7)    # 토요일


def llm_says(**out):
    base = {"waste_code": "", "material": "", "weight_kg": 0, "pickup_note": "", "note": ""}
    return MockProvider(lambda system, user, schema: {**base, **out})


def fields(text, llm=None, **ctx):
    res = intake.run({"transcript": text, "today": TODAY, **ctx}, llm)
    return res.data["fields"], res


# ---- 규칙 ----
def test_weight_units_and_ambiguity():
    assert intake.find_weight("PP 300kg 있음") == (300.0, 1)
    assert intake.find_weight("고철 1.2톤") == (1200.0, 1)
    assert intake.find_weight("1,500 킬로") == (1500.0, 1)
    assert intake.find_weight("300키로랑 200키로") == (None, 2)     # 둘이면 채우지 않음


def test_relative_dates():
    assert intake.find_date("다음 주 화요일부터", TODAY) == date(2026, 11, 10)
    assert intake.find_date("이번 주 금요일", TODAY) == date(2026, 11, 13)    # 지난 요일이면 다음 그 요일
    assert intake.find_date("내일 가능", TODAY) == date(2026, 11, 8)
    assert intake.find_date("12월 3일", TODAY) == date(2026, 12, 3)
    assert intake.find_date("1월 5일", TODAY) == date(2027, 1, 5)
    assert intake.find_date("수거 부탁", TODAY) is None


def test_longest_alias_wins():
    assert intake.find_materials("피이티 병이랑 피이 필름") == ["pet", "pe"]
    assert intake.find_materials("pet 100kg") == ["pet"]                 # pet 안의 pe를 따로 세지 않음


def test_keyword_beats_material_and_mixed_box_is_not_main():
    f, res = fields("폐합성수지 1.2톤, 박스랑 비닐 조금 섞였어요")
    assert f["waste_code"] == "51-03-01" and f["weight_kg"] == 1200
    assert "material" not in f                                            # 섞인 박스(골판지)는 주 재질이 아님
    assert any("다른 재질 언급" in c.text for c in res.claims)
    assert fields("플라스틱 포장재 200킬로")[0]["waste_code"] == "51-03-07"


def test_rule_only_when_llm_off():
    f, res = fields("PP 사출 자투리 300kg, 다음 주 화요일부터 가능")
    assert f == {"waste_code": "51-03-01", "material": "PP", "weight_kg": 300.0, "available_from": "2026-11-10"}
    assert res.data["llm"] == "off" and not res.used_llm


# ---- LLM 검산 ----
def test_llm_values_not_in_speech_are_dropped():
    f, res = fields("PP 자투리 있어요", llm_says(weight_kg=500, material="ABS", pickup_note="후문 창고", note="깨끗함"))
    assert f == {"waste_code": "51-03-01", "material": "PP"}             # 말하지 않은 무게, 장소, 상태는 버림
    assert set(res.data["dropped"]) == {"weight_kg", "pickup_note", "note"}


def test_llm_fills_free_text_only_from_speech():
    f, _ = fields("고철 500kg, 정문 지게차 앞에 둘게요", llm_says(pickup_note="정문 지게차 앞", note="500kg 있음"))
    assert f["pickup_note"] == "정문 지게차 앞" and "note" not in f       # 무게가 든 메모는 받지 않음


def test_llm_may_fix_misheard_words_in_free_text():
    f, res = fields("고철 500키로 후문 창고 아페 둘게요 라벨 조금 서끔",
                    llm_says(pickup_note="후문 창고 앞", note="라벨 조금 섞임"))
    assert f["pickup_note"] == "후문 창고 앞" and f["note"] == "라벨 조금 섞임"
    assert set(res.data["fixed"]) == {"pickup_note", "note"} and not res.data["dropped"]
    assert any("잘못 들린 낱말을 고쳐 채움" in c.text and c.level == "question" for c in res.claims)


@pytest.mark.parametrize("heard, fixed", [
    ("정문지개 자랍", "정문 지게차"), ("정문 지게자 압에 둠", "정문 지게차"), ("오염 업슴", "오염 없음"),
    ("마데 두 개 정문", "마대 두 개 정문"), ("이믈질 조금", "이물질 조금"),
])
def test_sound_alike_fix_is_accepted(heard, fixed):
    assert intake.heard_fix(fixed, heard)


@pytest.mark.parametrize("heard, changed", [
    ("후문 창고 앞", "정문 창고 앞"), ("오염 없음", "오염 있음"), ("오염 업슴", "오염 있음"), ("후문 창고 옆", "후문 창고 앞"),
    ("정문지개 자랍", "정문 지게차 뒤"), ("정문지개 자랍", "정문 앞"), ("라벨 조금 섞임", "라벨 많이 섞임"),
    ("일층 창고", "이층 창고"), ("마대 두 개", "마대 세 개"), ("정문 오른쪽", "정문 왼쪽"), ("후문 창고 아페", "후문 창고 3번"),
    ("PP 자투리 있어요", "후문 창고"),
])
def test_meaning_change_is_not_a_fix(heard, changed):
    assert not intake.heard_fix(changed, heard)                            # 방향, 있고 없음, 숫자, 새 내용은 고칠 수 없음


def test_llm_category_name_is_not_material():
    f, _ = fields("폐합성수지 100kg", llm_says(material="폐합성수지"))
    assert "material" not in f


def test_private_values_never_filled():
    f, res = fields("알루미늄 캔 80키로, 연락은 010-1234-5678", llm_says(note="연락은 010-1234-5678"))
    assert "note" not in f and "010" not in str(res.data)
    assert any("개인정보" in c.text for c in res.claims)


def test_failed_llm_keeps_rule_values():
    f, res = fields("PP 300kg", MockProvider(fail=True))
    assert f["weight_kg"] == 300 and res.data["llm"] == "failed"


def test_transcript_not_stored_in_run_data():
    r = run_flow("bag_intake", {"transcript": "PP 300kg 정문 앞 비밀메모", "today": "2026-11-07", "skip_llm_summary": True}, llm=None)
    assert "비밀메모" not in str(r.model_dump(mode="json"))


# ---- 재질 추천 ----
def basis(history=None, market=None):
    return {"history": history or {}, "market": market or {}}


def test_single_material_code_autofills():
    d = material.run({"waste_code": "51-29-01", **basis()}).data
    assert d["auto"] == "철" and d["candidates"][0]["reasons"] == ["이 품목의 유일한 재질"]


def test_history_beats_market():
    d = material.run({"waste_code": "51-03-01", **basis({"51-03-01": {"pp": 2}}, {"51-03-01": {"pe": 900.0}})}).data
    assert d["auto"] == "PP" and [c["material"] for c in d["candidates"]][:2] == ["PP", "PE"]


def test_no_basis_means_no_autofill():
    d = material.run({"waste_code": "51-03-07", **basis()}).data
    assert d["auto"] is None and [c["material"] for c in d["candidates"]] == ["PE", "PP", "PET"]


def test_spoken_material_not_overwritten():
    r = run_flow("bag_intake", {"transcript": "ABS 100kg", "today": "2026-11-07", "skip_llm_summary": True,
                                **basis({"51-03-01": {"pp": 5}})}, llm=None)
    d = {x.agent_id: x.data for x in r.results}
    assert d["intake"]["fields"]["material"] == "ABS" and d["material"]["auto"] is None
    assert all(not c.blocked for x in r.results for c in x.claims)         # 단계 문장이 게이트를 통과함


# ---- 경로 ----
@pytest.fixture
def real_flow(monkeypatch):
    monkeypatch.setattr(flows, "load_run_flow", lambda: lambda flow, ctx: run_flow(flow, ctx, llm=None))


def test_intake_text_endpoint(client, real_flow):
    w = setup_world(client)
    make_bag(client, w["f"], 97, 3)                                         # 지난 등록 PP 1회
    r = client.post("/v1/bags/intake", headers=H(w["f"]), json={"text": "합성수지 300kg 내일 가능"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["fields"] == {"waste_code": "51-03-01", "weight_kg": 300.0, "available_from": d["fields"]["available_from"]}
    assert d["material"]["auto"] == "PP" and [s["id"] for s in d["steps"]] == ["intake", "material"]
    assert d["steps"][1]["name"] == "재질 추천" and d["run_id"]
    assert client.get("/v1/bags/0", headers=H(w["f"])).status_code == 404    # 마대는 만들지 않음


def test_intake_rules(client, real_flow):
    w = setup_world(client)
    assert client.post("/v1/bags/intake", headers=H(w["r"]), json={"text": "PP 300kg"}).status_code == 403
    assert client.post("/v1/bags/intake", headers=H(w["f"]), json={}).status_code == 400
    assert client.post("/v1/bags/intake", headers=H(w["f"]), json={"text": "PP", "audio_base64": "AAAA",
                                                                    "content_type": "audio/webm"}).status_code == 400


def test_intake_audio_endpoint(client, real_flow, monkeypatch):
    w = setup_world(client)
    body = {"audio_base64": "AAAA", "content_type": "audio/webm"}
    monkeypatch.setattr(stt, "available", lambda: False)
    assert client.post("/v1/bags/intake", headers=H(w["f"]), json=body).status_code == 503
    monkeypatch.setattr(stt, "available", lambda: True)
    monkeypatch.setattr(stt, "transcribe", lambda raw: {"text": "고철 500kg", "seconds": 2.0, "model": "whisper-small", "ms": 5})
    d = client.post("/v1/bags/intake", headers=H(w["f"]), json=body).json()
    assert d["transcript"] == "고철 500kg" and d["fields"]["material"] == "철"
    assert [s["id"] for s in d["steps"]] == ["stt", "intake", "material"]
    monkeypatch.setattr(stt, "transcribe", lambda raw: {"text": "", "seconds": 1.0, "model": "whisper-small", "ms": 5})
    assert client.post("/v1/bags/intake", headers=H(w["f"]), json=body).status_code == 400

    def bad(raw):
        raise stt.AudioError("음성 파일을 읽을 수 없음")
    monkeypatch.setattr(stt, "transcribe", bad)
    r = client.post("/v1/bags/intake", headers=H(w["f"]), json=body)
    assert r.status_code == 400 and r.json()["detail"] == "음성 파일을 읽을 수 없음"


def test_material_suggest_endpoint(client, real_flow, monkeypatch):
    w = setup_world(client)
    r = client.get("/v1/bags/material-suggest", headers=H(w["f"]), params={"waste_code": "51-29-01"})
    assert r.status_code == 200, r.text
    assert r.json()["auto"] == "철" and r.json()["steps"][0]["lines"]
    assert client.get("/v1/bags/material-suggest", headers=H(w["f"]), params={"waste_code": "99-99-99"}).status_code == 422
    monkeypatch.setattr(stt, "available", lambda: False)
    assert client.get("/v1/bags/intake/status", headers=H(w["f"])).json() == {"stt": False}


def test_spoken_sale_price_and_unit_words_are_not_weight():
    f, res = fields("PP 사출 자투리 300kg, kg당 350원에 팔고 싶어요")
    assert (f["weight_kg"], f["price_krw_per_kg"]) == (300.0, 350.0)
    assert "판매 가격 350원/kg" in [c.text for c in res.claims]
    assert fields("고철 1톤 톤당 35만원")[0]["price_krw_per_kg"] == 350.0             # 톤당 가격은 원/kg로
    assert fields("PP 300kg 1kg에 400원")[0]["weight_kg"] == 300.0                  # 1kg에는 무게가 아님
    f, res = fields("PP 300kg 300에서 350원")
    assert "price_krw_per_kg" not in f and any("시세 기준으로 채움" in c.text for c in res.claims)


def test_misheard_units_are_fixed_before_reading():
    f, _ = fields("PET 시트 타발 자투리 500번지 길로 있어요")                       # 실제 음성 인식 결과(합성 음성)
    assert (f["material"], f["weight_kg"]) == ("PET", 500.0)
    assert fields("PP 300kg 케이지탕 350원")[0]["price_krw_per_kg"] == 350.0
    assert fields("이 길로 300kg 옮겨요")[0]["weight_kg"] == 300.0                   # 숫자 뒤가 아니면 고치지 않음


def test_commas_from_speech_recognition_do_not_break_units():
    assert fields("페트, 시트, 타발, 자투리, 500번지, 길로 있어요")[0]["weight_kg"] == 500.0
    assert fields("PP 500, 킬로")[0]["weight_kg"] == 500.0
    assert fields("PP 1,500 킬로")[0]["weight_kg"] == 1500.0                        # 천 단위 쉼표는 숫자
