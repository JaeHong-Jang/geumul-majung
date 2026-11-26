"""계약 29절: 구매 희망 말 입력(음성 인식 → 구매 희망 정리 → 희망가 추천). AI 값은 말한 글에 있어야 하고 자동 제출은 없다."""
from datetime import date

import pytest

from app.agents.trade import want_intake, want_match, want_price
from app.features._shared import flows
from app.harness.runner import run_flow
from app.llm.mock import MockProvider
from app.tools import stt
from tests.conftest import H
from tests.test_trade_v02 import listed, world

TODAY = date(2026, 11, 13)    # 금요일


def llm_says(**out):
    base = {"material": "", "item": "", "qty_kg": 0, "price_min": 0, "price_max": 0, "note": ""}
    return MockProvider(lambda system, user, schema: {**base, **out})


def fields(text, llm=None):
    res = want_intake.run({"transcript": text, "today": TODAY}, llm)
    return res.data["fields"], res


# ---- 규칙 ----
def test_full_sentence_fills_every_rule_field():
    f, res = fields("PP 사출 스크랩 5톤 필요하고 kg당 300에서 350원 정도, 협상 가능해요. 매달 정기로 받고 싶고 다음 주 금요일까지")
    assert f == {"material": "PP", "waste_code": "51-03-01", "qty_kg": 5000.0, "price_min_krw_per_kg": 300.0,
                 "price_max_krw_per_kg": 350.0, "price_unit": "kg", "repeat": "monthly", "negotiable": True,
                 "need_by": "2026-11-20"}
    assert res.data["llm"] == "off" and "희망 가격 300~350원/kg" in [c.text for c in res.claims]


def test_ton_prices_become_per_kg_and_unit_words_are_not_quantity():
    f, res = fields("고철 20톤, 톤당 30만에서 35만 원, 가격 협상은 안 돼요")
    assert (f["qty_kg"], f["price_min_krw_per_kg"], f["price_max_krw_per_kg"], f["price_unit"]) == (20000.0, 300.0, 350.0, "ton")
    assert f["negotiable"] is False
    assert fields("PP 1톤, 가격 협상은 안 됩니다")[0]["negotiable"] is False
    assert any("톤당 가격을 kg당으로 바꿈" in c.text for c in res.claims)
    f, _ = fields("구리선 500킬로 한 번만, 1kg에 9000원")
    assert (f["material"], f["qty_kg"], f["price_min_krw_per_kg"], f["repeat"]) == ("구리", 500.0, 9000.0, "once")


def test_unsure_values_stay_empty():
    f, res = fields("PE 2톤, 300원 350원 400원")
    assert "price_min_krw_per_kg" not in f and any("가격을 셋 이상" in c.text for c in res.claims)
    f, res = fields("PP 300kg이랑 500kg")
    assert "qty_kg" not in f and any("수량을 둘 이상" in c.text for c in res.claims)
    f, _ = fields("골판지 1톤")
    assert set(f) == {"material", "waste_code", "qty_kg"}                     # 말하지 않은 협상, 주기는 건드리지 않음
    assert fields("")[1].claims[0].text == "인식된 말 없음, 다시 녹음 필요"


# ---- LLM 검산 ----
def test_llm_values_must_be_in_the_text():
    text = "PP 분쇄품 3톤 정도 사고 싶어요, 세척된 것만 받아요"
    f, res = fields(text, llm_says(item="분쇄품", note="세척된 것만 받아요", price_min=300, price_max=350))
    assert f["item"] == "분쇄품" and f["note"] == "세척된 것만 받아요"
    assert "price_min_krw_per_kg" not in f and res.data["dropped"] == ["price"]     # 말하지 않은 가격은 버림
    f, res = fields("알루미늄 사고 싶어요", llm_says(material="구리", qty_kg=500))
    assert "qty_kg" not in f and set(res.data["dropped"]) == {"qty_kg"}             # 재질은 규칙이 먼저 채움
    f, res = fields("스크랩 2천 킬로 정도", llm_says(material="폐합성수지", note="2천 킬로"))
    assert "material" not in f and set(res.data["dropped"]) == {"material", "note"}
    f, res = fields("PP 1톤 매달 받고 싶어요", llm_says(note="매달 받고 싶어요"))
    assert "note" not in f and res.data["dropped"] == ["note"]                        # 주기는 따로 칸이 있음
    f, res = fields("PP 1톤, 연락은 010-1234-5678", llm_says(note="010-1234-5678"))
    assert "note" not in f and any("개인정보" in c.text for c in res.claims)


