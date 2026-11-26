"""앱 화면 전 기능(ARCHITECTURE §12.1~12.8) 회귀 테스트. 금액은 정수 원까지 검사한다."""
import base64
import json
import logging

import pytest

from app.core.config import ROOT
from app.db.models import Bag, Listing, Notification, Payment
from app.db.session import get_session
from app.main import app
from tests.conftest import PG_URL, H, mk_company

CODE, IRON = "51-03-01", "51-29-01"
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * 64).decode()


OPENED = []


def db():
    """검증용 세션. 열어 둔 트랜잭션이 다음 테스트의 drop_all(PostgreSQL)을 막지 않도록 테스트가 끝나면 닫는다."""
    s = next(app.dependency_overrides[get_session]())
    OPENED.append(s)
    return s


@pytest.fixture(autouse=True)
def _close_db_sessions(client):
    yield
    while OPENED:
        OPENED.pop().close()


def world(client, **far):
    op = mk_company(client, "운영", "operator")
    w = {"op": op,
         "f1": mk_company(client, "공장1", "factory", region="경북 구미", lat=36.10, lon=128.40),
         "f2": mk_company(client, "공장2", "factory", region="경북 구미", lat=36.11, lon=128.41),
         "far": mk_company(client, "먼공장", "factory", region="서울", lat=37.50, lon=127.00),
         "r": mk_company(client, "재활용", "recycler", permit_no="R", permit_codes=[CODE], lat=36.12, lon=128.36),
         "r2": mk_company(client, "재활용2", "recycler", permit_no="R2", permit_codes=[CODE])}
    for k in ("r", "r2"):
        assert client.post(f"/v1/admin/companies/{w[k]}/verify", json={}, headers=H(op)).status_code == 200
    return w


def sell(client, f, kg=100, price=300, material="pp", mode="now", impure=0, **extra):
    items = [{"material": material, "kg": kg}] + ([{"material": "pe", "kg": impure}] if impure else [])
    bag = client.post("/v1/bags", headers=H(f), json={"waste_code": CODE, "target_material": material, "items": items}).json()["id"]
    client.post(f"/v1/bags/{bag}/grade", headers=H(f), json={})
    r = client.post("/v1/listings", headers=H(f), json={"bag_ids": [bag], "mode": mode, "price_krw_per_kg": price, **extra})
    assert r.status_code == 201, r.text
    return bag, r.json()["id"]


def buy(client, r, lid, **kw):
    res = client.post("/v1/orders", headers=H(r), json={"listing_id": lid, **kw})
    assert res.status_code == 201, res.text
    return res.json()


def weights(bag, kg):
    return {"bag_weights": [{"bag_id": bag, "kg": kg}]}


def deliver(client, w, oid, bag, kg, *, inspector, passed=True, inspect_kg=None):
    """배정된 운반 회사(판매자 운송이면 판매 공장, 직접 수거면 구매 업체)가 출고하고 구매 업체가 도착 확인과 검사를 한 번에 한다."""
    driver = client.get(f"/v1/orders/{oid}", headers=H(inspector)).json()["hauler_id"]
    assert client.post(f"/v1/orders/{oid}/pickup", headers=H(driver), json=weights(bag, kg)).status_code == 200
    return client.post(f"/v1/orders/{oid}/inspect", headers=H(inspector),
                       json={**weights(bag, inspect_kg or kg), "passed": passed})


# ── 12.1 회사 정보 ──
def test_profile_read_patch_and_vehicle_fields_ignored(client):
    w = world(client)
    got = client.get("/v1/me/profile", headers=H(w["f1"])).json()
    assert set(got) == {"id", "name", "role", "verified", "biz_no", "permit_no", "permit_codes", "region", "address", "lat", "lon",
                        "phone", "industry", "address_detail", "emitter_report", "pickup_method", "terms", "coord_source", "byproducts"}   # 뒤 7칸은 §13.1·13.3·14.5
    patched = client.patch("/v1/me/profile", headers=H(w["f1"]), json={"vehicle_no": "12가 3456", "vehicle_type": "5톤", "capacity_ton": 5, "address": "가상로 1"})
    assert patched.status_code == 200 and not {"vehicle_no", "vehicle_type", "capacity_ton"} & set(patched.json())   # 차량 칸은 없어져 무시
    assert client.get("/v1/me/profile", headers=H(w["f1"])).json()["address"] == "가상로 1"
    assert client.patch("/v1/me/profile", headers=H(w["r"]), json={"address": "회사 주소", "region": "경북"}).status_code == 200
    assert set(client.get("/v1/me", headers=H(w["f1"])).json()) == {"id", "name", "role", "verified", "permit_codes", "lat", "lon"}
    assert client.get("/v1/me/profile").status_code == 401


