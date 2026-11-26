"""앱별 첫 화면과 실제 시세(ARCHITECTURE §11)."""
import json

from app.core.config import ROOT
from tests.conftest import H, mk_company

CODE = "51-03-01"


def trade_setup(client):
    factory = mk_company(client, "공장", "factory", region="경북 구미")
    recycler = mk_company(client, "재활용", "recycler", permit_no="R", permit_codes=[CODE])
    operator = mk_company(client, "운영", "operator")
    assert client.post(f"/v1/admin/companies/{recycler}/verify", json={}, headers=H(operator)).status_code == 200
    bag = client.post("/v1/bags", headers=H(factory), json={
        "waste_code": CODE, "target_material": "pp", "items": [{"material": "pp", "kg": 100}]}).json()["id"]
    client.post(f"/v1/bags/{bag}/grade", headers=H(factory), json={})
    listing = client.post("/v1/listings", headers=H(factory), json={
        "bag_ids": [bag], "mode": "now", "price_krw_per_kg": 300}).json()["id"]
    return factory, recycler, bag, listing


def test_prices_are_latest_real_values_from_the_data_file(client):
    cid = mk_company(client, "공장", "factory")
    got = client.get("/v1/market/prices", headers=H(cid)).json()
    assert got
    raw = json.loads((ROOT / "data" / "prices.json").read_text(encoding="utf-8"))
    for row in got:
        history = sorted((r for r in raw if r["item"] == row["item"] and r["region"] == "전국"), key=lambda r: str(r["date"]))
        assert row["price"] == history[-1]["price"] and row["date"] == str(history[-1]["date"])
    assert client.get("/v1/market/prices").status_code == 401
    only = client.get("/v1/market/prices", params={"category": "폐금속"}, headers=H(cid)).json()
    assert only and {r["category"] for r in only} == {"폐금속"}


def test_each_app_home_is_only_for_its_role(client):
    factory, recycler, *_ = trade_setup(client)
    paths = {"/v1/buyer/home": recycler, "/v1/seller/home": factory}
    for path, owner in paths.items():
        assert client.get(path).status_code == 401
        assert client.get(path, headers=H(owner)).status_code == 200
        for other in {factory, recycler} - {owner}:
            assert client.get(path, headers=H(other)).status_code == 403
    assert client.get("/v1/carrier/home", headers=H(factory)).status_code == 404   # 운송기사 앱은 없어짐


def test_homes_follow_a_trade(client):
    factory, recycler, bag, listing = trade_setup(client)
    home = client.get("/v1/buyer/home", headers=H(recycler)).json()
    assert [l["id"] for l in home["listings"]] == [listing] and home["active_orders"] == [] and home["prices"]
    seller = client.get("/v1/seller/home", headers=H(factory)).json()
    assert seller["company"]["region"] == "경북 구미" and seller["bag_count"] == 1 and seller["listings"][0]["id"] == listing

    order = client.post("/v1/orders", headers=H(recycler), json={"listing_id": listing}).json()["id"]
    assert client.get("/v1/buyer/home", headers=H(recycler)).json()["listings"] == []
    assert client.get("/v1/buyer/home", headers=H(recycler)).json()["active_orders"][0]["id"] == order
    assert client.get("/v1/seller/home", headers=H(factory)).json()["orders"][0]["status"] == "dispatched"   # 판매자가 출고 준비

    weights = {"bag_weights": [{"bag_id": bag, "kg": 100}]}
    assert client.post(f"/v1/orders/{order}/pickup", headers=H(factory), json=weights).status_code == 200   # 판매자 운송
    client.post(f"/v1/orders/{order}/inspect", headers=H(recycler), json={**weights, "passed": True})
    assert client.get("/v1/buyer/home", headers=H(recycler)).json()["active_orders"] == []
    assert client.get("/v1/seller/home", headers=H(factory)).json()["orders"][0]["status"] == "settled"