def test_llm_number_with_man_unit_is_accepted():
    f, _ = fields("철 스크랩 사려고요 가격은 30만 정도", llm_says(price_min=300000, price_max=300000))
    assert "price_min_krw_per_kg" not in f        # 원/kg 상한(10만 원)을 넘는 값은 버림
    f, _ = fields("PE 필름 사려고요 300에서 350 사이", llm_says(price_min=300, price_max=350))
    assert (f["price_min_krw_per_kg"], f["price_max_krw_per_kg"]) == (300.0, 350.0)


# ---- 희망가 추천 ----
def test_price_agent_fills_range_only_when_price_unspoken():
    res = want_price.run({"material": "PP", "listings": [{"price_krw_per_kg": 320}, {"price_krw_per_kg": 290}]})
    assert res.data["auto"] == {"min": res.data["market"]["low"], "max": res.data["market"]["high"]}
    assert res.data["listings"] == {"count": 2, "cheapest": 290.0}
    spoken = {"want_intake": {"data": {"fields": {"material": "PP", "price_min_krw_per_kg": 100.0, "price_max_krw_per_kg": 120.0}}}}
    res = want_price.run({"results": spoken})
    assert res.data["auto"] is None and any("시세 범위의 아래" in c.text for c in res.claims)
    res = want_price.run({"material": "구리"})
    assert res.data["auto"] is None and any("공개 시세 없음" in c.text for c in res.claims)


def test_flow_claims_pass_gates():
    out = run_flow("want_intake", {"transcript": "PP 5톤 매달 필요해요", "today": TODAY.isoformat(), "skip_llm_summary": True}, llm=None)
    assert [r.agent_id for r in out.results] == ["want_intake", "want_price", "want_match"]
    assert not [c for r in out.results for c in r.claims if c.blocked]


# ---- 경로 ----
@pytest.fixture
def real_flow(monkeypatch):
    monkeypatch.setattr(flows, "load_run_flow", lambda: lambda flow, ctx: run_flow(flow, ctx, llm=None))


