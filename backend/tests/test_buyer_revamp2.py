"""구매자 개편 2차: 판매 공장 정보·후기, 입고지 수정, 세금계산서 발행 요청, 하차 장비 둘 다."""
from app.db.models import CompanyExtra
from tests.conftest import H
from tests.test_app_features import _close_db_sessions, db, sell, world  # noqa: F401


def test_seller_profile_and_reviews(client):
    w = world(client)
    _, lid = sell(client, w["f1"], kg=100, price=300)
    s = db()
    s.add(CompanyExtra(company_id=w["f1"], ceo_name="김가상", intro="사출 공장"))
    s.commit()
    got = client.get(f"/v1/sellers/{w['f1']}", headers=H(w["r"])).json()
    assert (got["name"], got["ceo_name"], got["region"], got["rating"], got["rating_count"]) == ("공장1", "김가상", "경북 구미", None, 0)
    assert [l["id"] for l in got["listings"]] == [lid] and got["distance_km"] == 4.0
    assert {"biz_no", "phone", "lat", "lon", "address", "completed_deals"} <= got.keys()
    assert client.get(f"/v1/sellers/{w['r']}", headers=H(w["r"])).status_code == 404   # 판매 공장만
    assert client.get(f"/v1/sellers/{w['f1']}/reviews", headers=H(w["r"])).json() == []
    row = client.get("/v1/listings", headers=H(w["r"])).json()[0]
    assert row["factory_rating_count"] == 0


def test_address_edit(client):
    w = world(client)
    a = client.post("/v1/me/addresses", headers=H(w["r"]), json={"label": "제1공장", "address": "경북 구미시 1공단로 1"}).json()
    got = client.put(f"/v1/me/addresses/{a['id']}", headers=H(w["r"]), json={"label": "제2공장", "address": "경북 구미시 3공단로 2, 2동"}).json()
    assert (got["label"], got["address"]) == ("제2공장", "경북 구미시 3공단로 2, 2동")
    assert client.put(f"/v1/me/addresses/{a['id']}", headers=H(w["r2"]), json={"label": "x", "address": "y"}).status_code == 404


def test_tax_invoice_and_both_unload(client):
    w = world(client)
    _, lid = sell(client, w["f1"], kg=100, price=300)
    body = {"listing_id": lid, "tax_invoice": {"email": "Tax@Example.com"},
            "dock": {"unload": "both", "max_vehicle": "5t", "hours": "평일 09:00~18:00"}}
    o = client.post("/v1/orders", headers=H(w["r"]), json=body)
    assert o.status_code == 201, o.text
    got = client.get(f"/v1/orders/{o.json()['id']}", headers=H(w["r"])).json()
    assert got["tax_invoice"] == {"email": "tax@example.com"}
    assert (got["dock"]["unload"], got["dock"]["load_ok"]) == ("both", False)
    _, lid2 = sell(client, w["f2"], kg=10, price=100)
    bad = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid2, "tax_invoice": {"email": "nope"}})
    assert bad.status_code == 400


def test_seller_transport_from_hold_to_settlement(client):
    """판매자 운송: 구매자 보류액에는 운임이 없고, 정산에는 기사 줄 없이 물건값과 환불만 남는다."""
    from tests.test_app_features import deliver
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    pv = client.post("/v1/orders/preview", headers=H(w["r"]), json={"listing_ids": [lid]}).json()
    assert pv["held_krw"] == 31500 and pv["items"][0]["freight_payer"] == "seller"
    o = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid}).json()
    assert (o["held_krw"], o["freight_cap_krw"], o["status"]) == (31500, 0, "dispatched")
    got = client.get(f"/v1/orders/{o['id']}", headers=H(w["r"])).json()
    assert (got["freight_payer"], got["hauler_id"], got["freight_krw"]) == ("seller", w["f1"], 0)
    r = deliver(client, w, o["id"], bag, 100, inspector=w["r"])
    assert r.status_code == 200, r.text
    st = client.get(f"/v1/orders/{o['id']}", headers=H(w["r"])).json()["settlement"]
    assert st == {"factory_krw": 30000, "platform_krw": 0, "refund_krw": 1500}


def test_old_freight_fields_are_ignored(client):
    """예전 앱이 보내던 운임 상한과 부담 주체는 무시하고 판매자 운송으로 받는다."""
    w = world(client)
    _, lid = sell(client, w["f1"], kg=100, price=300)
    o = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid, "freight_payer": "buyer", "freight_cap_krw": 50000}).json()
    assert (o["held_krw"], o["freight_cap_krw"]) == (31500, 0)
    assert client.get(f"/v1/orders/{o['id']}", headers=H(w["r"])).json()["freight_payer"] == "seller"
