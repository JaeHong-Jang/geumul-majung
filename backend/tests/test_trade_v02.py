"""계약 v0.2 거래 쪽 회귀 테스트(ARCHITECTURE §8.1~8.8, docs/qa '상' 재현)."""
from concurrent.futures import ThreadPoolExecutor

import pytest

from tests.conftest import CODE, H, OP_TOKEN, PG_URL, mk_company
from tests.test_trade_scenario import make_bag, setup_world

JSON = {"Content-Type": "application/json"}


def world(client):
    w = setup_world(client)
    assert client.post(f"/v1/admin/companies/{w['r']}/verify", headers=H(w["op"]), json={}).status_code == 200
    return w


def listed(client, w, kg=100, price=10, f=None):
    """마대 1개(kg) 등록·등급·판매 → (bag_id, listing_id)"""
    f = f or w["f"]
    b = make_bag(client, f, kg * 0.97, kg * 0.03)
    assert client.post(f"/v1/bags/{b}/grade", headers=H(f), json={}).status_code == 200
    r = client.post("/v1/listings", headers=H(f), json={"bag_ids": [b], "mode": "now", "price_krw_per_kg": price})
    assert r.status_code == 201, r.text
    return b, r.json()["id"]


def ordered(client, w, kg=100, price=10):
    """주문. 운송은 판매자라 주문하면 바로 판매 공장에 배정(dispatched)."""
    b, lid = listed(client, w, kg, price)
    o = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid})
    assert o.status_code == 201, o.text
    return b, lid, o.json()["id"]


def pickup(client, w, oid, b, kg):
    return client.post(f"/v1/orders/{oid}/pickup", headers=H(w["h1"]), json={"bag_weights": [{"bag_id": b, "kg": kg}]})


def shipped(client, w, kg=100, pickup_kg=None, **kw):
    b, lid, oid = ordered(client, w, kg=kg, **kw)
    assert pickup(client, w, oid, b, pickup_kg or kg).status_code == 200
    return b, lid, oid


def inspect(client, w, oid, b, kg, passed=True):
    return client.post(f"/v1/orders/{oid}/inspect", headers=H(w["r"]),
                       json={"bag_weights": [{"bag_id": b, "kg": kg}], "passed": passed})


def run_parallel(fn, n=8):
    with ThreadPoolExecutor(n) as ex:
        return list(ex.map(lambda _: fn(), range(n)))


def codes(responses):
    return sorted(r.status_code for r in responses)


# ── §8.1 입력 범위 ──
def test_huge_ids_are_400_or_404_not_500(client):
    w = world(client)
    b, lid = listed(client, w)
    assert client.post("/v1/orders", headers={**H(w["r"]), **JSON}, content='{"listing_id": 1000000000000000000000000000000}').status_code == 404
    assert client.post("/v1/orders", headers={**H(w["r"]), **JSON}, content='{"listing_id": 1e30}').status_code in (400, 404)
    assert client.get("/v1/orders/99999999999999999999", headers=H(w["f"])).status_code == 404
    assert client.get("/v1/listings/99999999999999999999", headers=H(w["r"])).status_code == 404
    assert client.get("/v1/me/orders", headers={"X-Company-Id": "99999999999999999999"}).status_code == 401
    # 예전 앱이 보내는 운임 상한 값은 무시하고 운임 0원으로 주문(보류는 물건값 × 1.05뿐)
    o = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid, "freight_cap_krw": 3_000_000_000})
    assert o.status_code == 201 and o.json()["freight_cap_krw"] == 0 and o.json()["held_krw"] == 1050