def test_want_intake_text_endpoint(client, real_flow):
    w = world(client)
    listed(client, w, kg=100, price=330)                                   # 판매 중 PP 매물 1건
    r = client.post("/v1/buy-requests/intake", headers=H(w["r"]), json={"text": "PP 2톤 매달 필요해요"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["fields"] == {"material": "PP", "waste_code": "51-03-01", "qty_kg": 2000.0, "repeat": "monthly"}
    assert [s["id"] for s in d["steps"]] == ["want_intake", "want_price", "want_match"] and d["steps"][1]["name"] == "희망가 추천"
    assert d["match"]["count"] == 1 and d["match"]["matches"][0]["listing"]["price_krw_per_kg"] == 330
    assert d["price"]["auto"] and d["price"]["listings"] == {"count": 1, "cheapest": 330.0}
    assert client.get("/v1/me/buy-requests", headers=H(w["r"])).json() == []   # 구매 희망은 올리지 않음
    assert client.post("/v1/buy-requests/intake", headers=H(w["f"]), json={"text": "PP"}).status_code == 403


def test_want_intake_audio_and_price_suggest(client, real_flow, monkeypatch):
    w = world(client)
    body = {"audio_base64": "AAAA", "content_type": "audio/webm"}
    monkeypatch.setattr(stt, "available", lambda: False)
    assert client.post("/v1/buy-requests/intake", headers=H(w["r"]), json=body).status_code == 503
    assert client.get("/v1/buy-requests/intake/status", headers=H(w["r"])).json() == {"stt": False}
    monkeypatch.setattr(stt, "available", lambda: True)
    monkeypatch.setattr(stt, "transcribe", lambda raw: {"text": "고철 10톤", "seconds": 2.0, "model": "whisper-small", "ms": 5})
    d = client.post("/v1/buy-requests/intake", headers=H(w["r"]), json=body).json()
    assert d["transcript"] == "고철 10톤" and [s["id"] for s in d["steps"]] == ["stt", "want_intake", "want_price", "want_match"]
    s = client.get("/v1/buy-requests/price-suggest", headers=H(w["r"]), params={"material": "철"}).json()
    assert s["auto"]["min"] <= s["auto"]["max"] and s["steps"][0]["lines"]
    assert client.get("/v1/buy-requests/price-suggest", headers=H(w["f"]), params={"material": "철"}).status_code == 403


# ---- 판매 매물 맞추기 ----
def L(id, kg, price, km, mat="pp", name="공장"):
    return {"id": id, "factory_id": id, "factory_name": name, "region": "구미", "target_material": mat,
            "total_kg": kg, "price_krw_per_kg": price, "distance_km": km}


def test_match_orders_by_price_then_qty_then_distance():
    ls = [L(1, 5000, 400, 1), L(2, 300, 320, 2), L(3, 6000, 340, 9, name="가상사출B"), L(4, 8000, 330, 5), L(5, 9000, 100, 1, mat="pe")]
    res = want_match.run({"want": {"material": "PP", "qty_kg": 5000, "price_max_krw_per_kg": 350}, "listings": ls})
    d = res.data
    assert [m["id"] for m in d["matches"]] == [4, 3, 2, 1] and d["count"] == 4 and d["fit_all"] == 2    # PE는 빠짐
    assert d["matches"][0]["reasons"] == ["희망 상한가 안", "희망 수량 충분", "5 km"]
    assert d["matches"][2]["reasons"][1] == "희망 수량의 6%" and d["matches"][3]["reasons"][0] == "상한가보다 50원/kg 높음"
    assert [c.text for c in res.claims][0] == "판매 중 PP 매물 4건, 가격과 수량이 모두 맞는 매물 2건"
    none = want_match.run({"want": {"material": "구리"}, "listings": ls})
    assert none.data["count"] == 0 and none.claims[0].text == "지금 판매 중인 구리 매물 없음"
    assert want_match.run({"listings": ls}).claims == []                                       # 재질을 모르면 맞추지 않음
    spoken = {"want_intake": {"data": {"fields": {"material": "PP"}}}}
    assert want_match.run({"results": spoken, "listings": ls}).data["count"] == 4                # 말한 재질로도 맞춤


def test_match_endpoint_and_seller_notified_on_new_want(client, real_flow):
    w = world(client)
    listed(client, w, kg=100, price=330)
    m = client.get("/v1/buy-requests/match", headers=H(w["r"]), params={"material": "PP", "qty_kg": 50, "price_max": 350}).json()
    assert m["count"] == 1 and m["fit_all"] == 1 and m["matches"][0]["listing"]["factory_name"]
    assert m["matches"][0]["reasons"][:2] == ["희망 상한가 안", "희망 수량 충분"] and m["steps"][0]["name"] == "판매 매물 맞추기"
    assert client.get("/v1/buy-requests/match", headers=H(w["f"]), params={"material": "PP"}).status_code == 403
    before = client.get("/v1/notifications", headers=H(w["f"])).json()["unread"]
    body = {"material": "PP", "item": "사출 스크랩", "qty_kg": 2000, "price_min_krw_per_kg": 300, "price_max_krw_per_kg": 350}
    assert client.post("/v1/buy-requests", headers=H(w["r"]), json=body).status_code == 201
    got = client.get("/v1/notifications", headers=H(w["f"])).json()
    assert got["unread"] == before + 1 and got["items"][0]["title"] == "구매 희망 맞음" and "PP 2t 구매 희망" in got["items"][0]["body"]
    body = {**body, "material": "구리"}                                                        # 같은 재질 매물 없으면 알림 없음
    client.post("/v1/buy-requests", headers=H(w["r"]), json=body)
    assert client.get("/v1/notifications", headers=H(w["f"])).json()["unread"] == before + 1