# ── 12.2 구매자 편의 ──
def test_addresses_default_delete_and_isolation(client):
    w = world(client)
    r, r2 = H(w["r"]), H(w["r2"])
    a = client.post("/v1/me/addresses", headers=r, json={"label": "본사", "address": "가상로 1"}).json()
    b = client.post("/v1/me/addresses", headers=r, json={"label": "창고", "address": "가상로 2"}).json()
    assert a["is_default"] is True and b["is_default"] is False   # 첫 배송지만 자동 기본
    assert client.post(f"/v1/me/addresses/{b['id']}/default", headers=r).json()["is_default"] is True
    assert [(x["id"], x["is_default"]) for x in client.get("/v1/me/addresses", headers=r).json()] == [(a["id"], False), (b["id"], True)]
    assert client.get("/v1/me/addresses", headers=r2).json() == []
    assert client.delete(f"/v1/me/addresses/{a['id']}", headers=r2).status_code == 404   # 남의 것
    assert client.post(f"/v1/me/addresses/{a['id']}/default", headers=r2).status_code == 404
    assert client.delete(f"/v1/me/addresses/{b['id']}", headers=r).status_code == 200
    assert [x["is_default"] for x in client.get("/v1/me/addresses", headers=r).json()] == [True]   # 남은 것이 기본
    assert client.post("/v1/me/addresses", headers=H(w["f1"]), json={"label": "x", "address": "y"}).status_code == 403
    assert client.post("/v1/me/addresses", headers=r, json={"label": "", "address": "y"}).status_code == 400


def test_interests_and_recommended_listings(client):
    w = world(client)
    r = H(w["r"])
    assert client.get("/v1/me/interests", headers=r).json() == {"waste_codes": [], "min_grade": None}
    _, lid_a = sell(client, w["f1"])                       # A
    _, lid_b = sell(client, w["f2"], kg=92, impure=8)      # B
    assert client.get("/v1/buyer/home", headers=r).json()["recommended"] == []
    put = client.put("/v1/me/interests", headers=r, json={"waste_codes": [CODE], "min_grade": "A"})
    assert put.json() == {"waste_codes": [CODE], "min_grade": "A"}
    assert [l["id"] for l in client.get("/v1/buyer/home", headers=r).json()["recommended"]] == [lid_a]
    client.put("/v1/me/interests", headers=r, json={"waste_codes": [], "min_grade": "B"})
    assert {l["id"] for l in client.get("/v1/buyer/home", headers=r).json()["recommended"]} == {lid_a, lid_b}
    assert client.put("/v1/me/interests", headers=r, json={"waste_codes": ["없는코드"]}).status_code == 400
    assert client.put("/v1/me/interests", headers=H(w["f1"]), json={}).status_code == 403
    assert client.get("/v1/me/interests", headers=H(w["r2"])).json() == {"waste_codes": [], "min_grade": None}


def test_favorites(client):
    w = world(client)
    r = H(w["r"])
    _, lid = sell(client, w["f1"])
    assert client.put(f"/v1/favorites/{lid}", headers=r).json() == {"listing_id": lid, "favorite": True}
    assert client.put(f"/v1/favorites/{lid}", headers=r).status_code == 200   # 멱등
    assert [f["id"] for f in client.get("/v1/me/favorites", headers=r).json()] == [lid]
    assert client.get("/v1/me/favorites", headers=r)  .json()[0]["status"] == "posted"
    assert client.get("/v1/listings", headers=r).json()[0]["favorite"] is True
    assert client.get(f"/v1/listings/{lid}", headers=r).json()["favorite"] is True
    assert client.get("/v1/listings", headers=H(w["r2"])).json()[0]["favorite"] is False
    assert client.get("/v1/listings").json()[0]["favorite"] is False
    assert client.get("/v1/me/favorites", headers=H(w["r2"])).json() == []
    assert client.put("/v1/favorites/9999", headers=r).status_code == 404
    assert client.put(f"/v1/favorites/{lid}", headers=H(w["f2"])).status_code == 403
    assert client.delete(f"/v1/favorites/{lid}", headers=r).json()["favorite"] is False
    assert client.get("/v1/me/favorites", headers=r).json() == []
    _, hidden = sell(client, w["f2"], mode="bundle")
    client.post(f"/v1/listings/{hidden}/withdraw", headers=H(w["f2"]))
    assert client.put(f"/v1/favorites/{hidden}", headers=r).status_code == 404   # 보이지 않는 매물


