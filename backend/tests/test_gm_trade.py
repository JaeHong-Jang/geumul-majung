"""그물마중 자원 순환 판매, 업체 회신, 서류 안내. 실제 하네스(run_flow)로 돌린다."""
import pytest

from app.agents.gm.grade import judge
from app.features._shared import flows
from app.features.gm import circulation as circ
from app.harness.runner import run_flow
from tests.conftest import H, mk_company

NYLON = {"kind": "폐자망", "material": "나일론", "weight": 1.2, "origin": "쓰다가 배출", "separated": True, "intact": True,
         "attachments": ["뜸줄"], "note": "시연"}


@pytest.fixture
def real(client, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "off")
    monkeypatch.setattr(flows, "load_run_flow", lambda: run_flow)
    return client


@pytest.fixture
def ids(real):
    return {"site": mk_company(real, "삽시도 집하장", "factory"), "op": mk_company(real, "그물마중 운영", "operator"),
            "rec": mk_company(real, "가상 재생나일론 업체", "recycler")}


def test_판매_돈_계산이_수익_구조_문서와_같다():
    """01_전략/그물마중 수익 구조.md 4절 표: 1톤, 기존 처리비 33.2만 원/톤, 준비비 25.5만 원, 수수료 매각 10% + 절감 15%."""
    rec = {"baseRate": 332000}
    for price, team, site in [(0, 49800, 27200), (200000, 69800, 207200), (500000, 99800, 477200)]:
        m = circ.lot_money(rec, {"weight": 1}, price)
        assert (m["teamFee"], m["siteGain"]) == (team, site)          # 문서의 5.0만·2.7만 / 7.0만·20.7만 / 10.0만·47.7만(반올림)
    seed = circ.lot_money({"baseRate": 300000}, {"weight": 1}, 200000)   # 시연 데이터 기준(기존 처리비 30만 원)
    assert seed == {"tons": 1, "revenue": 200000, "avoided": 300000, "prep": 255000, "saleFee": 20000, "savingFee": 45000,
                    "teamFee": 65000, "siteGain": 180000}
    assert circ.check_offer({"buyer": "x", "price": 0, "validUntil": "2026-12-01"})["price"] == 0   # 무상 인수 허용
    with pytest.raises(circ.RuleError):
        circ.check_offer({"buyer": "x", "price": -1, "validUntil": "2026-12-01"})


def test_판매_가능_판정():
    assert judge(circ.check_lot({**NYLON, "attachments": []}))["grade"] == "판매 후보"
    j = judge(circ.check_lot(NYLON))
    assert j["grade"] == "조건부" and any("50%에서 80%" in f for f in j["fixes"])
    sea = judge(circ.check_lot({**NYLON, "origin": "침적 수거"}))
    assert sea["grade"] == "처리 대상" and "열 회수" in sea["blockers"][0]
    mixed = judge(circ.check_lot({**NYLON, "separated": False}))
    assert mixed["grade"] == "처리 대상" and any("종류별로" in f for f in mixed["fixes"])


