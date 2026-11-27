"""그물마중 AI 기능: 말로 반출 등록, 반출 법 점검, 법 질문, 계량증명서 읽기. 실제 하네스(run_flow)로 돌린다."""
import base64

import pytest

from app.agents.gm.scan import check
from app.features._shared import flows
from app.features.gm import ai
from app.harness.runner import run_flow
from app.llm.mock import MockProvider
from tests.conftest import H, mk_company

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n fake").decode()
CERT = {"transcript": "계량증명서 No. 2611-0042\n요청자: 보령 지정 재활용업체\n일자 2026-11-27\n품명 폐어망 차량 충남80사1234\n"
                      "총중량 12,340 kg\n공차중량 7,340 kg\n실중량 5,000 kg\n대천계량소",
        "cert_no": "2611-0042", "requester": "보령 지정 재활용업체", "date": "2026-11-27", "item": "폐어망",
        "vehicle_no": "충남80사1234", "issuer": "대천계량소", "gross_kg": 12340, "tare_kg": 7340, "net_kg": 5000, "handwritten": False}


@pytest.fixture
def real(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "off")
    monkeypatch.setattr(flows, "load_run_flow", lambda: run_flow)
    return client


@pytest.fixture
def ids(real):
    return {"site": mk_company(real, "삽시도 집하장", "factory"), "op": mk_company(real, "그물마중 운영", "operator"),
            "rec": mk_company(real, "지정 재활용업체", "recycler")}


def test_말로_반출_등록_칸을_채우고_빈칸은_묻는다(real, ids):
    r = real.post("/v1/gm/intake", json={"text": "자망 나일론 5톤 마대 12개 다음 주 월요일 오전 8시 반 출항, 로프는 다 뗐어"},
                  headers=H(ids["site"]))
    assert r.status_code == 200, r.text
    f = r.json()["fields"]
    assert (f["kind"], f["material"], f["weight"], f["bags"], f["departure"]) == ("폐자망", "나일론", 5.0, 12, "2026-11-30T08:30")
    assert f["checks"] == ["부착 로프 분리"]
    assert any(s["id"] == "gm_intake" for s in r.json()["steps"])
    part = real.post("/v1/gm/intake", json={"text": "통발 그물 내일"}, headers=H(ids["site"])).json()
    assert any("직접 입력 필요" in x["text"] for x in part["facts"])
    assert any("오전 9시" in x["text"] for x in part["facts"])
    assert real.post("/v1/gm/intake", json={"text": "그물"}, headers=H(ids["rec"])).status_code == 403


def test_반출_법_점검은_조문_근거가_붙는다(real, ids):
    r = real.get("/v1/gm/shipments/SS-2611-005/checklist", headers=H(ids["op"])).json()     # 폐통발 그물, 혼합 재질
    items = {i["item"]: i for i in r["items"]}
    assert {"waste_class", "carrier", "handover", "ledger", "deposit", "rope", "material", "notice"} <= set(items)
    assert items["carrier"]["law"] == ["wma-rule-66-6-11", "wma-46", "wma-25"]
    assert items["rope"]["ok"] is False and "아직 로프 분리 전" in items["rope"]["text"]
    assert items["notice"]["text"].endswith("2026-11-29 09:00까지 해야 함")
    law_facts = [f for f in r["facts"] if f.get("headline")]
    assert law_facts and all(f["detail"] for f in law_facts)                 # 화면의 '조문 보기'용 원문 요약
    six = real.get("/v1/gm/shipments/SS-2611-006/checklist", headers=H(ids["op"])).json()
    assert {i["item"]: i for i in six["items"]}["rope"]["ok"] is True and "material" not in {i["item"] for i in six["items"]}


def test_법_질문은_조문에서만_답한다(real, ids):
    r = real.post("/v1/gm/ask", json={"message": "폐어망 실어 나르려면 허가 받아야 해?"}, headers=H(ids["site"])).json()
    assert r["facts"] and all(any(e["kind"] == "law" for e in f["evidence"]) for f in r["facts"])
    assert any("신고" in f["headline"] for f in r["facts"])
    assert real.post("/v1/gm/ask", json={"message": ""}, headers=H(ids["site"])).status_code == 400