def test_nan_inf_and_range_inputs_rejected_and_nothing_saved(client):
    base = '{"name": "x", "role": "factory", "biz_no": "1", "lat": %s, "lon": 128.4}'
    for lat in ("NaN", "Infinity", "91", "-90.5"):
        assert client.post("/v1/companies", headers=JSON, content=base % lat).status_code == 400
    w = world(client)
    assert client.get("/v1/me/orders", headers=H(w["h1"])).status_code == 200
    f = w["f"]
    def bag(**kw):
        body = {"waste_code": CODE, "target_material": "pp", "items": [{"material": "pp", "kg": 1}], **kw}
        return client.post("/v1/bags", headers=H(f), json=body).status_code
    assert bag(items=[{"material": "pp", "kg": 50001}]) == 400
    assert bag(items=[{"material": "pp", "kg": 30000}, {"material": "pe", "kg": 25000}]) == 400   # 합계 50t 초과
    assert bag(items=[{"material": "pp", "kg": 1}] * 21) == 400
    assert bag(items=[]) == 400
    assert bag(waste_code="99-99-99") == 400                       # waste_codes.json에 없음
    assert bag(note="x" * 501) == 400
    assert bag(note="a\x00b") == 400
    assert bag(target_material="   ") == 400
    assert client.post("/v1/companies", json={"name": "a\x00b", "role": "factory", "biz_no": "1", "lat": 1, "lon": 1}).status_code == 400
    assert client.post("/v1/companies", json={"name": "n", "role": "recycler", "biz_no": "1", "lat": 1, "lon": 1,
                                              "permit_codes": ["99-99-99"]}).status_code == 400
    assert client.post("/v1/companies", json={"name": "n" * 101, "role": "factory", "biz_no": "1", "lat": 1, "lon": 1}).status_code == 400
    b, lid = listed(client, w)
    lst = lambda **kw: client.post("/v1/listings", headers=H(f), json={"bag_ids": [b], "mode": "now", "price_krw_per_kg": 1, **kw})
    assert lst(price_krw_per_kg=100_001).status_code == 400
    assert lst(price_krw_per_kg=1e15).status_code == 400
    assert lst(bag_ids=[b, b]).status_code == 400
    assert lst(bag_ids=list(range(1, 52))).status_code == 400
    assert lst(bag_ids=[2**40]).status_code == 404
    assert len(client.get("/v1/listings").json()) == 1             # 위 실패들은 아무것도 안 만듦


def test_weight_inputs_range(client):
    w = world(client)
    b, lid, oid = ordered(client, w)
    for kg in (0, -1, 50001):
        assert pickup(client, w, oid, b, kg).status_code == 400
    r = client.post(f"/v1/orders/{oid}/pickup", headers={**H(w["h1"]), **JSON}, content='{"bag_weights": [{"bag_id": %d, "kg": 1e400}]}' % b)
    assert r.status_code == 400


# ── §8.2 운영자 ──
def test_operator_cannot_self_register_and_verify_needs_permit_codes(client, monkeypatch):
    body = {"name": "운영", "role": "operator", "biz_no": "1", "lat": 1, "lon": 1}
    assert client.post("/v1/companies", json=body).status_code == 403
    assert client.post("/v1/companies", json=body, headers={"X-Operator-Token": "wrong"}).status_code == 403
    monkeypatch.setenv("OPERATOR_BOOTSTRAP_TOKEN", "")
    assert client.post("/v1/companies", json=body, headers={"X-Operator-Token": ""}).status_code == 403   # 토큰 미설정이면 항상 403
    monkeypatch.setenv("OPERATOR_BOOTSTRAP_TOKEN", OP_TOKEN)
    assert client.post("/v1/companies", json=body, headers={"X-Operator-Token": OP_TOKEN}).status_code == 201
    op = mk_company(client, "운영2", "operator")
    empty = mk_company(client, "허가없음", "recycler")
    assert client.post(f"/v1/admin/companies/{empty}/verify", headers=H(op), json={}).status_code == 409
    ok = mk_company(client, "허가있음", "recycler", permit_codes=[CODE])
    assert client.post(f"/v1/admin/companies/{ok}/verify", headers=H(op), json={}).status_code == 200