def test_frequent_sellers_and_impact_after_settlement(client):
    w = world(client)
    r = H(w["r"])
    bag, lid = sell(client, w["f1"], kg=100)
    oid = buy(client, w["r"], lid)["id"]
    assert deliver(client, w, oid, bag, 100, inspector=w["r"]).json()["status"] == "settled"
    got = client.get("/v1/me/frequent-sellers", headers=r).json()
    assert got == [{"factory_id": w["f1"], "name": "공장1", "region": "경북 구미", "order_count": 1, "total_kg": 100.0, "avg_rating": None}]
    imp = client.get("/v1/me/impact", headers=r).json()
    assert imp["kg"] == 100.0 and imp["order_count"] == 1 and imp["role"] == "recycler" and imp["carbon_kg"] is None
    assert client.get("/v1/me/impact", headers=H(w["f1"])).json()["order_count"] == 1
    assert client.get("/v1/me/impact", headers=H(w["r2"])).json()["order_count"] == 0
    assert client.get("/v1/me/frequent-sellers", headers=H(w["r2"])).json() == []
    assert client.get("/v1/me/frequent-sellers", headers=H(w["f1"])).status_code == 403


# ── 12.3 매물 칸·검색·정렬 ──
def test_listing_fields_search_and_sort(client):
    w = world(client)
    r = H(w["r"])
    prices = {p["item"]: p["price"] for p in client.get("/v1/market/prices", headers=r).json()}
    _, near = sell(client, w["f1"], kg=100, price=300, available_from="2026-12-01", pickup_note="오전 방문")
    _, mid = sell(client, w["f2"], kg=50, price=200)
    _, far = sell(client, w["far"], kg=70, price=250, material="pe")
    item = {i["id"]: i for i in client.get("/v1/listings", headers=r).json()}[near]
    assert item["available_from"] == "2026-12-01" and item["pickup_note"] == "오전 방문"
    assert item["distance_km"] == 4.0
    pp = prices["PP 압축"]
    assert item["price_vs_market_pct"] == pytest.approx((300 - pp) / pp * 100, abs=0.1)
    assert item["factory_rating"] is None and item["issued_at"].endswith("+00:00")
    assert client.get("/v1/listings").json()[0]["distance_km"] is None   # 로그인 없으면 null
    one = client.get(f"/v1/listings/{near}", headers=r).json()
    assert one["distance_km"] == item["distance_km"] and one["bags"][0]["qr"] is None and one["bags"][0]["has_photo"] is False   # §17: QR·통과증 번호는 소유 공장과 배정 업체만
    assert one["bags"][0]["pass_id"] is None
    assert client.get(f"/v1/listings/{near}", headers=H(w["f1"])).json()["bags"][0]["qr"].startswith("MDP-")
    ids = lambda **p: [i["id"] for i in client.get("/v1/listings", params=p, headers=r).json()]   # noqa: E731
    assert ids(sort="price") == [mid, far, near]
    assert ids(sort="distance")[0] == near and ids(sort="distance")[-1] == far
    assert ids(sort="recent") == [far, mid, near]
    assert ids(q="공장2") == [mid] and ids(q="서울") == [far] and ids(q="PE") == [far]
    assert ids(q="없는말") == [] and ids(grade="A") == [near, mid, far] and ids(grade="C") == []
    assert client.get("/v1/listings", params={"sort": "bogus"}, headers=r).status_code == 400
    assert client.get("/v1/listings", params={"grade": "Z"}).status_code == 400


