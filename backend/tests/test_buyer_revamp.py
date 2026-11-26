"""구매자 개편: 구매 희망 등록, 운임 상한 없이 주문(기준 운임 자동), 입고지 상·하차 조건."""
from tests.conftest import H
from tests.test_app_features import _close_db_sessions, sell, world  # noqa: F401  (fixture 재사용)

WANT = {"material": "PP", "item": "사출 스크랩", "waste_code": "51-03-01", "qty_kg": 2000, "price_krw_per_kg": 350,
        "price_unit": "ton", "repeat": "monthly", "note": "분쇄품 우선"}


def test_buy_request_lifecycle(client):
    w = world(client)
    r = client.post("/v1/buy-requests", headers=H(w["r"]), json=WANT)
    assert r.status_code == 201, r.text
    got = r.json()
    assert (got["material"], got["item"], got["qty_kg"], got["price_krw_per_kg"], got["price_unit"], got["status"]) == \
        ("PP", "사출 스크랩", 2000, 350, "ton", "open")
    rid = got["id"]
    assert [x["id"] for x in client.get("/v1/me/buy-requests", headers=H(w["r"])).json()] == [rid]
    assert client.get("/v1/me/buy-requests", headers=H(w["r2"])).json() == []           # 남의 요청은 안 보임
    # 판매 공장은 열린 요청을 거리와 함께 본다
    open_ = client.get("/v1/buy-requests", headers=H(w["f1"])).json()
    assert [(x["id"], x["buyer_name"], x["distance_km"]) for x in open_] == [(rid, "재활용", 4.0)]
    assert client.get("/v1/buy-requests", headers=H(w["r"])).status_code == 403
    # 가격 협의(비움)로 수정, 마감하면 판매 공장 목록에서 빠진다
    edited = client.put(f"/v1/buy-requests/{rid}", headers=H(w["r"]), json={**WANT, "price_krw_per_kg": None}).json()
    assert edited["price_krw_per_kg"] is None
    assert client.post(f"/v1/buy-requests/{rid}/status", headers=H(w["r"]), json={"status": "closed"}).json()["status"] == "closed"
    assert client.get("/v1/buy-requests", headers=H(w["f1"])).json() == []
    assert client.put(f"/v1/buy-requests/{rid}", headers=H(w["r2"]), json=WANT).status_code == 404
    assert client.delete(f"/v1/buy-requests/{rid}", headers=H(w["r"])).status_code == 204
    assert client.get("/v1/me/buy-requests", headers=H(w["r"])).json() == []


def test_buy_request_validation(client):
    w = world(client)
    post = lambda **kw: client.post("/v1/buy-requests", headers=H(w["r"]), json={**WANT, **kw})  # noqa: E731
    assert post(qty_kg=0).status_code == 400
    assert post(material=" ").status_code == 400
    assert post(waste_code="99-99-99").status_code == 400
    assert post(need_by="2000-01-01").status_code == 400
    assert client.post("/v1/buy-requests", headers=H(w["f1"]), json=WANT).status_code == 403



def test_buy_request_price_range_and_negotiable(client):
    """희망 가격은 하한가~상한가 범위와 협상 가능 여부로 올린다. 한 가격(price_krw_per_kg)은 상한가로 맞춘다."""
    w = world(client)
    post = lambda **kw: client.post("/v1/buy-requests", headers=H(w["r"]), json={**WANT, **kw})  # noqa: E731
    r = post(price_krw_per_kg=None, price_min_krw_per_kg=300, price_max_krw_per_kg=350.5, negotiable=False)
    assert r.status_code == 201, r.text
    got = r.json()
    assert (got["price_min_krw_per_kg"], got["price_max_krw_per_kg"], got["price_krw_per_kg"], got["negotiable"]) ==         (300, 350.5, 350.5, False)
    assert post().json()["negotiable"] is True                                    # 기본은 협상 가능
    assert post(price_min_krw_per_kg=400, price_max_krw_per_kg=350).status_code in (400, 422)   # 하한가 > 상한가
    assert post(price_min_krw_per_kg=300).status_code in (400, 422)               # 한쪽만 입력

def test_order_has_no_freight_for_buyer(client):
    """운송은 판매자가 맡아 구매자 운임은 0원. 보류액은 원료비 ×1.05뿐."""
    w = world(client)
    _, lid = sell(client, w["f1"], kg=100, price=300)
    pv = client.post("/v1/orders/preview", headers=H(w["r"]), json={"listing_ids": [lid]}).json()
    item = pv["items"][0]
    assert item == {"listing_id": lid, "factory_id": w["f1"], "total_kg": 100.0, "goods_krw": 30000,
                    "freight_cap_krw": 0, "freight_payer": "seller", "held_krw": 31500}
    o = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid}).json()
    assert (o["freight_cap_krw"], o["held_krw"], o["transport"]) == (0, 31500, "seller")
    # 직접 수거도 운임 0
    _, lid2 = sell(client, w["f2"], kg=10, price=100)
    pv2 = client.post("/v1/orders/preview", headers=H(w["r"]), json={"listing_ids": [lid2], "transport": "self"}).json()
    assert (pv2["items"][0]["freight_cap_krw"], pv2["items"][0]["freight_payer"], pv2["held_krw"]) == (0, "buyer", 1050)
    self_ = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid2, "transport": "self"}).json()
    assert (self_["freight_cap_krw"], self_["held_krw"]) == (0, 1050)