def test_seed_creates_verified_operator(client):
    from sqlalchemy.orm import sessionmaker
    from app.db.session import get_session
    from app.main import app
    from seed import gumi_demo
    Session = sessionmaker(bind=next(app.dependency_overrides[get_session]()).get_bind(), expire_on_commit=False)
    gumi_demo.SessionLocal, gumi_demo.engine = Session, Session.kw["bind"]
    ids = gumi_demo.seed()
    me = client.get("/v1/me", headers=H(ids["가상운영"])).json()
    assert me["role"] == "operator" and me["verified"] is True


# ── §8.4 무게·정산 ──
def test_big_weight_gap_goes_disputed(client):
    w = world(client)
    b, lid, oid = shipped(client, w, kg=100)
    r = inspect(client, w, oid, b, 40, passed=True).json()
    assert r["status"] == "disputed" and r["dispute_reason"] == "무게 차이 60.0%"
    o = client.get(f"/v1/orders/{oid}", headers=H(w["r"])).json()
    assert o["status"] == "disputed" and o["dispute_reason"] == "무게 차이 60.0%" and o["settlement"] is None


def test_pickup_weight_warning_recorded(client):
    w = world(client)
    b, lid, oid = ordered(client, w, kg=100)
    r = pickup(client, w, oid, b, 80).json()
    assert r["status"] == "picked_up" and r["weight_warning"] == "등록 무게와 20.0% 차이"
    hist = client.get(f"/v1/orders/{oid}", headers=H(w["h1"])).json()["history"]
    assert hist[-1]["note"] == "등록 무게와 20.0% 차이"
    b2, _, oid2 = ordered(client, w, kg=100)
    assert "weight_warning" not in pickup(client, w, oid2, b2, 95).json()      # 경계 5%는 경고 없음


def test_proportional_settlement_within_tolerance(client):
    w = world(client)
    b, lid, oid = shipped(client, w, kg=100, price=10)
    r = inspect(client, w, oid, b, 97).json()
    # 검사 97kg × 10원 = 970원, 운임은 판매자 부담, 보류 1050 → 환불 80
    assert r["status"] == "settled"
    assert r["settlement"] == {"factory_krw": 970, "platform_krw": 0, "refund_krw": 80}
    b2, _, oid2 = shipped(client, w, kg=100, price=10)
    assert inspect(client, w, oid2, b2, 105).json()["status"] == "settled"      # 정확히 5%는 허용
    b3, _, oid3 = shipped(client, w, kg=100, price=10)
    assert inspect(client, w, oid3, b3, 105.1).json()["status"] == "disputed"


def test_round_half_up_won(client):
    w = world(client)
    b, lid, oid = shipped(client, w, kg=100, price=0.5)
    s = inspect(client, w, oid, b, 97).json()["settlement"]
    assert s["factory_krw"] == 49       # 48.5 → 49 (사사오입)


# ── §8.5 출구 ──
def test_cancel_by_recycler_refunds_and_reposts(client):
    w = world(client)
    b, lid, oid = ordered(client, w)
    assert client.post(f"/v1/orders/{oid}/cancel", headers=H(w["h1"]), json={}).status_code == 403   # 판매 공장(운송 담당)은 취소 불가
    assert client.get("/v1/listings").json() == []
    r = client.post(f"/v1/orders/{oid}/cancel", headers=H(w["r"]), json={})   # 출고 준비(수거 전)에는 구매자 취소 가능
    assert r.status_code == 200 and r.json() == {"status": "cancelled", "refund_krw": 1050}
    assert [x["id"] for x in client.get("/v1/listings").json()] == [lid]
    assert client.post(f"/v1/orders/{oid}/cancel", headers=H(w["r"]), json={}).status_code == 409
    # 판매자 수거(운송 시작) 뒤에는 취소 불가
    b2, _, oid2 = ordered(client, w)
    assert pickup(client, w, oid2, b2, 100).status_code == 200
    assert client.post(f"/v1/orders/{oid2}/cancel", headers=H(w["r"]), json={}).status_code == 409