def test_factory_rating_appears_after_reviews(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    deliver(client, w, oid, bag, 100, inspector=w["r"])
    for who, path in ((w["f1"], "emitter"), (w["f1"], "carrier"), (w["r"], "processor")):   # 판매자 운송: 운반자 칸도 판매자
        body = {"vehicle_no": "1가1234"} if path == "carrier" else ({"method": "재생"} if path == "processor" else {})
        assert client.post(f"/v1/orders/{oid}/handover/{path}", headers=H(who), json=body).status_code == 200
    client.post(f"/v1/orders/{oid}/handover/number", headers=H(w["f1"]), json={"allbaro_no": "D-1"})
    assert client.post("/v1/ratings", headers=H(w["r"]), json={"order_id": oid, "target": "factory", "score": 4}).status_code == 201
    _, lid2 = sell(client, w["f1"])
    assert client.get(f"/v1/listings/{lid2}", headers=H(w["r"])).json()["factory_rating"] == 4.0


def test_price_history_is_real_data_oldest_first(client):
    w = world(client)
    got = client.get("/v1/market/prices/PP 압축/history", headers=H(w["r"])).json()
    raw = json.loads((ROOT / "data" / "prices.json").read_text(encoding="utf-8"))
    expect = sorted((r for r in raw if r["item"] == "PP 압축" and r["region"] == "전국" and r["price"]), key=lambda r: str(r["date"]))
    assert got == [{"date": str(r["date"]), "price": r["price"]} for r in expect] and len(got) >= 1
    assert [g["date"] for g in got] == sorted(g["date"] for g in got)
    assert client.get("/v1/market/prices/없는품목/history", headers=H(w["r"])).status_code == 404
    assert client.get("/v1/market/prices/PP 압축/history").status_code == 401


# ── 12.4 주문 선택: 직접 수거 ──
def test_self_pickup_money_and_roles(client):
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    res = buy(client, w["r"], lid, transport="self")
    oid = res["id"]
    assert (res["status"], res["held_krw"], res["goods_krw"], res["freight_cap_krw"]) == ("dispatched", 31500, 30000, 0)
    assert res["transport"] == "self" and "운반 허가" in res["legal_note"]
    got = client.get(f"/v1/orders/{oid}", headers=H(w["r"])).json()
    assert got["hauler_id"] == w["r"] and got["freight_krw"] == 0 and got["transport"] == "self"
    for other in ("r2", "f1"):                                                       # 끼어들 수 없음
        assert client.post(f"/v1/orders/{oid}/pickup", headers=H(w[other]), json=weights(bag, 100)).status_code == 403
    assert client.post(f"/v1/orders/{oid}/inspect", headers=H(w["r2"]), json={**weights(bag, 100), "passed": True}).status_code == 403
    assert client.post(f"/v1/orders/{oid}/inspect", headers=H(w["r"]), json={**weights(bag, 100), "passed": True}).status_code == 409   # 아직 수거 전
    out = deliver(client, w, oid, bag, 100, inspector=w["r"]).json()
    assert out["settlement"] == {"factory_krw": 30000, "platform_krw": 0, "refund_krw": 1500}   # §20: 직접 수거에는 기사 줄이 없다
    assert client.post(f"/v1/orders/{oid}/handover/carrier", headers=H(w["r"]), json={"vehicle_no": "1가1234"}).status_code == 200
    assert client.post("/v1/ratings", headers=H(w["f1"]), json={"order_id": oid, "target": "hauler", "score": 5}).status_code == 400   # §12.11: 상태와 상관없이 400


def test_self_pickup_rating_hauler_rejected_and_bad_transport(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    for bad in ("bogus", "matched"):   # 운송기사 배차(matched)는 없어짐
        assert client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid, "transport": bad}).status_code == 400
    oid = buy(client, w["r"], lid, transport="self")["id"]
    deliver(client, w, oid, bag, 100, inspector=w["r"])
    for who, path, body in ((w["f1"], "emitter", {}), (w["r"], "carrier", {"vehicle_no": "1가1"}), (w["r"], "processor", {"method": "재생"})):
        assert client.post(f"/v1/orders/{oid}/handover/{path}", headers=H(who), json=body).status_code == 200
    client.post(f"/v1/orders/{oid}/handover/number", headers=H(w["f1"]), json={"allbaro_no": "D-2"})
    r = client.post("/v1/ratings", headers=H(w["f1"]), json={"order_id": oid, "target": "hauler", "score": 5})
    assert r.status_code == 400
    assert client.post("/v1/ratings", headers=H(w["f1"]), json={"order_id": oid, "target": "recycler", "score": 5}).status_code == 201


# ── 12.4 세금계산서 ──
def invoice_trade(client, w, kg=100, inspect_kg=None, passed=True):
    bag, lid = sell(client, w["f1"], kg=kg, price=300)
    res = buy(client, w["r"], lid, payment="invoice")
    oid = res["id"]
    return res, oid, deliver(client, w, oid, bag, kg, inspector=w["r"], passed=passed, inspect_kg=inspect_kg)


def test_invoice_holds_nothing_and_settles_directly(client):
    w = world(client)
    res, oid, out = invoice_trade(client, w)
    assert (res["held_krw"], res["goods_krw"], res["payment"], res["freight_cap_krw"]) == (0, 30000, "invoice", 0)   # 운임은 판매자 부담이라 보류할 것이 없음
    assert out.json()["settlement"] == {"factory_krw": 30000, "platform_krw": 0, "refund_krw": 0, "invoice": True}
    assert db().query(Payment).filter_by(order_id=oid).one().status == "invoice"


def test_invoice_refund_never_negative_even_when_weight_grows(client):
    w = world(client)
    _, _, out = invoice_trade(client, w, kg=100, inspect_kg=105)   # 허용 오차 끝(+5%): 에스크로면 1.05 보류로 흡수되던 경우
    assert out.status_code == 200
    assert out.json()["settlement"]["factory_krw"] == 31500 and out.json()["settlement"]["refund_krw"] == 0


@pytest.mark.parametrize("resolution,body,factory_krw", [
    ("regrade", {"new_price_krw_per_kg": 200}, 20000),
    ("treat", {"treatment_fee_krw": 7000}, 0),
    ("return", {}, 0)])
def test_invoice_dispute_resolution_refund_non_negative(client, resolution, body, factory_krw):
    w = world(client)
    _, oid, out = invoice_trade(client, w, passed=False)
    assert out.json()["status"] == "disputed"
    res = client.post(f"/v1/admin/orders/{oid}/resolve", headers=H(w["op"]), json={"resolution": resolution, "note": "중재", **body})
    assert res.status_code == 200, res.text
    s = res.json()["settlement"]
    assert s["invoice"] is True and s["factory_krw"] == factory_krw and "hauler_krw" not in s and s["refund_krw"] == 0