def volume_setup(client):
    """공장 2곳, 재활용 1곳. 같은 pp를 'pp'·'PP'로 적은 매물과 철·미등록 재질 매물을 올린다."""
    f1 = mk_company(client, "공장1", "factory")
    f2 = mk_company(client, "공장2", "factory")
    recycler = mk_company(client, "재활용", "recycler", permit_no="R", permit_codes=[CODE])
    operator = mk_company(client, "운영", "operator")
    assert client.post(f"/v1/admin/companies/{recycler}/verify", json={}, headers=H(operator)).status_code == 200

    def post(factory, material, items, price, mode="now"):
        bag = client.post("/v1/bags", headers=H(factory), json={
            "waste_code": CODE, "target_material": material, "items": items}).json()["id"]
        client.post(f"/v1/bags/{bag}/grade", headers=H(factory), json={})
        r = client.post("/v1/listings", headers=H(factory), json={"bag_ids": [bag], "mode": mode, "price_krw_per_kg": price})
        assert r.status_code == 201, r.text
        return r.json()["id"]

    ids = {
        "a": post(f1, "pp", [{"material": "pp", "kg": 100}], 300),
        "b": post(f2, "PP", [{"material": "PP", "kg": 92}, {"material": "pe", "kg": 8}], 250),
        "gone": post(f2, "pp", [{"material": "pp", "kg": 50}], 400),
        "wait": post(f1, "pp", [{"material": "pp", "kg": 70}], 100, mode="bundle"),
        "drawn": post(f1, "pp", [{"material": "pp", "kg": 60}], 100),
        "ordered": post(f1, "pp", [{"material": "pp", "kg": 40}], 100),
        "iron": post(f1, "철", [{"material": "철", "kg": 500}], 200),
        "odd": post(f1, "특수재질", [{"material": "특수재질", "kg": 10}], 50),
    }
    assert client.post(f"/v1/listings/{ids['drawn']}/withdraw", headers=H(f1)).status_code == 200
    assert client.post("/v1/orders", headers=H(recycler), json={"listing_id": ids["ordered"]}).status_code == 201
    return f1, f2, recycler, ids


def test_volumes_sum_posted_listings_by_material(client):
    f1, f2, recycler, ids = volume_setup(client)
    assert client.get("/v1/market/volumes").status_code == 401
    got = client.get("/v1/market/volumes", headers=H(f1)).json()
    assert client.get("/v1/market/volumes", headers=H(recycler)).json() == got  # 역할 무관
    by = {v["target_material"]: v for v in got}
    # 주문됨·bundle_wait·withdrawn 제외, 'pp'와 'PP'는 한 묶음
    pp = by["pp"]
    assert pp["waste_code"] == CODE and pp["waste_name"]
    assert pp["total_kg"] == 100 + 100 + 50 and pp["listing_count"] == 3
    assert pp["seller_count"] == 2 and pp["bag_count"] == 3
    assert pp["min_price"] == 250 and pp["max_price"] == 400
    assert pp["grades"] == {"A": 150, "B": 100}
    assert [v["target_material"] for v in got][:2] == ["철", "pp"]  # 물량 큰 순(500 > 250)
    assert by["철"]["total_kg"] == 500 and by["철"]["grades"] == {"A": 500}


def test_volumes_market_matches_real_price_or_null(client):
    f1, *_ = volume_setup(client)
    by = {v["target_material"]: v for v in client.get("/v1/market/volumes", headers=H(f1)).json()}
    latest = {p["item"]: p for p in client.get("/v1/market/prices", headers=H(f1)).json()}
    for mat, item in (("pp", "PP 압축"), ("철", "철스크랩")):
        m = by[mat]["market"]
        assert m == {"item": item, "price": latest[item]["price"], "unit": latest[item]["unit"], "date": latest[item]["date"]}
    assert by["특수재질"]["market"] is None


def test_listings_carry_market_and_homes_carry_volumes(client):
    f1, f2, recycler, ids = volume_setup(client)
    items = {l["id"]: l for l in client.get("/v1/listings", headers=H(recycler)).json()}
    assert items[ids["a"]]["market"]["item"] == "PP 압축" and items[ids["b"]]["market"]["item"] == "PP 압축"
    assert items[ids["iron"]]["market"]["item"] == "철스크랩" and items[ids["odd"]]["market"] is None
    one = client.get(f"/v1/listings/{ids['a']}", headers=H(recycler)).json()
    assert one["market"]["item"] == "PP 압축" and one["purity_avg"] is not None
    assert client.get(f"/v1/listings/{ids['odd']}", headers=H(recycler)).json()["market"] is None
    expected = client.get("/v1/market/volumes", headers=H(recycler)).json()
    assert client.get("/v1/buyer/home", headers=H(recycler)).json()["volumes"] == expected
    assert client.get("/v1/seller/home", headers=H(f1)).json()["volumes"] == expected