def test_withdraw_listing_frees_bags(client):
    w = world(client)
    b, lid = listed(client, w)
    assert client.post(f"/v1/listings/{lid}/withdraw", headers=H(w["f2"]), json={}).status_code == 403
    assert client.post(f"/v1/listings/{lid}/withdraw", headers=H(w["r"]), json={}).status_code == 403
    assert client.post(f"/v1/listings/{lid}/withdraw", headers=H(w["f"]), json={}).json() == {"id": lid, "status": "withdrawn"}
    assert client.get("/v1/listings").json() == []
    assert client.post(f"/v1/listings/{lid}/withdraw", headers=H(w["f"]), json={}).status_code == 409
    again = client.post("/v1/listings", headers=H(w["f"]), json={"bag_ids": [b], "mode": "bundle", "price_krw_per_kg": 5})
    assert again.status_code == 201
    assert client.post(f"/v1/listings/{again.json()['id']}/withdraw", headers=H(w["f"]), json={}).status_code == 200   # bundle_wait도 가능
    b2, lid2 = listed(client, w)
    client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid2})
    assert client.post(f"/v1/listings/{lid2}/withdraw", headers=H(w["f"]), json={}).status_code == 409   # sold


def disputed(client, w, price=10):
    b, lid, oid = shipped(client, w, kg=100, price=price)
    assert inspect(client, w, oid, b, 90, passed=False).json()["status"] == "disputed"
    return b, oid


def resolve(client, w, oid, who="op", **body):
    return client.post(f"/v1/admin/orders/{oid}/resolve", headers=H(w[who]), json={"note": "중재", **body})


def test_resolve_regrade(client):
    w = world(client)
    b, oid = disputed(client, w)
    assert resolve(client, w, oid, who="r", resolution="return").status_code == 403
    assert resolve(client, w, oid, resolution="regrade").status_code == 400                       # 단가 필수
    r = resolve(client, w, oid, resolution="regrade", new_price_krw_per_kg=7)
    # 검사 90kg × 7원 = 630, 보류 1050 → 환불 420
    assert r.json()["status"] == "settled"
    assert r.json()["settlement"]["factory_krw"] == 630 and r.json()["settlement"]["refund_krw"] == 420
    assert resolve(client, w, oid, resolution="return").status_code == 409                        # 이미 끝남


def test_resolve_treat_and_return(client):
    w = world(client)
    b, oid = disputed(client, w)
    assert resolve(client, w, oid, resolution="treat").status_code == 400                         # 처리비 필수
    t = resolve(client, w, oid, resolution="treat", treatment_fee_krw=300).json()
    assert t["status"] == "settled" and t["legal_note"] == "법률 자문 확인 필요"
    # 공장이 처리비 300원을 내고(-300), 물건값 전액 환불(보류 1050 전부)
    assert t["settlement"]["factory_krw"] == 0 and t["settlement"]["refund_krw"] == 1050
    assert t["settlement"]["factory_charge_krw"] == 300 and t["settlement"]["recycler_fee_krw"] == 300
    b2, oid2 = disputed(client, w)
    rt = resolve(client, w, oid2, resolution="return").json()
    assert rt["status"] == "returned" and rt["legal_note"] == "법률 자문 확인 필요"
    assert "hauler_krw" not in rt["settlement"] and rt["settlement"]["refund_krw"] == 1050 and rt["settlement"]["factory_krw"] == 0
    assert client.get(f"/v1/orders/{oid2}", headers=H(w["r"])).json()["status"] == "returned"
    # 분쟁이 아니면 409
    b3, lid3, oid3 = ordered(client, w)
    assert resolve(client, w, oid3, resolution="return").status_code == 409