def test_invoice_cancel_refunds_nothing(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid, payment="invoice")["id"]
    assert client.post(f"/v1/orders/{oid}/cancel", headers=H(w["r"]), json={}).json()["refund_krw"] == 0   # 보류한 돈이 없음
    assert db().query(Payment).filter_by(order_id=oid).one().status == "invoice"


def test_order_options_are_saved_and_shown(client):
    w = world(client)
    _, lid = sell(client, w["f1"])
    res = buy(client, w["r"], lid, delivery_address="가상로 9", desired_date="2026-12-24", note="오전에")
    assert (res["delivery_address"], res["desired_date"], res["note"], res["transport"], res["payment"]) == ("가상로 9", "2026-12-24", "오전에", "seller", "escrow")
    for got in (client.get(f"/v1/orders/{res['id']}", headers=H(w["r"])).json(), client.get("/v1/me/orders", headers=H(w["r"])).json()[0]):
        assert (got["delivery_address"], got["desired_date"], got["note"]) == ("가상로 9", "2026-12-24", "오전에")
    seller = client.get(f"/v1/orders/{res['id']}", headers=H(w["f1"])).json()   # 운송을 맡은 판매자도 같은 조건을 본다
    assert (seller["desired_date"], seller["note"], seller["hauler_id"]) == ("2026-12-24", "오전에", w["f1"])
    _, lid2 = sell(client, w["f2"])
    assert client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid2, "note": "x" * 501}).status_code == 400


@pytest.mark.skipif(not PG_URL.startswith("postgresql"), reason="동시성은 PostgreSQL에서 확인")
def test_batch_concurrent_opposite_order_is_all_or_nothing(client):
    from concurrent.futures import ThreadPoolExecutor
    w = world(client)
    ids = [sell(client, w["f1"])[1], sell(client, w["f2"])[1], sell(client, w["f1"])[1]]
    calls = [lambda: batch(client, w, ids, who="r"), lambda: batch(client, w, ids[::-1], who="r2")]
    with ThreadPoolExecutor(2) as ex:
        res = [f.result() for f in [ex.submit(c) for c in calls]]
    assert sorted(r.status_code for r in res) == [201, 409]                 # 교착 없이 한쪽만 전부 성공
    assert {l.status for l in db().query(Listing)} == {"sold"}
    assert db().query(Payment).count() == 3
    winner = "r" if res[0].status_code == 201 else "r2"
    assert len(client.get("/v1/me/orders", headers=H(w[winner])).json()) == 3
    assert client.get("/v1/me/orders", headers=H(w["r" if winner == "r2" else "r2"])).json() == []


# ── 12.4 묶음 주문·미리보기 ──
def batch(client, w, ids, who="r", **kw):
    return client.post("/v1/orders/batch", headers=H(w[who]), json={"listing_ids": ids, **kw})


def test_batch_creates_all_orders_with_exact_amounts(client):
    w = world(client)
    _, a = sell(client, w["f1"], kg=100, price=300)
    _, b = sell(client, w["f2"], kg=50, price=200)
    res = batch(client, w, [b, a], delivery_address="가상로 9")
    assert res.status_code == 201, res.text
    orders = res.json()["orders"]
    assert [(o["listing_id"], o["goods_krw"], o["held_krw"], o["freight_cap_krw"], o["status"]) for o in orders] == [(b, 10000, 10500, 0, "dispatched"), (a, 30000, 31500, 0, "dispatched")]
    assert all(o["delivery_address"] == "가상로 9" for o in orders)
    assert client.get("/v1/listings", headers=H(w["r"])).json() == []
    assert len(client.get("/v1/me/orders", headers=H(w["r"])).json()) == 2
    assert [client.get(f"/v1/orders/{o['id']}", headers=H(w["r"])).json()["hauler_id"] for o in orders] == [w["f2"], w["f1"]]   # 각 판매 공장이 운송


def test_batch_failure_rolls_back_everything(client):
    w = world(client)
    _, a = sell(client, w["f1"])
    _, b = sell(client, w["f2"])
    buy(client, w["r2"], b)   # b는 이미 팔림 → 더 큰 id라 a를 먼저 선점한 뒤 실패한다
    res = batch(client, w, [a, b])
    assert res.status_code == 409
    assert db().query(Listing).filter_by(id=a).one().status == "posted"           # 선점했던 a도 되돌아옴
    assert [l["id"] for l in client.get("/v1/listings", headers=H(w["r"])).json()] == [a]
    assert client.get("/v1/me/orders", headers=H(w["r"])).json() == []
    assert db().query(Payment).count() == 1                                        # r2의 주문 것뿐
    assert db().query(Notification).filter(Notification.order_id.isnot(None)).count() >= 1
    assert batch(client, w, [a]).status_code == 201                                # 그 뒤 정상 주문 가능


