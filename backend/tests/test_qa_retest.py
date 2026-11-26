"""화면 재시험에서 나온 서버 수정(ARCHITECTURE §20)."""
import base64

import pytest

from app.db.models import Bag
from tests.conftest import PG_URL, H
from tests.test_app_features import CODE, PNG, _close_db_sessions, buy, db, deliver, sell, world  # noqa: F401


# ── 1. 판매자에게 주문 QR ──
def test_order_bags_show_qr_to_owning_seller_only(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    qr = lambda who: client.get(f"/v1/orders/{oid}", headers=H(w[who])).json()["bags"][0]   # noqa: E731
    own = client.get(f"/v1/bags/{bag}", headers=H(w["f1"])).json()["qr"]
    assert qr("f1")["qr"] == own and own.startswith("MDP-")            # 판매 공장(운송 담당)
    assert "qr" not in qr("r")                                         # 구매자에게는 주지 않는다
    assert client.get(f"/v1/orders/{oid}", headers=H(w["f2"])).status_code == 403   # 다른 공장은 주문 자체를 못 본다


# ── 2. 판매 내림 후 복구 ──
def test_withdrawn_listing_lists_former_bags_and_can_be_relisted(client):
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300, material="pp")
    bag2, lid2 = sell(client, w["f1"], kg=50, price=300, material="pp")
    assert client.post(f"/v1/listings/{lid}/withdraw", headers=H(w["f1"])).status_code == 200
    detail = client.get(f"/v1/listings/{lid}", headers=H(w["f1"])).json()
    assert detail["bags"] == [] and detail["target_material"] == "pp"                       # '재질 정보 없음'이 아니다
    assert detail["former_bags"] == [{"id": bag, "target_material": "pp", "weight_kg": 100.0, "grade": "A", "available": True}]
    row = next(i for i in client.get("/v1/me/listings", headers=H(w["f1"])).json() if i["id"] == lid)
    assert row["former_bags"] == detail["former_bags"] and row["target_material"] == "pp" and row["bag_ids"] == []
    again = client.post("/v1/listings", headers=H(w["f1"]), json={"bag_ids": [bag], "mode": "now", "price_krw_per_kg": 310})
    assert again.status_code == 201                                                          # 기존 POST /listings로 재등록
    assert client.get(f"/v1/listings/{lid}", headers=H(w["f1"])).json()["former_bags"][0]["available"] is False   # 다른 판매에 들어감
    other = client.get(f"/v1/listings/{lid2}", headers=H(w["f1"])).json()
    assert "former_bags" not in other                                                        # 내린 판매가 아니면 없다
    assert client.get(f"/v1/listings/{lid}", headers=H(w["r"])).status_code == 404            # 구매자에게는 내린 판매 자체가 안 보인다