# ── §8.6 동시 요청 ──
pg_only = pytest.mark.skipif(not PG_URL.startswith("postgresql"), reason="동시성은 PostgreSQL에서 확인")


def test_same_bag_listed_by_8_parallel_requests_only_once(client):
    w = world(client)
    b = make_bag(client, w["f"], 97, 3)
    client.post(f"/v1/bags/{b}/grade", headers=H(w["f"]), json={})
    call = lambda: client.post("/v1/listings", headers=H(w["f"]), json={"bag_ids": [b], "mode": "now", "price_krw_per_kg": 5})
    res = run_parallel(call) if PG_URL.startswith("postgresql") else [call() for _ in range(8)]
    assert codes(res) == [201] + [409] * 7
    assert len(client.get("/v1/listings").json()) == 1


@pytest.mark.parametrize("step", ["pickup", "inspect"])
def test_parallel_order_steps_succeed_once(client, step):
    w = world(client)
    if step == "pickup":
        b, lid, oid = ordered(client, w)
        call = lambda: pickup(client, w, oid, b, 100)
    else:
        b, lid, oid = shipped(client, w)
        call = lambda: inspect(client, w, oid, b, 100)
    res = run_parallel(call) if PG_URL.startswith("postgresql") else [call() for _ in range(8)]
    assert codes(res) == [200] + [409] * 7
    hist = [(h["from"], h["to"]) for h in client.get(f"/v1/orders/{oid}", headers=H(w["r"])).json()["history"]]
    assert len(hist) == len(set(hist))                                                      # 이력 중복 없음


def test_regrade_blocked_when_listed_and_handover_locks(client):
    w = world(client)
    b, lid = listed(client, w)
    assert client.post(f"/v1/bags/{b}/grade", headers=H(w["f"]), json={}).status_code == 409
    assert client.post(f"/v1/bags/{b}/grade", headers=H(w["f"]), json={"confirm_no_hazard": True}).status_code == 409
    client.post(f"/v1/listings/{lid}/withdraw", headers=H(w["f"]), json={})
    assert client.post(f"/v1/bags/{b}/grade", headers=H(w["f"]), json={"confirm_no_hazard": True}).status_code == 200  # 풀리면 가능


def test_handover_locked_after_number_and_duplicate_rating_409(client):
    w = world(client)
    b, lid, oid = shipped(client, w)
    inspect(client, w, oid, b, 100)
    client.post(f"/v1/orders/{oid}/handover/emitter", headers=H(w["f"]), json={})
    client.post(f"/v1/orders/{oid}/handover/carrier", headers=H(w["h1"]), json={"vehicle_no": "12가3456"})
    client.post(f"/v1/orders/{oid}/handover/processor", headers=H(w["r"]), json={"method": "R-1"})
    assert client.post(f"/v1/orders/{oid}/handover/number", headers=H(w["f"]), json={"allbaro_no": "AB-1"}).status_code == 200
    assert client.post(f"/v1/orders/{oid}/handover/number", headers=H(w["f"]), json={"allbaro_no": "FAKE"}).status_code == 409
    assert client.post(f"/v1/orders/{oid}/handover/carrier", headers=H(w["h1"]), json={"vehicle_no": "변조"}).status_code == 409
    assert client.post(f"/v1/orders/{oid}/handover/emitter", headers=H(w["f"]), json={}).status_code == 409
    assert client.get(f"/v1/orders/{oid}/handover", headers=H(w["f"])).json()["allbaro_no"] == "AB-1"
    rate = lambda: client.post("/v1/ratings", headers=H(w["f"]), json={"order_id": oid, "target": "recycler", "score": 5})
    res = run_parallel(rate, 4) if PG_URL.startswith("postgresql") else [rate() for _ in range(4)]
    assert codes(res) == [201, 409, 409, 409]