def test_떼어_놓은_묶음을_판정하고_팔기까지(real, ids):
    site, op, rec = H(ids["site"]), H(ids["op"]), H(ids["rec"])
    chk = real.post("/v1/gm/shipments/SS-2611-005/sales/check", json={"lot": NYLON}, headers=site).json()
    assert chk["grade"] == "조건부" and chk["buyers"][0]["km"] is not None
    kms = [b["km"] for b in chk["buyers"] if b["km"] is not None]
    assert kms == sorted(kms)
    assert any(f["text"].startswith("판정: 조건부") for f in chk["facts"])
    sea = real.post("/v1/gm/shipments/SS-2611-005/sales", json={"lot": {**NYLON, "origin": "조업 중 인양"}}, headers=site)
    assert sea.status_code == 409 and "열 회수" in sea.json()["detail"]
    s = real.post("/v1/gm/shipments/SS-2611-005/sales", json={"lot": NYLON}, headers=site).json()
    lot = s["sales"][-1]
    assert lot["id"] == "S1" and lot["status"] == "offering"
    assert real.post(f"/v1/gm/shipments/SS-2611-005/sales/S1/offers", json={"price": 150000, "validUntil": "2026-12-03"},
                     headers=site).status_code == 403
    o = real.post("/v1/gm/shipments/SS-2611-005/sales/S1/offers", json={"price": 210000, "validUntil": "2026-12-03"}, headers=rec).json()
    first = o["sales"][-1]["offers"][-1]
    assert first["buyer"] == "가상 재생나일론 업체" and first["money"]["revenue"] == 252000 and first["money"]["teamFee"] == 79200
    real.post("/v1/gm/shipments/SS-2611-005/sales/S1/offers", json={"buyer": "가상 PP 업체", "price": 180000, "validUntil": "2026-12-03"},
              headers=op)
    mk = real.get("/v1/gm/market", headers=rec).json()
    mine = next(m for m in mk if m["shipment"] == "SS-2611-005")
    assert mine["bestOffer"] == 210000 and len(mine["mine"]) == 1
    assert real.post("/v1/gm/shipments/SS-2611-005/sales/S1/accept", json={"offer": "O1"}, headers=rec).status_code == 403
    done = real.post("/v1/gm/shipments/SS-2611-005/sales/S1/accept", json={"offer": "O1"}, headers=op).json()
    lot = done["sales"][-1]
    assert lot["status"] == "sold" and [x["status"] for x in lot["offers"]] == ["accepted", "declined"]
    assert done["circulation"]["revenue"] == 252000 and done["circulation"]["lots"] == 1
    assert done["status"] == "registered"                       # 판매는 처리 흐름(조건 협의)과 따로 간다
    assert real.post("/v1/gm/shipments/SS-2611-005/sales/S1/accept", json={"offer": "O2"}, headers=op).status_code == 409


def test_대시보드_요약에_판매가_들어간다(real, ids):
    s = real.get("/v1/gm/summary", headers=H(ids["op"])).json()
    assert s["circulation"]["tons"] == 1 and s["circulation"]["revenue"] == 200000 and s["circulation"]["offering"] == 1
    assert s["customerSavings"] == 254000                        # 기존 처리 흐름 숫자는 그대로


def test_업체_회신(real, ids):
    rec, site = H(ids["rec"]), H(ids["site"])
    r = real.post("/v1/gm/shipments/SS-2611-005/quotes/1/reply", json={"expected": 2.7, "rate": 170000, "validUntil": "2026-12-02"},
                  headers=rec).json()
    q = r["quotes"][1]
    assert (q["expected"], q["rate"], q["repliedBy"]) == (2.7, 170000, "가상 재생나일론 업체")
    assert r["history"][-1]["action"].startswith("업체 회신")
    assert real.post("/v1/gm/shipments/SS-2611-005/quotes/1/reply", json={"rate": 1}, headers=site).status_code == 403
    bad = real.post("/v1/gm/shipments/SS-2611-005/quotes/1/reply", json={"expected": 9}, headers=rec)
    assert bad.status_code == 400 and "초과" in bad.json()["detail"]
    assert real.post("/v1/gm/shipments/SS-2611-006/quotes/1/reply", json={"rate": 1}, headers=rec).status_code == 409


def test_서류_안내와_초안(real, ids):
    op = H(ids["op"])
    two = real.get("/v1/gm/shipments/SS-2611-002/documents", headers=op).json()     # 정산 완료 + 판매 완료
    d = {x["key"]: x for x in two["docs"]}
    assert d["ledger"]["needed"] and d["ledger"]["fields"]["처리량(kg)"] == 4000 and d["ledger"]["fields"]["미처리량(kg)"] == 1000
    assert "작성자" in d["ledger"]["missing"]
    assert d["handover"]["needed"] is True                      # 폐자망은 자망이라 보증금 표식 어구가 섞이면 필요
    assert d["eticket"]["needed"] is False and d["eticket"]["status"] == "해당 없음"
    assert d["sale"]["fields"]["매각 대금(원)"] == 200000
    assert any(f.get("headline") for f in two["facts"])          # 법 근거가 붙은 항목은 조문 문구가 같이 온다
    page = real.get("/v1/gm/shipments/SS-2611-002/documents/ledger", headers=op)
    assert page.status_code == 200 and "초안" in page.text and "4,000" in page.text
    assert real.get("/v1/gm/shipments/SS-2611-002/documents/eticket", headers=op).status_code == 404
    five = {x["key"]: x for x in real.get("/v1/gm/shipments/SS-2611-005/documents", headers=op).json()["docs"]}
    assert five["weigh"]["needed"] is False and five["handover"]["needed"] is True   # 폐통발 그물 → 보증금 명세서