def test_dock_conditions_reach_order_and_seller(client):
    w = world(client)
    _, lid = sell(client, w["f1"], kg=100, price=300)
    dock = {"unload": "forklift", "load_ok": True, "max_vehicle": "5t", "hours": "평일 09:00~17:00", "note": "정문 옆 하역장"}
    o = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid, "dock": dock}).json()
    assert client.get(f"/v1/orders/{o['id']}", headers=H(w["r"])).json()["dock"] == dock
    assert client.get(f"/v1/orders/{o['id']}", headers=H(w["f1"])).json()["dock"] == dock   # 운송을 맡은 판매자가 차와 장비를 고른다
    bad = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid, "dock": {**dock, "unload": "magic"}})
    assert bad.status_code == 400
    # 조건을 안 보내면 dock은 null
    _, lid2 = sell(client, w["f2"], kg=10, price=100)
    o2 = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid2}).json()
    assert client.get(f"/v1/orders/{o2['id']}", headers=H(w["r"])).json()["dock"] is None


def test_listing_terms_transport_hours_and_notes(client):
    """판매자가 적은 운송 방법, 출고 시간, 메모가 매물 상세에 실린다(없으면 기본: 판매자 회사 차량, 운임 판매자 부담)."""
    w = world(client)
    _, lid = sell(client, w["f1"], 300, 400)
    d = client.get(f"/v1/listings/{lid}", headers=H(w["r"])).json()
    assert d["terms"] == {"transport": "own", "ship_hours": None, "unload_forklift": False, "unload_crane": False,
                          "freight_payer": "seller"}
    r = client.patch(f"/v1/listings/{lid}", headers=H(w["f1"]),
                     json={"transport": "own", "ship_hours": "평일 08:00~17:00", "pickup_note": "세척 완료",
                           "unload_forklift": True})
    assert r.status_code == 200, r.text
    d = client.get(f"/v1/listings/{lid}", headers=H(w["r"])).json()
    assert (d["terms"]["transport"], d["terms"]["ship_hours"], d["pickup_note"]) == ("own", "평일 08:00~17:00", "세척 완료")
    assert isinstance(d["seller_notes"], list)
    assert (d["terms"]["unload_forklift"], d["terms"]["unload_crane"]) == (True, False)
    assert client.patch(f"/v1/listings/{lid}", headers=H(w["f1"]), json={"transport": "plane"}).status_code in (400, 422)



PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


def test_bag_photos_up_to_five(client):
    """등록 물품 사진은 5장까지, 첫 장은 예전 한 장 칸에도 들어가고, 판매 상세에 사진 번호가 실린다."""
    w = world(client)
    bag, lid = sell(client, w["f1"], 300, 400)
    ids = []
    for i in range(5):
        r = client.post(f"/v1/bags/{bag}/photos", headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    assert client.post(f"/v1/bags/{bag}/photos", headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG}).status_code == 409
    assert client.post(f"/v1/bags/{bag}/photos", headers=H(w["f2"]), json={"content_type": "image/png", "data_base64": PNG}).status_code == 404
    assert [p["id"] for p in client.get(f"/v1/bags/{bag}/photos", headers=H(w["r"])).json()] == ids
    assert client.get(f"/v1/bag-photos/{ids[2]}", headers=H(w["r"])).status_code == 200
    assert client.get(f"/v1/bags/{bag}/photo", headers=H(w["r"])).status_code == 200      # 첫 장은 예전 칸에도
    d = client.get(f"/v1/listings/{lid}", headers=H(w["r"])).json()
    assert d["bags"][0]["photo_ids"] == ids and d["bags"][0]["has_photo"] is True
    assert client.delete(f"/v1/bag-photos/{ids[0]}", headers=H(w["f1"])).status_code == 204
    assert len(client.get(f"/v1/bags/{bag}/photos", headers=H(w["f1"])).json()) == 4


def test_market_suggest_price_range(client):
    """주 재질 시세(원/kg)로 추천 단가 범위를 낸다. 시세가 없는 재질은 item=None."""
    w = world(client)
    got = client.get("/v1/market/suggest", params={"material": "철"}, headers=H(w["f1"])).json()
    assert got["unit"] == "원/kg" and got["item"]
    assert got["suggest_low"] <= got["price"] <= got["suggest_high"] + 10
    assert client.get("/v1/market/suggest", params={"material": "없는재질"}, headers=H(w["f1"])).json()["item"] is None