def test_batch_validation_and_permissions(client):
    w = world(client)
    _, a = sell(client, w["f1"])
    assert batch(client, w, [a, a]).status_code == 400
    assert batch(client, w, []).status_code == 400
    assert batch(client, w, list(range(1, 22))).status_code == 400
    assert batch(client, w, [a], transport="matched").status_code == 400
    assert batch(client, w, [a], transport="self").status_code == 201
    _, b = sell(client, w["f2"])
    assert batch(client, w, [b, 9999]).status_code == 404
    assert client.get(f"/v1/listings/{b}", headers=H(w["r"])).json()["status"] == "posted"
    assert batch(client, w, [b], who="f1").status_code == 403
    assert client.post("/v1/orders/batch", json={"listing_ids": [b]}).status_code == 401
    no_permit = mk_company(client, "무허가", "recycler", permit_no="N", permit_codes=[IRON])
    client.post(f"/v1/admin/companies/{no_permit}/verify", headers=H(w["op"]), json={})
    assert batch(client, {"x": no_permit}, [b], who="x").status_code == 403
    assert client.get(f"/v1/listings/{b}", headers=H(w["r"])).json()["status"] == "posted"


def test_batch_invoice_and_self_amounts(client):
    w = world(client)
    _, a = sell(client, w["f1"], kg=100, price=300)
    _, b = sell(client, w["f2"], kg=40, price=100)
    o = batch(client, w, [a, b], transport="self", payment="invoice").json()["orders"]
    assert [(x["held_krw"], x["goods_krw"], x["status"]) for x in o] == [(0, 30000, "dispatched"), (0, 4000, "dispatched")]


def test_preview_totals_and_pickup_groups(client):
    w = world(client)
    _, a = sell(client, w["f1"], kg=100, price=300)
    _, b = sell(client, w["f2"], kg=50, price=200)
    _, c = sell(client, w["far"], kg=10, price=100)
    got = client.post("/v1/orders/preview", headers=H(w["r"]), json={"listing_ids": [a, b, c]}).json()
    assert (got["goods_krw"], got["held_krw"], got["fee_krw"]) == (30000 + 10000 + 1000, 31500 + 10500 + 1050, 0)
    assert [(i["goods_krw"], i["freight_cap_krw"], i["freight_payer"]) for i in got["items"]] == [(30000, 0, "seller"), (10000, 0, "seller"), (1000, 0, "seller")]
    assert got["pickup_groups"] == [{"factory_ids": [w["f1"], w["f2"]], "listing_ids": [a, b], "total_kg": 150.0, "radius_km": 3}]   # f1·f2는 약 1.4km
    close = client.post("/v1/orders/preview", headers=H(w["r"]), json={"listing_ids": [a, c]}).json()
    assert close["pickup_groups"] == []
    assert client.get("/v1/listings", headers=H(w["r"])).json() and db().query(Payment).count() == 0   # 미리보기는 아무것도 만들지 않음
    assert client.post("/v1/orders/preview", headers=H(w["r"]), json={"listing_ids": [9999]}).status_code == 404
    assert client.post("/v1/orders/preview", headers=H(w["f1"]), json={"listing_ids": [a]}).status_code == 403


# ── 12.5 공동 묶음 ──
def test_bundles_radius_and_same_seller_rules(client):
    w = world(client)
    r = H(w["r"])
    assert client.get("/v1/buyer/bundles", headers=r).json() == []
    _, a = sell(client, w["f1"], kg=600, price=300)
    _, same = sell(client, w["f1"], kg=500, price=300)         # 같은 판매자만이면 묶음 아님
    assert client.get("/v1/buyer/bundles", headers=r).json() == []
    _, far = sell(client, w["far"], kg=800, price=300)          # 반경 밖
    assert client.get("/v1/buyer/bundles", headers=r).json() == []
    _, b = sell(client, w["f2"], kg=400, price=200)
    _, diff_grade = sell(client, w["f2"], kg=92, impure=8, price=100)   # 등급 B는 따로
    got = client.get("/v1/buyer/bundles", headers=r).json()
    assert len(got) == 1
    bundle = got[0]
    assert set(bundle["listing_ids"]) == {a, same, b} and far not in bundle["listing_ids"] and diff_grade not in bundle["listing_ids"]
    assert (bundle["grade"], bundle["waste_code"], bundle["seller_count"], bundle["total_kg"]) == ("A", CODE, 2, 1500.0)
    assert bundle["meets_min_lot"] is True and bundle["min_lot_kg"] == 1000
    assert bundle["avg_price"] == round((600 * 300 + 500 * 300 + 400 * 200) / 1500, 2)
    assert bundle["reasons"] and bundle["market"]["item"] == "PP 압축" and len(bundle["listings"]) == 3
    assert client.get("/v1/buyer/home", headers=r).json()["bundles"] == got
    assert client.get("/v1/buyer/bundles", headers=H(w["f1"])).status_code == 403
    assert client.get("/v1/buyer/bundles").status_code == 401
    batch(client, w, [a, b])                                   # 팔린 매물은 묶음에서 빠지고 다시 단독이 됨
    assert client.get("/v1/buyer/bundles", headers=r).json() == []


