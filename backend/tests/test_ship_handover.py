"""계약 32절: 판매자가 출고하면서 인계서 배출자, 운반자 칸을 함께 쓰고, 쓴 차량 번호를 기억한다."""
from tests.conftest import H
from tests.test_trade_v02 import ordered, world


def test_pickup_with_vehicle_writes_emitter_and_carrier_and_remembers_vehicle(client):
    w = world(client)
    b, _, oid = ordered(client, w)
    assert client.get(f"/v1/orders/{oid}/handover", headers=H(w["f"])).json()["vehicle_hint"] is None
    r = client.post(f"/v1/orders/{oid}/pickup", headers=H(w["f"]),
                    json={"bag_weights": [{"bag_id": b, "kg": 100}], "vehicle_no": "89바1234"})
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "picked_up"}                                # 응답 형식은 그대로
    h = client.get(f"/v1/orders/{oid}/handover", headers=H(w["f"])).json()
    assert h["emitter"]["company_name"] and h["carrier"]["vehicle_no"] == "89바1234" and h["processor"] is None
    assert h["vehicle_hint"] == "89바1234"                                      # 다음 출고 때 미리 채움
    assert client.get(f"/v1/orders/{oid}/handover", headers=H(w["r"])).json()["vehicle_hint"] is None   # 구매자에게는 없음

    # 다음 주문: 차량 번호 없이 출고하면 인계서는 그대로, 두 칸은 인계서 화면에서
    b2, _, oid2 = ordered(client, w)
    assert client.get(f"/v1/orders/{oid2}/handover", headers=H(w["f"])).json()["vehicle_hint"] == "89바1234"
    assert client.post(f"/v1/orders/{oid2}/pickup", headers=H(w["f"]), json={"bag_weights": [{"bag_id": b2, "kg": 100}]}).status_code == 200
    h = client.get(f"/v1/orders/{oid2}/handover", headers=H(w["f"])).json()
    assert h["emitter"] is None and h["carrier"] is None
    assert client.post(f"/v1/orders/{oid2}/handover/carrier", headers=H(w["f"]), json={"vehicle_no": "12가3456"}).status_code == 200
    assert client.get(f"/v1/orders/{oid2}/handover", headers=H(w["f"])).json()["vehicle_hint"] == "12가3456"


def test_blank_vehicle_is_400_and_nothing_shipped(client):
    w = world(client)
    b, _, oid = ordered(client, w)
    r = client.post(f"/v1/orders/{oid}/pickup", headers=H(w["f"]), json={"bag_weights": [{"bag_id": b, "kg": 100}], "vehicle_no": "  "})
    assert r.status_code in (400, 422)
    assert client.get(f"/v1/orders/{oid}", headers=H(w["f"])).json()["status"] == "dispatched"