def test_former_bags_are_hidden_from_others_and_use_existing_storage(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    client.post(f"/v1/listings/{lid}/withdraw", headers=H(w["f1"]))
    assert client.get(f"/v1/listings/{lid}", headers=H(w["r"])).status_code == 404            # 내린 판매는 남에게 안 보임
    history = db().get(Bag, bag).history
    assert history[-1]["event"] == "withdrawn" and history[-1]["listing_id"] == lid           # 새 표·새 칸 없이 마대 이력(JSON)에 남김
    bundle_bag, bundle_lid = sell(client, w["f2"], mode="bundle")
    client.post(f"/v1/listings/{bundle_lid}/withdraw", headers=H(w["f2"]))
    assert client.get(f"/v1/listings/{bundle_lid}", headers=H(w["f2"])).json()["former_bags"][0]["id"] == bundle_bag


# ── 5. 검사 사진 경로가 있다 ──
def test_inspection_photo_upload_and_read_paths_exist(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    client.post(f"/v1/orders/{oid}/pickup", headers=H(w["f1"]), json={"bag_weights": [{"bag_id": bag, "kg": 100}]})
    up = client.post(f"/v1/orders/{oid}/photos", headers=H(w["r"]), json={"stage": "inspect", "content_type": "image/png", "data_base64": PNG})
    assert up.status_code == 201
    listed = client.get(f"/v1/orders/{oid}/photos", params={"stage": "inspect"}, headers=H(w["f1"])).json()
    assert [(p["stage"], p["content_type"]) for p in listed] == [("inspect", "image/png")]
    got = client.get(f"/v1/orders/{oid}/photos/{listed[0]['id']}", headers=H(w["f1"]))
    assert got.status_code == 200 and got.content == base64.b64decode(PNG) and got.headers["x-content-type-options"] == "nosniff"


# ── 6. 직접 수거 정산에는 기사 줄이 없다 ──
def test_self_pickup_settlement_has_no_hauler_line(client):
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    oid = buy(client, w["r"], lid, transport="self")["id"]
    out = deliver(client, w, oid, bag, 100, inspector=w["r"]).json()
    assert "hauler_krw" not in out["settlement"] and out["settlement"]["factory_krw"] == 30000
    for who in ("f1", "r"):
        assert "hauler_krw" not in client.get(f"/v1/orders/{oid}", headers=H(w[who])).json()["settlement"]
        assert "hauler_krw" not in client.get("/v1/me/orders", headers=H(w[who])).json()[0]["settlement"]
    # 예전에 저장된 정산 값(hauler_krw 0)도 응답에서는 뺀다
    from app.db.models import Order
    s = db()
    s.get(Order, oid).settlement = {**out["settlement"], "hauler_krw": 0}
    s.commit()
    assert "hauler_krw" not in client.get(f"/v1/orders/{oid}", headers=H(w["r"])).json()["settlement"]
    # 판매자 운송 주문도 운임은 판매자 부담이라 기사 줄이 없다
    b2, l2 = sell(client, w["f2"], kg=100, price=300)
    o2 = buy(client, w["r"], l2)["id"]
    s2 = deliver(client, w, o2, b2, 100, inspector=w["r"]).json()["settlement"]
    assert "hauler_krw" not in s2 and s2["factory_krw"] == 30000 and s2["refund_krw"] == 1500


# ── 직접 수거 수거 전 취소 ──
def test_self_pickup_buyer_can_cancel_before_pickup_with_full_refund(client):
    from app.db.models import Listing, Notification, Payment
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    oid = buy(client, w["r"], lid, transport="self")["id"]
    res = client.post(f"/v1/orders/{oid}/cancel", headers=H(w["r"]), json={})
    assert res.status_code == 200 and res.json() == {"status": "cancelled", "refund_krw": 31500}     # 보류액(물건값×1.05) 전액
    got = client.get(f"/v1/orders/{oid}", headers=H(w["r"])).json()
    assert got["status"] == "cancelled" and got["settlement"] == {"refund_krw": 31500}
    assert db().query(Payment).filter_by(order_id=oid).one().status == "refunded"
    assert db().get(Listing, lid).status == "posted" and db().get(Bag, bag).listing_id == lid        # 매물·마대 복원은 기존 취소와 같다
    again = buy(client, w["r2"], lid)                                                                  # 다른 구매 업체가 다시 살 수 있다
    assert again["status"] == "dispatched"
    seller = [n for n in db().query(Notification).filter_by(company_id=w["f1"]) if n.order_id == oid]
    assert [n.title for n in seller].count("주문 취소") == 1
    assert [n.title for n in db().query(Notification).filter_by(company_id=w["r"]) if n.order_id == oid] == []   # 취소한 본인에게는 알리지 않음


def test_self_pickup_cancel_rules_after_pickup_and_for_others(client):
    from app.db.models import Payment
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    oid = buy(client, w["r"], lid, transport="self")["id"]
    for who in ("f1", "r2", "f2", "op"):
        assert client.post(f"/v1/orders/{oid}/cancel", headers=H(w[who]), json={}).status_code == 403, who   # 판매자·제3자는 못 한다
    assert client.get(f"/v1/orders/{oid}", headers=H(w["r"])).json()["status"] == "dispatched"
    assert client.post(f"/v1/orders/{oid}/pickup", headers=H(w["r"]), json={"bag_weights": [{"bag_id": bag, "kg": 100}]}).status_code == 200
    late = client.post(f"/v1/orders/{oid}/cancel", headers=H(w["r"]), json={})
    assert late.status_code == 409 and late.json()["detail"] == "현재 '운송 중' 상태에서는 '취소'(으)로 바꿀 수 없음"
    assert db().query(Payment).filter_by(order_id=oid).one().status == "authorized"                    # 환불되지 않음


def test_seller_order_cannot_be_cancelled_after_pickup_and_second_cancel_refunds_once(client):
    from app.db.models import Payment
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    assert client.post(f"/v1/orders/{oid}/pickup", headers=H(w["f1"]), json={"bag_weights": [{"bag_id": bag, "kg": 100}]}).status_code == 200
    assert client.post(f"/v1/orders/{oid}/cancel", headers=H(w["r"]), json={}).status_code == 409    # 판매자 출고 뒤에는 취소 불가
    bag2, lid2 = sell(client, w["f2"])
    own = buy(client, w["r"], lid2, transport="self")["id"]
    assert client.post(f"/v1/orders/{own}/cancel", headers=H(w["r"]), json={}).status_code == 200
    second = client.post(f"/v1/orders/{own}/cancel", headers=H(w["r"]), json={})
    assert second.status_code == 409 and db().query(Payment).filter_by(order_id=own).one().status == "refunded"


@pytest.mark.skipif(not PG_URL.startswith("postgresql"), reason="동시성은 PostgreSQL에서 확인")
def test_concurrent_self_pickup_cancel_refunds_exactly_once(client):
    from concurrent.futures import ThreadPoolExecutor
    from app.db.models import Notification, Payment
    w = world(client)
    for _ in range(5):
        bag, lid = sell(client, w["f1"], kg=100, price=300)
        oid = buy(client, w["r"], lid, transport="self")["id"]
        calls = [lambda: client.post(f"/v1/orders/{oid}/cancel", headers=H(w["r"]), json={}) for _ in range(3)]
        with ThreadPoolExecutor(3) as ex:
            res = [f.result() for f in [ex.submit(c) for c in calls]]
        assert sorted(r.status_code for r in res) == [200, 409, 409]
        assert db().query(Payment).filter_by(order_id=oid).one().status == "refunded"
        assert len([n for n in db().query(Notification).filter_by(company_id=w["f1"]) if n.order_id == oid and n.title == "주문 취소"]) == 1