def test_계량증명서_검산():
    kept, checks = check({k: CERT[k] for k in CERT if k not in ("transcript", "handwritten")}, CERT["transcript"])
    assert kept["net_kg"] == 5000 and all(c["ok"] for c in checks)
    bad, checks = check({**{k: CERT[k] for k in CERT if k != "transcript"}, "net_kg": 5100}, CERT["transcript"])
    assert bad["net_kg"] is None                                               # 글에 없는 숫자는 비움
    assert any(c["id"] == "net_kg_in_text" and not c["ok"] for c in checks)
    _, checks = check({**{k: CERT[k] for k in CERT if k != "transcript"}, "tare_kg": 7000},
                      CERT["transcript"].replace("7,340", "7,000"))
    assert any(c["id"] == "net_math" and not c["ok"] for c in checks)
    _, checks = check({"net_kg": 5000, "gross_kg": None}, CERT["transcript"])
    assert "요청자" in next(c for c in checks if c["id"] == "required_five")["text"]


def test_계량증명서_사진은_확인_전에는_정산에_안_들어간다(real, ids, monkeypatch):
    rec, op = H(ids["rec"]), H(ids["op"])
    monkeypatch.setattr(ai, "get_vision_provider", lambda: None)
    assert real.post("/v1/gm/shipments/SS-2611-006/scans", json={"image": PNG}, headers=rec).status_code == 503
    monkeypatch.setattr(ai, "get_vision_provider", lambda: MockProvider(lambda s, u, schema: dict(CERT)))
    assert real.post("/v1/gm/shipments/SS-2611-006/scans", json={"image": "x"}, headers=rec).status_code == 400
    assert real.post("/v1/gm/shipments/SS-2611-006/scans", json={"image": PNG}, headers=H(ids["site"])).status_code == 403
    s = real.post("/v1/gm/shipments/SS-2611-006/scans", json={"image": PNG}, headers=rec)
    assert s.status_code == 201, s.text
    scan = s.json()
    assert scan["status"] == "draft" and scan["suggest"] == {"total": 5.0, "reference": "2611-0042"}
    assert real.get("/v1/gm/shipments/SS-2611-006", headers=op).json()["status"] == "confirmed"   # 정산 안 됨
    done = real.post(f"/v1/gm/scans/{scan['id']}/confirm", json={"fields": {"net_kg": 4980}}, headers=rec).json()
    assert done["status"] == "confirmed" and done["suggest"]["total"] == 4.98
    assert real.post(f"/v1/gm/scans/{scan['id']}/confirm", json={}, headers=rec).status_code == 409
    assert len(real.get("/v1/gm/shipments/SS-2611-006/scans", headers=op).json()) == 1


def test_AI_상태(real, ids, monkeypatch):
    monkeypatch.setattr(ai, "get_vision_provider", lambda: None)
    s = real.get("/v1/gm/ai/status", headers=H(ids["op"])).json()
    assert s["vision"] is False and "stt" in s


@pytest.mark.parametrize("q, law", [("삽시도 폐어망 소각해도 돼?", "wma-8"), ("폐어망 태워도 돼?", "wma-8"),
                                     ("폐어망 실어 나르려면 허가 받아야 해?", "wma-rule-66-6-11"),
                                     ("바다에 버리면 어떻게 돼?", "mwa-7"), ("통발 보증금 어떻게 돌려받아?", "fa-81")])
def test_폐어구_시연_질문이_맞는_조문을_찾는다(q, law):
    """여러 조문에 붙은 흔한 낱말(폐어망)보다 질문의 핵심 낱말(소각, 태워)이 순위를 정한다."""
    from app.agents.assistant import law_matches
    assert law in [a["id"] for a in law_matches(q)]
