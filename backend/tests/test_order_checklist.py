"""계약 21.2: GET /v1/orders/{id}/checklist. LLM 없이 규칙 문장만, 당사자만(그 밖은 404)."""
from app.features.orders import router as orders_router
from app.db.models import Company
from tests.conftest import CODE, H, mk_company
from tests.test_trade_v03 import db
from tests.test_trade_v02 import ordered, world

ITEMS = ["recycler_permit", "seller_transport", "handover_entry"]


def get(client, oid, who):
    return client.get(f"/v1/orders/{oid}/checklist", headers=H(who))


def test_buyer_seller_and_operator_see_same_checklist_without_llm(client, monkeypatch):
    real, seen = orders_router.run_flow, []
    monkeypatch.setattr(orders_router, "run_flow", lambda flow, ctx, llm="auto": (seen.append((flow, llm)), real(flow, ctx, llm=llm))[1])
    w = world(client)
    _, _, oid = ordered(client, w)
    seen.clear()
    bodies = [get(client, oid, w[k]) for k in ("r", "f", "op")]
    assert [b.status_code for b in bodies] == [200, 200, 200]
    assert seen == [("deal_check", None)] * 3          # LLM 호출 0회(llm=None)
    first = bodies[0].json()
    assert bodies[1].json() == first == bodies[2].json() == get(client, oid, w["r"]).json()   # 언제 봐도 같음
    assert [i["item"] for i in first["items"]] == ITEMS
    assert first["legal_note"] == "법률 자문 확인 필요"
    assert all(i["text"] and i["laws"] for i in first["items"])
    assert first["items"][0]["laws"][0] == {"ref": "wma-25", "label": "폐기물처리업 허가"}
    transport = first["items"][1]                       # 운송은 판매자가 맡음
    assert transport["text"] == "판매자가 직접 운송, 인계서 운반자 칸도 판매자가 입력" and transport["ok"] is None
    assert transport["detail"] == "운송은 판매자가 맡으므로 인계서의 운반자 칸도 판매자가 전자인계서에 입력해야 함 (법 제18조 제3항)"
    assert [l["ref"] for l in transport["laws"]] == ["wma-18-3"]


def test_other_company_gets_404(client):
    w = world(client)
    _, _, oid = ordered(client, w)                     # 판매 공장 f가 운송까지 맡음
    w["r2"] = mk_company(client, "남의재활용", "recycler", permit_no="P2", permit_codes=[CODE])
    for who in ("f2", "r2"):
        assert get(client, oid, w[who]).status_code == 404, who
    assert get(client, 99999, w["r"]).status_code == 404
    assert client.get(f"/v1/orders/{oid}/checklist").status_code == 401


def test_permit_code_decides_ok(client):
    w = world(client)
    _, _, oid = ordered(client, w)
    assert get(client, oid, w["r"]).json()["items"][0]["ok"] is True
    session = db()                      # 주문 뒤 허가 코드가 바뀐 경우(주문 때는 막힘)
    session.get(Company, w["r"]).permit_codes = ["51-99-00"]
    session.commit()
    items = get(client, oid, w["r"]).json()["items"]
    assert items[0]["ok"] is False and CODE in items[0]["detail"] and "없음" in items[0]["text"]
    assert [i["ok"] for i in items[1:]] == [None, None]
    session.get(Company, w["r"]).permit_codes = None
    session.commit()
    assert get(client, oid, w["r"]).json()["items"][0]["ok"] is None     # 모르면 '없음'이 아니라 사람 확인 필요
