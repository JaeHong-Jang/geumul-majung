"""그물마중 반출 API. 앞쪽 다섯은 팀 시제품 model.test.cjs와 같은 시나리오를 서버 규칙으로 돌린다."""
import copy

import pytest

from app.features.gm import rules
from tests.conftest import H, mk_company


def lot(i=0):
    return copy.deepcopy(rules.seed()[i])


def test_5톤_반출의_인수량별_정산이_실증안과_같다():
    r = lot()
    q = r["quotes"][1]
    for accepted, cost, savings, fee, margin in [(2, 1540000, -40000, 80000, -30000), (3, 1460000, 40000, 120000, 10000),
                                                 (4, 1380000, 120000, 160000, 50000)]:
        assert rules.calculate(r, q, 5, accepted) == {"baseline": 1500000, "cost": cost, "savings": savings, "fee": fee,
                                                      "margin": margin, "residual": 5 - accepted, "ratio": accepted * 20}
    assert rules.calculate(r, q, 5, 2.75)["margin"] == 0
    assert rules.calculate(r, q, 5, 4, 0)["cost"] == 1180000
    assert rules.calculate(r, q, 5, 0)["fee"] == 0
    assert rules.calculate(r, q, 5, 5)["residual"] == 0


def test_가격과_중량을_검증하고_실계량이_달라도_정산한다():
    r = lot()
    q = r["quotes"][1]
    for total, accepted in [(0, 0), (-1, 0), (5, -1), (5, 5.01), (5, float("nan")), (float("inf"), 1), (5, "4")]:
        with pytest.raises(rules.RuleError):
            rules.calculate(r, q, total, accepted)
    with pytest.raises(rules.RuleError, match="추가비"):
        rules.calculate(r, q, 5, 2, -1)
    with pytest.raises(rules.RuleError, match="원 단위"):
        rules.calculate(r, {**q, "rate": 1.1}, 5, 2)
    assert rules.calculate(r, q, 3.1, 2.8)["residual"] == 0.3
    assert rules.calculate(r, q, 6, 6)["baseline"] == 1800000


def test_유효한_조건만_확정한다():
    r = lot(1)
    r["quotes"][0]["validUntil"] = "2026-11-26"
    rules.verify(r)
    with pytest.raises(rules.RuleError, match="견적 유효일"):
        rules.verify({**r, "status": "confirmed", "choice": 0})
    rules.verify({**r, "status": "confirmed", "choice": 1})
    with pytest.raises(rules.RuleError, match="등록 단계"):
        rules.verify({**r, "choice": 1})
    with pytest.raises(rules.RuleError, match="선택"):
        rules.verify({**r, "status": "confirmed", "choice": 3})
    with pytest.raises(rules.RuleError, match="날짜"):
        rules.verify({**r, "departure": "2026-02-31T09:30"})


def test_검수증빙이_있어야_정산을_완료한다():
    r = lot()
    r["status"] = "settled"
    with pytest.raises(rules.RuleError, match="실제 계량"):
        rules.verify(r)
    r["actual"] = {"total": 5, "accepted": 4, "reference": "", "reason": ""}
    with pytest.raises(rules.RuleError, match="증빙"):
        rules.verify(r)
    r["actual"]["reference"] = "예시-검수-001"
    with pytest.raises(rules.RuleError, match="잔재물"):
        rules.verify(r)
    r["actual"]["reason"] = "로프 혼입"
    rules.verify(r)
    r["actual"] |= {"accepted": 5, "reason": ""}
    rules.verify(r)
    with pytest.raises(rules.RuleError, match="검수 완료"):
        rules.verify({**r, "status": "registered", "choice": None})
    with pytest.raises(rules.RuleError, match="출항 전"):
        rules.verify({**r, "departure": "2026-11-28T08:30",
                      "quotes": [{**q, "validUntil": "2026-11-28"} for q in r["quotes"]]})


def test_시연_데이터와_반출번호():
    lots = rules.seed()
    assert len({r["id"] for r in lots}) == len(lots) == 6
    assert sum(r["status"] == "settled" for r in lots) == 2
    assert rules.allocate_id([r["id"] for r in lots]) == "SS-2611-007"
    assert rules.allocate_id([r["id"] for r in lots], "2026-12-01") == "SS-2612-001"
    assert rules.notice_by("2026-11-27T08:30") == "2026-11-26T08:30"
    with pytest.raises(rules.RuleError, match="사전 점검"):
        rules.verify({**lots[0], "checks": ["임의"]})


# ── API ──

@pytest.fixture
def ids(client):
    return {"site": mk_company(client, "삽시도 집하장", "factory"), "op": mk_company(client, "그물마중 운영", "operator"),
            "rec": mk_company(client, "지정 재활용업체", "recycler")}


def test_대시보드_숫자가_시제품_화면과_같다(client, ids):
    s = client.get("/v1/gm/summary", headers=H(ids["op"])).json()
    assert (s["count"], s["plannedWeight"], s["settledAccepted"], s["acceptRatio"]) == (6, 15.1, 6.8, 84.0)
    assert s["customerSavings"] == 254000          # 화면 '누적 고객 절감 +25.4만 원'
    assert s["departingToday"] == 1