# ── §8.8 화면용 조회 ──
def test_me_and_lookup_endpoints(client):
    w = world(client)
    me = client.get("/v1/me", headers=H(w["r"])).json()
    assert me == {"id": w["r"], "name": "가상리사이클", "role": "recycler", "verified": True, "permit_codes": [CODE],
                  "lat": 36.1, "lon": 128.4}
    assert client.get("/v1/me").status_code == 401
    b, lid = listed(client, w, kg=100, price=10)
    bags = client.get("/v1/me/bags", headers=H(w["f"])).json()
    assert bags[0]["id"] == b and bags[0]["grade"] == "A" and bags[0]["listing_id"] == lid and bags[0]["pass_id"]
    assert bags[0]["qr"] == f"MDP-{bags[0]['pass_id']}-{b}" and bags[0]["waste_name"] and bags[0]["created_at"].endswith("+00:00")
    assert client.get("/v1/me/bags", headers=H(w["r"])).status_code == 403
    detail = client.get(f"/v1/bags/{b}", headers=H(w["f"])).json()
    assert detail["items"] and "reasons" in detail and detail["purity"] == 0.97
    assert client.get(f"/v1/bags/{b}", headers=H(w["f2"])).status_code == 403
    mine = client.get("/v1/me/listings", headers=H(w["f"])).json()
    assert mine[0]["id"] == lid and mine[0]["bag_ids"] == [b] and mine[0]["order_id"] is None
    assert client.get(f"/v1/listings/{lid}").status_code == 401     # 상세는 로그인한 누구나
    pub = client.get(f"/v1/listings/{lid}", headers=H(w["r"])).json()
    assert pub["factory_name"] == "가상사출A" and pub["bag_count"] == 1 and pub["target_material"] == "pp"
    assert pub["area"] == {"lat": 36.1, "lon": 128.4} and pub["composition"] == {"pp": 0.97, "pe": 0.03}
    assert pub["purity_avg"] == 0.97 and pub["price_krw_per_kg"] == 10
    row = client.get("/v1/listings").json()[0]
    assert row["waste_name"] and row["bag_count"] == 1 and row["factory_name"] == "가상사출A" and row["grade"] == "A"
    o = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid}).json()
    assert client.get("/v1/me/listings", headers=H(w["f"])).json()[0]["order_id"] == o["id"]
    orders = client.get("/v1/me/orders", headers=H(w["r"])).json()
    assert orders[0]["id"] == o["id"] and orders[0]["role_in_order"] == "recycler" and orders[0]["freight_cap_krw"] == 0
    assert orders[0]["updated_at"].endswith("+00:00")
    assert client.get("/v1/me/orders", headers=H(w["f"])).json()[0]["role_in_order"] == "factory"
    assert client.get("/v1/me/orders", headers=H(w["h2"])).json() == []
    od = client.get(f"/v1/orders/{o['id']}", headers=H(w["f"])).json()
    assert od["history"][0]["at"].endswith("+00:00") and od["created_at"].endswith("+00:00")


def test_counterparty_names_list_seller_once(client):
    # 구매자 목록의 상대 이름은 판매 공장 한 번만(판매자 운송이라 운반 담당도 같은 공장)
    w = world(client)
    _, _, oid = ordered(client, w)
    orders = client.get("/v1/me/orders", headers=H(w["r"])).json()
    assert orders[0]["id"] == oid and orders[0]["counterparty_names"] == ["가상사출A"]


def test_me_orders_newest_first(client):
    w = world(client)
    b1, _, o1 = ordered(client, w)
    _, _, o2 = ordered(client, w)
    assert [o["id"] for o in client.get("/v1/me/orders", headers=H(w["r"])).json()] == [o2, o1]
    assert pickup(client, w, o1, b1, 100).status_code == 200    # o1이 갱신 → 맨 위
    assert [o["id"] for o in client.get("/v1/me/orders", headers=H(w["r"])).json()] == [o1, o2]


def test_health_llm_field(client):
    assert set(client.get("/v1/health").json()["llm"]) == {"provider", "available"}