def test_bundle_below_min_lot_is_flagged(client):
    w = world(client)
    sell(client, w["f1"], kg=100)
    sell(client, w["f2"], kg=100)
    b = client.get("/v1/buyer/bundles", headers=H(w["r"])).json()[0]
    assert b["total_kg"] == 200.0 and b["meets_min_lot"] is False


# ── 12.6 알림 ──
def test_notifications_created_read_and_settings(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    seller = client.get("/v1/notifications", headers=H(w["f1"])).json()
    assert seller["unread"] == 1 and seller["items"][0]["order_id"] == oid and seller["items"][0]["read"] is False
    assert client.get("/v1/notifications", headers=H(w["r"])).json() == {"unread": 0, "items": []}   # 주문한 본인에게는 없음
    deliver(client, w, oid, bag, 100, inspector=w["r"])
    titles = [n["title"] for n in client.get("/v1/notifications", headers=H(w["f1"])).json()["items"]]
    assert titles == ["정산 완료", "새 주문"]                         # 최신순. 출고는 판매자 본인이 기록해 판매자에게는 없음
    buyer = [n["title"] for n in client.get("/v1/notifications", headers=H(w["r"])).json()["items"]]
    assert buyer == ["정산 완료", "출고 완료"]                        # 도착은 구매자가 검사와 함께 기록
    assert client.get("/v1/seller/home", headers=H(w["f1"])).json()["unread"] == 2
    assert client.get("/v1/buyer/home", headers=H(w["r"])).json()["unread"] == 2
    first = client.get("/v1/notifications", headers=H(w["f1"])).json()["items"][0]["id"]
    assert client.post(f"/v1/notifications/{first}/read", headers=H(w["r"])).status_code == 404   # 남의 알림
    assert client.post(f"/v1/notifications/{first}/read", headers=H(w["f1"])).json()["unread"] == 1
    assert client.post("/v1/notifications/read-all", headers=H(w["f1"])).json()["unread"] == 0
    assert client.get("/v1/notifications", headers=H(w["f1"])).json()["unread"] == 0
    assert client.get("/v1/notifications", headers=H(w["r"])).json()["unread"] >= 1                # 남의 읽음에 영향 없음
    assert client.get("/v1/notifications").status_code == 401


def test_notification_settings_off_stops_creation(client):
    w = world(client)
    assert client.get("/v1/me/notification-settings", headers=H(w["f1"])).json() == {"orders": True, "market": True}
    assert client.put("/v1/me/notification-settings", headers=H(w["f1"]), json={"orders": False, "market": True}).json() == {"orders": False, "market": True}
    _, lid = sell(client, w["f1"])
    buy(client, w["r"], lid)
    assert client.get("/v1/notifications", headers=H(w["f1"])).json() == {"unread": 0, "items": []}
    client.put("/v1/me/notification-settings", headers=H(w["f1"]), json={"orders": True, "market": False})
    _, lid2 = sell(client, w["f1"])
    buy(client, w["r"], lid2)
    assert client.get("/v1/notifications", headers=H(w["f1"])).json()["unread"] == 1
    assert client.put("/v1/me/notification-settings", headers=H(w["f1"]), json={"orders": True}).status_code == 400


def test_notification_failure_does_not_block_trade_and_is_logged(client, monkeypatch, caplog):
    from app.features.notifications import service as notify

    class Boom:
        def __init__(self, **_):
            raise RuntimeError("알림 저장 실패")

    monkeypatch.setattr(notify, "Notification", Boom)
    w = world(client)
    _, lid = sell(client, w["f1"])
    with caplog.at_level(logging.ERROR):
        res = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid})
    assert res.status_code == 201 and res.json()["status"] == "dispatched"
    assert any("알림 생성 실패" in r.getMessage() and r.exc_info for r in caplog.records)   # 예외를 숨기지 않음
    assert client.get("/v1/me/orders", headers=H(w["r"])).json()[0]["status"] == "dispatched"
    assert db().query(Payment).count() == 1


def test_support_faq_and_tickets_are_private(client):
    w = world(client)
    faq = client.get("/v1/support/faq", headers=H(w["r"])).json()
    assert faq and all({"id", "question", "answer"} <= set(f) for f in faq)
    assert {f["id"]: f["question"] for f in faq}[3] == "운송은 누가 맡습니까?" and "기사" not in str(faq)   # 운송은 판매자
    t = client.post("/v1/support/tickets", headers=H(w["r"]), json={"subject": "문의", "body": "내용"})
    assert t.status_code == 201 and t.json()["status"] == "open" and t.json()["subject"] == "문의" and t.json()["created_at"]
    assert [x["id"] for x in client.get("/v1/support/tickets", headers=H(w["r"])).json()] == [t.json()["id"]]
    assert client.get("/v1/support/tickets", headers=H(w["r2"])).json() == []
    assert client.post("/v1/support/tickets", headers=H(w["r"]), json={"subject": "", "body": "x"}).status_code == 400
    assert client.get("/v1/support/faq").status_code == 401


