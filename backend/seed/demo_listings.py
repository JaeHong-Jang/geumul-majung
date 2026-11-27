"""시연 매물과, 정산·후기까지 끝난 시연 거래 3건을 실제 API로 만든다(운영자 작업 없음).
회사·무게는 가상이고, 단가는 공개 시세(data/prices.json 2026-09)에 맞춘다.
실행: python -m seed.demo_listings <서버주소> <공통 비밀번호>  (seed.gumi_demo를 먼저 실행)"""
import sys

import httpx

PLASTIC, IRON, NONFERROUS, PAPER = "51-03-01", "51-29-01", "51-29-02", "51-28-02"
# (공장 login_id, 폐기물 코드, 목표 재질, 단가(원/kg), [마대별 (재질, kg) 목록])
LISTINGS = [
    ("000-00-00001", PLASTIC, "pp", 380, [[("pp", 194), ("pe", 6)], [("pp", 291), ("pe", 9)], [("pp", 243), ("pe", 7)]]),
    ("000-00-00002", PLASTIC, "pp", 340, [[("pp", 276), ("pe", 24)]]),
    ("000-00-00003", PLASTIC, "pe", 420, [[("pe", 340), ("pp", 60)], [("pe", 255), ("pp", 45)]]),
    ("000-00-00001", IRON, "철", 360, [[("철", 780), ("기타", 20)], [("철", 585), ("기타", 15)]]),
    ("000-00-00002", NONFERROUS, "알루미늄", 2800, [[("알루미늄", 190), ("철", 10)]]),
    ("000-00-00003", PAPER, "골판지", 90, [[("골판지", 475), ("비닐", 25)], [("골판지", 380), ("비닐", 20)]]),
    # 같은 지역·같은 등급(A) pp 매물이 여러 곳에서 올라와 공동 묶음이 보이게 한다
    ("000-00-00007", PLASTIC, "pp", 372, [[("pp", 388), ("pe", 12)], [("pp", 291), ("pe", 9)]]),
    ("000-00-00008", PLASTIC, "pp", 365, [[("pp", 485), ("pe", 15)]]),
]
# 정산까지 끝낼 거래: (공장 login_id, 폐기물 코드, 재질, 단가, 마대 [(재질, kg)])
TRADES = [
    ("000-00-00001", PLASTIC, "pp", 360, [[("pp", 380), ("pe", 20)], [("pp", 190), ("pe", 10)]]),
    ("000-00-00002", IRON, "철", 350, [[("철", 960), ("기타", 40)]]),
    ("000-00-00003", PAPER, "골판지", 85, [[("골판지", 570), ("비닐", 30)]]),
]
RECYCLER = "000-00-00004"


def login(c: httpx.Client, login_id: str, password: str) -> dict:
    r = c.post("/v1/auth/login", json={"login_id": login_id, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def post(c: httpx.Client, path: str, headers: dict, body: dict) -> dict:
    r = c.post(path, headers=headers, json=body)
    r.raise_for_status()
    return r.json()


def list_bags(c: httpx.Client, headers: dict, code: str, target: str, bags: list) -> list[int]:
    ids = []
    for items in bags:
        bag = post(c, "/v1/bags", headers, {"waste_code": code, "target_material": target,
                                            "items": [{"material": m, "kg": kg} for m, kg in items]})
        post(c, f"/v1/bags/{bag['id']}/grade", headers, {})
        ids.append(bag["id"])
    return ids


def trade(c: httpx.Client, password: str, spec: tuple, number: int, method: str = "선별, 세척 후 재생 원료화") -> None:
    """등록 → 주문 → 판매자 출고 → 구매자 도착 확인과 검사 합격 → 인계서 → 후기까지 API로만 진행한다(운송은 판매자)."""
    login_id, code, target, price, bags = spec
    seller, buyer = login(c, login_id, password), login(c, RECYCLER, password)
    bag_ids = list_bags(c, seller, code, target, bags)
    listing = post(c, "/v1/listings", seller, {"bag_ids": bag_ids, "mode": "now", "price_krw_per_kg": price})
    order = post(c, "/v1/orders", buyer, {"listing_id": listing["id"]})["id"]
    weights = {"bag_weights": [{"bag_id": b, "kg": sum(kg for _, kg in items)} for b, items in zip(bag_ids, bags)]}
    post(c, f"/v1/orders/{order}/pickup", seller, weights)
    post(c, f"/v1/orders/{order}/inspect", buyer, {**weights, "passed": True})
    post(c, f"/v1/orders/{order}/handover/emitter", seller, {})
    post(c, f"/v1/orders/{order}/handover/carrier", seller, {"vehicle_no": "00가 0000"})
    post(c, f"/v1/orders/{order}/handover/processor", buyer, {"method": method})
    post(c, f"/v1/orders/{order}/handover/number", seller, {"allbaro_no": f"DEMO-{number:04d}"})   # 가상 번호
    for who, target_role, score in ((buyer, "factory", 5), (seller, "recycler", 5)):
        post(c, "/v1/ratings", who, {"order_id": order, "target": target_role, "score": score})
    print(f"시연 거래 {order}: {code} {target} 정산 완료")


def main(base: str, password: str, listings=None, trades=None) -> None:
    with httpx.Client(base_url=base, timeout=60) as c:
        for login_id, code, target, price, bags in listings or LISTINGS:
            headers = login(c, login_id, password)
            bag_ids = list_bags(c, headers, code, target, bags)
            got = post(c, "/v1/listings", headers, {"bag_ids": bag_ids, "mode": "now", "price_krw_per_kg": price})
            print(f"매물 {got['id']}: {code} {target} {got['grade']}등급 {got['total_kg']}kg {price}원/kg")
        for number, spec in enumerate(trades or TRADES, start=1):
            trade(c, password, spec, number)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