def test_등록부터_정산까지_역할별로_간다(client, ids):
    site, op, rec = H(ids["site"]), H(ids["op"]), H(ids["rec"])
    body = {"kind": "폐자망", "material": "나일론", "weight": 5, "bags": 12, "departure": "2026-11-27T15:00",
            "checks": ["부착 로프 분리"], "note": "시연"}
    r = client.post("/v1/gm/shipments", json=body, headers=site)
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["id"] == "SS-2611-007" and s["status"] == "registered" and len(s["quotes"]) == 2 and s["totals"] is None
    sid = f"/v1/gm/shipments/{s['id']}"

    assert client.post(f"{sid}/confirm", json={"choice": 1}, headers=site).status_code == 403     # 집하장은 확정 못 함
    assert client.post(f"{sid}/settle", json={}, headers=rec).status_code == 409                    # 확정 전 정산 불가
    c = client.post(f"{sid}/confirm", json={"choice": 1, "version": s["version"]}, headers=op)
    assert c.status_code == 200 and c.json()["totals"]["savings"] == 120000
    assert client.put(f"{sid}/quotes", json={"quotes": s["quotes"]}, headers=op).status_code == 409   # 확정 뒤 조건 수정 불가

    p = client.post(f"{sid}/preview", json={"total": 5, "accepted": 2}, headers=rec).json()
    assert (p["savings"], p["margin"]) == (-40000, -30000)
    bad = client.post(f"{sid}/settle", json={"total": 5, "accepted": 6, "reference": "x"}, headers=rec)
    assert bad.status_code == 400 and "초과" in bad.json()["detail"]
    assert client.post(f"{sid}/settle", json={"total": 5, "accepted": 4, "reference": "W-1"}, headers=rec).json()["detail"] \
        == "잔재물 사유 입력 필요"
    done = client.post(f"{sid}/settle", json={"total": 5, "accepted": 4, "reference": "W-1", "reason": "로프 혼입"},
                       headers=rec).json()
    assert done["status"] == "settled" and done["totals"]["margin"] == 50000
    assert [h["action"] for h in done["history"]] == ["등록", "조건 확정", "검수 정산"]
    assert [h["role"] for h in done["history"]] == ["집하장", "운영", "처리업체"]


def test_출항_전_정산과_낡은_화면의_수정을_막는다(client, ids):
    op, rec = H(ids["op"]), H(ids["rec"])
    later = client.get("/v1/gm/shipments/SS-2611-004", headers=op).json()     # 12월 1일 출항
    r = client.post("/v1/gm/shipments/SS-2611-004/settle", json={"total": 4.5, "accepted": 4, "reference": "x", "reason": "y"},
                    headers=rec)
    assert r.status_code == 400 and "출항 전" in r.json()["detail"]
    s = client.get("/v1/gm/shipments/SS-2611-005", headers=op).json()
    q = copy.deepcopy(s["quotes"])
    q[0]["rate"] = 200000
    assert client.put("/v1/gm/shipments/SS-2611-005/quotes", json={"quotes": q, "version": s["version"]}, headers=op).status_code == 200
    stale = client.put("/v1/gm/shipments/SS-2611-005/quotes", json={"quotes": q, "version": s["version"]}, headers=op)
    assert stale.status_code == 409
    assert later["noticeBy"] == "2026-11-30T08:30"


def test_시연_초기화(client, ids):
    op = H(ids["op"])
    client.post("/v1/gm/shipments", json={"kind": "폐자망", "material": "나일론", "weight": 1, "bags": 2,
                                          "departure": "2026-11-28T09:00"}, headers=H(ids["site"]))
    assert len(client.get("/v1/gm/shipments", headers=op).json()) == 7
    assert client.post("/v1/gm/demo/reset", headers=H(ids["rec"])).status_code == 403
    assert client.post("/v1/gm/demo/reset", headers=op).json()["count"] == 6


def test_담는_방식과_운반_정보(client, ids):
    site, op = H(ids["site"]), H(ids["op"])
    base = {"kind": "폐어망", "material": "나일론", "weight": 2, "departure": "2026-11-28T09:00"}
    assert client.post("/v1/gm/shipments", json={**base, "packaging": "더미", "bags": 0}, headers=site).status_code == 201
    bad = client.post("/v1/gm/shipments", json={**base, "packaging": "톤백", "bags": 0}, headers=site)
    assert bad.status_code == 400 and "톤백이면 1 이상" in bad.json()["detail"]
    s = client.get("/v1/gm/shipments/SS-2611-006", headers=op).json()
    assert s["packaging"] == "마대" and s["route"]["mode"] == "시 용역 바지선" and s["route"]["landingPort"] == "대천항"
    assert client.get("/v1/gm/shipments/SS-2611-005", headers=op).json()["packaging"] == "더미"


def test_결항_연기(client, ids):
    op = H(ids["op"])
    r = client.post("/v1/gm/shipments/SS-2611-004/route", json={"status": "연기", "delayedTo": "2026-12-03"}, headers=op)
    assert r.status_code == 200, r.text
    s = r.json()                               # 확정 건, 견적 유효일(12-01)보다 늦어져 다시 협의로
    assert s["departure"] == "2026-12-03T08:30" and s["status"] == "registered" and s["choice"] is None
    assert s["route"]["delayedFrom"] == "2026-12-01T08:30" and "재협의" in s["history"][-1]["action"]
    ok = client.post("/v1/gm/shipments/SS-2611-006/route", json={"status": "결항", "reason": "기상 악화"}, headers=op).json()
    assert ok["route"]["status"] == "결항" and ok["status"] == "confirmed"
    assert client.post("/v1/gm/shipments/SS-2611-005/route", json={"status": "연기", "delayedTo": "2026-11-01"},
                       headers=op).status_code == 400
    assert client.post("/v1/gm/shipments/SS-2611-002/route", json={"status": "결항"}, headers=op).status_code == 409
    assert client.post("/v1/gm/shipments/SS-2611-006/route", json={"status": "결항"}, headers=H(ids["rec"])).status_code == 403