# ── 마대 QR 노출(§20) ──
def test_order_qr_only_for_seller(client):
    w = world(client)
    _, l1 = sell(client, w["f1"])
    o1 = buy(client, w["r"], l1)["id"]
    qr1 = client.get(f"/v1/orders/{o1}", headers=H(w["f1"])).json()["bags"][0]["qr"]
    assert qr1.startswith("MDP-")                                                                # 그 마대를 가진 판매자에게 준다
    assert "qr" not in client.get(f"/v1/orders/{o1}", headers=H(w["r"])).json()["bags"][0]       # 구매자에게는 주지 않음


# ── 12.8 사진 ──
def test_photo_upload_download_and_headers(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    path = f"/v1/bags/{bag}/photo"
    assert client.get(path, headers=H(w["r"])).status_code == 404       # 아직 없음
    put = client.put(path, headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG})
    assert put.status_code == 200
    got = client.get(path, headers=H(w["r"]))                            # 로그인한 누구나
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert got.headers["x-content-type-options"] == "nosniff" and got.content == base64.b64decode(PNG)
    assert client.get(path).status_code == 401
    assert client.get(f"/v1/listings/{lid}", headers=H(w["r"])).json()["bags"][0]["has_photo"] is True
    assert client.get(f"/v1/me/bags", headers=H(w["f1"])).json()[0]["has_photo"] is True
    jpeg = base64.b64encode(b"\xff\xd8\xff\xe0" + b"j" * 10).decode()
    assert client.put(path, headers=H(w["f1"]), json={"content_type": "image/jpeg", "data_base64": jpeg}).status_code == 200
    assert client.get(path, headers=H(w["f1"])).headers["content-type"] == "image/jpeg"           # 저장된 형식으로만
    webp = base64.b64encode(b"RIFF\x00\x00\x00\x00WEBPVP8 ").decode()
    assert client.put(path, headers=H(w["f1"]), json={"content_type": "image/webp", "data_base64": webp}).status_code == 200


def test_photo_rejects_bad_size_type_and_owner(client):
    w = world(client)
    bag, _ = sell(client, w["f1"])
    path = f"/v1/bags/{bag}/photo"
    put = lambda who, **b: client.put(path, headers=H(w[who]), json=b)   # noqa: E731
    big = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * (2 * 1024 * 1024)).decode()      # 디코드 뒤 2MB 초과
    assert put("f1", content_type="image/png", data_base64=big).status_code == 400
    assert put("f1", content_type="image/png", data_base64="A" * 3_000_000).status_code == 400   # 디코드 전에 거절
    exact = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * (2 * 1024 * 1024 - 8)).decode()
    assert put("f1", content_type="image/png", data_base64=exact).status_code == 200            # 딱 2MB는 허용
    assert put("f1", content_type="text/html", data_base64=PNG).status_code == 400
    assert put("f1", content_type="image/gif", data_base64=PNG).status_code == 400
    html = base64.b64encode(b"<script>alert(1)</script>").decode()
    assert put("f1", content_type="image/png", data_base64=html).status_code == 400            # 형식 위장
    assert put("f1", content_type="image/jpeg", data_base64=PNG).status_code == 400
    assert put("f1", content_type="image/png", data_base64="!!!not base64").status_code == 400
    assert put("f1", content_type="image/png", data_base64="").status_code == 400
    assert put("f2", content_type="image/png", data_base64=PNG).status_code == 404              # 남의 마대
    assert put("r", content_type="image/png", data_base64=PNG).status_code == 403
    assert client.put("/v1/bags/9999/photo", headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG}).status_code == 404
    assert db().query(Bag).filter_by(id=bag).one().photo_type == "image/png"                   # 거절된 요청이 덮어쓰지 않음


# ── 12.10 로그인 필요 ──
@pytest.mark.parametrize("method,path", [
    ("get", "/v1/me/addresses"), ("get", "/v1/me/interests"), ("get", "/v1/me/favorites"), ("get", "/v1/me/frequent-sellers"),
    ("get", "/v1/me/impact"), ("get", "/v1/notifications"), ("get", "/v1/me/notification-settings"), ("get", "/v1/support/tickets"),
    ("get", "/v1/buyer/bundles"),
    ("post", "/v1/orders/preview"), ("post", "/v1/orders/batch"), ("post", "/v1/notifications/read-all")])
def test_new_paths_require_login(client, method, path):
    assert getattr(client, method)(path).status_code == 401
