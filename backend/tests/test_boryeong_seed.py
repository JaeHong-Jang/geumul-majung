"""그물마중: 보령 폐어구 시드가 실제 API 규칙(품목 코드, 재질, 등급, 주문 체크리스트)을 통과하는지."""
from seed import boryeong_demo, demo_listings, gumi_demo
from tests.conftest import H


def seed_boryeong(client):
    from sqlalchemy.orm import sessionmaker
    from app.db.session import get_session
    from app.main import app
    Session = sessionmaker(bind=next(app.dependency_overrides[get_session]()).get_bind(), expire_on_commit=False)
    gumi_demo.SessionLocal, gumi_demo.engine = Session, Session.kw["bind"]
    ids = gumi_demo.seed(**boryeong_demo.SEED_ARGS)
    return {biz: ids[name] for name, _, biz, *_ in boryeong_demo.COMPANIES}


def test_boryeong_listings_post_and_gear_checklist(client):
    by_login = seed_boryeong(client)
    assert client.get("/v1/me", headers=H(by_login["000-00-00001"])).json()["name"] == "가상 삽시도 집하장"
    posted = []
    for login_id, code, target, price, bags in boryeong_demo.LISTINGS:
        seller = H(by_login[login_id])
        bag_ids = demo_listings.list_bags(client, seller, code, target, bags)
        got = demo_listings.post(client, "/v1/listings", seller, {"bag_ids": bag_ids, "mode": "now", "price_krw_per_kg": price})
        assert got["grade"] in ("A", "B", "C"), (code, target, got)
        posted.append(got)
    net = posted[0]                                   # 삽시도 나일론 자망
    buyer = H(by_login["000-00-00004"])
    order = demo_listings.post(client, "/v1/orders", buyer, {"listing_id": net["id"]})
    items = client.get(f"/v1/orders/{order['id']}/checklist", headers=buyer).json()["items"]
    assert [i["item"] for i in items] == ["recycler_permit", "seller_transport", "handover_entry"]
    assert items[0]["ok"] is True                     # 가상 재활용업체 허가 코드에 폐어망(51-03-08)이 있음
    assert "신고" in items[1]["text"] and {"wma-rule-66-6-11", "wma-46"} <= {l["ref"] for l in items[1]["laws"]}
    assert "생활폐기물" in items[2]["text"] and "wma-2" in {l["ref"] for l in items[2]["laws"]}


def test_gear_words_map_to_codes_and_prices():
    from app.features.market.metals import metal_reference
    from app.tools.calc import canon_material, price_item_for
    from app.tools.data import assumptions, load_json, source_ids
    assert canon_material("나이론") == "나일론" and canon_material("스티로폼") == "eps" and canon_material("납추") == "납"
    assert price_item_for("스티로폼") == "EPS 잉고트" and price_item_for("나일론") is None      # 나일론은 공개 시세 없음
    lead = metal_reference("봉돌")
    assert lead["metal"] == "납" and lead["source_id"] == "FG-LEAD-WB" and lead["price"] > 0
    assert assumptions()["waste_keywords"]["그물"] == "51-03-08"
    codes = {w["code"] for w in load_json("waste_codes.json")}
    assert {"51-03-08", "51-03-05", "51-03-06"} <= codes
    assert {r["sourceId"] for r in load_json("gear_costs.json")} <= source_ids()
