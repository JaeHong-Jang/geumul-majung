"""QA 3팀 화면 시험에서 나온 백엔드 수정(ARCHITECTURE §18)."""
import ast
import glob
import re

import pytest

from app.features.auth import juso
from app.features.inquiries.contact_mask import mask_contacts
from app.harness.runner import run_flow
from app.tools.calc import compute_grade, price_item_for
from tests.conftest import H, mk_company
from tests.test_app_features import CODE, _close_db_sessions, buy, db, deliver, sell, world  # noqa: F401
from tests.test_qa_fixes import returned_trade  # noqa: F401
from tests.test_seller_features import FUTURE, join, new_pool, pool_world
from tests.test_signup_auth import _clean, body, signup  # noqa: F401


@pytest.fixture(autouse=True)
def _reset():
    from app.core.security import geocode_limiter, login_limiter, signup_limiter
    for lim in (login_limiter, signup_limiter, geocode_limiter):
        lim.clear()


# ── 1. 통과증 여부 ──
def test_listing_detail_bags_tell_whether_a_pass_was_issued(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    seen = client.get(f"/v1/listings/{lid}", headers=H(w["r"])).json()["bags"][0]
    assert seen["pass_issued"] is True and seen["pass_id"] is None and seen["qr"] is None   # 번호는 숨기고 발급 사실만
    assert client.get(f"/v1/listings/{lid}", headers=H(w["f1"])).json()["bags"][0]["pass_id"] is not None


# ── 2. 금액 공개 범위 ──
MONEY_KEYS = ("goods_krw", "held_krw", "unit_price_krw_per_kg")


def test_seller_doing_transport_and_buyer_see_full_money(client):
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    oid = buy(client, w["r"], lid)["id"]
    assert deliver(client, w, oid, bag, 100, inspector=w["r"]).json()["status"] == "settled"
    for who in ("f1", "r"):                                               # 운송을 맡은 판매자도 금액을 가리지 않는다
        full = client.get(f"/v1/orders/{oid}", headers=H(w[who])).json()
        assert all(k in full for k in MONEY_KEYS) and full["hauler_id"] == w["f1"]
        assert full["goods_krw"] == 30000 and full["held_krw"] == 31500 and full["settlement"]["factory_krw"] == 30000
        assert full["settlement"]["refund_krw"] == full["held_krw"] - 30000
        row = client.get("/v1/me/orders", headers=H(w[who])).json()[0]
        assert row["goods_krw"] == 30000 and row["settlement"] == full["settlement"]


def test_returned_order_and_self_pickup_buyer_keep_full_money_view(client):
    w = world(client)
    oid = returned_trade(client, w)
    got = client.get(f"/v1/orders/{oid}", headers=H(w["f1"])).json()   # 판매 공장(운송 담당)
    assert {"factory_krw", "refund_krw", "platform_krw"} <= set(got["settlement"]) and "hauler_krw" not in got["settlement"]
    assert got["held_krw"] == 31500 and got["goods_krw"] == 30000
    bag, lid = sell(client, w["f2"], kg=100, price=300)
    own = buy(client, w["r"], lid, transport="self")["id"]
    assert client.get(f"/v1/orders/{own}", headers=H(w["r"])).json()["held_krw"] == 31500           # 직접 수거 구매자도 금액 전체를 본다


# ── 3. 409 문구 ──
ENGLISH_STATE = re.compile(r"\b(ordered|payment_held|dispatched|picked_up|arrived|confirmed|settled|rated|disputed|cancelled|returned)\b")


def test_state_conflict_messages_are_korean(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    early = client.post(f"/v1/orders/{oid}/inspect", headers=H(w["r"]), json={"bag_weights": [{"bag_id": bag, "kg": 100}], "passed": True})   # 출고 전 검사
    assert early.status_code == 409 and early.json()["detail"] == "현재 '출고 준비' 상태에서는 검사할 수 없음"
    assert client.post(f"/v1/orders/{oid}/pickup", headers=H(w["f1"]), json={"bag_weights": [{"bag_id": bag, "kg": 100}]}).status_code == 200
    cancel = client.post(f"/v1/orders/{oid}/cancel", headers=H(w["r"]), json={})
    assert cancel.status_code == 409 and cancel.json()["detail"] == "현재 '운송 중' 상태에서는 '취소'(으)로 바꿀 수 없음"
    wrong = [client.post(f"/v1/orders/{oid}/pickup", headers=H(w["f1"]), json={"bag_weights": [{"bag_id": bag, "kg": 100}]}),
             client.post(f"/v1/admin/orders/{oid}/resolve", headers=H(w["op"]), json={"resolution": "return", "note": "x"})]   # 운송 중 검사는 정상(도착 확인과 한 번에)
    for res in wrong:
        assert res.status_code == 409 and not ENGLISH_STATE.search(res.json()["detail"]), res.json()
        assert "상태" in res.json()["detail"]


# ── 4. 가입 지역 문구와 좌표 변환의 지역 ──
def test_signup_region_message_and_geocode_region(client, monkeypatch):
    res = client.post("/v1/signup", json=body(address="어딘가", n=50))   # 판매자 가입은 지역 칸이 없어 주소로 안내
    assert res.status_code == 400 and res.json()["detail"] == "사업장 주소를 시, 군을 포함해 입력 필요"
    res = client.post("/v1/signup", json=body("recycler", address="어딘가", n=51))
    assert res.status_code == 400 and res.json()["detail"] == "시, 군을 목록에서 선택 필요"

    class Resp:
        def __init__(self, data):
            self.data = data

        def raise_for_status(self):
            pass

        def json(self):
            return self.data
    x, y = juso.wgs84_to_utmk(36.1196, 128.3446)

    def fake(url, params=None, **kw):
        if url == juso.LINK_URL:
            known = "구미" in params["keyword"]
            return Resp({"results": {"common": {"errorCode": "0"}, "juso": [{"admCd": "1", "rnMgtSn": "2", "udrtYn": "0", "buldMnnm": 1, "buldSlno": 0,
                                               "siNm": "경상북도" if known else "", "sggNm": "구미시" if known else ""}]}})
        return Resp({"results": {"common": {"errorCode": "0"}, "juso": [{"entX": str(x), "entY": str(y)}]}})
    monkeypatch.setenv("JUSO_COORD_KEY", "k")
    monkeypatch.setenv("JUSO_SEARCH_KEY", "s")
    monkeypatch.setattr(juso.httpx, "get", fake)
    got = client.post("/v1/geocode", json={"road_address": "경북 구미시 산호대로 1"}).json()
    assert got["source"] == "juso" and got["region"] == "경북 구미"
    none = client.post("/v1/geocode", json={"road_address": "알 수 없는 주소 1"}).json()
    assert none["source"] == "juso" and none["region"] is None                      # 근거가 없으면 비워 둔다
    monkeypatch.delenv("JUSO_COORD_KEY")
    assert client.post("/v1/geocode", json={"road_address": "경북 구미시 1"}).json() == {"lat": None, "lon": None, "source": None, "region": None}


# ── 5. 문구 통일 ──
def test_user_facing_messages_use_polite_form(client, monkeypatch):
    w = world(client)
    assert client.post("/v1/auth/login", json={"login_id": "nobody", "password": "wrong-password"}).json()["detail"] == "아이디 또는 비밀번호가 맞지 않음"
    for _ in range(5):
        client.post("/v1/auth/login", json={"login_id": "nobody2", "password": "wrong-password"})
    assert client.post("/v1/auth/login", json={"login_id": "nobody2", "password": "x"}).json()["detail"] == "로그인 시도가 너무 많음, 5분 뒤에 다시 시도 필요"
    bag, lid = sell(client, w["f1"], kg=100)
    low = client.post("/v1/pools", headers=H(w["f1"]), json={"listing_id": lid, "target_kg": 50, "deadline": FUTURE})
    assert low.json()["detail"] == "목표 물량은 내 물량보다 커야 함"
    oid = buy(client, w["r"], lid)["id"]
    client.post(f"/v1/orders/{oid}/pickup", headers=H(w["f1"]), json={"bag_weights": [{"bag_id": bag, "kg": 100}]})
    bodies = [n["body"] for n in client.get("/v1/notifications", headers=H(w["r"])).json()["items"]]
    assert any(b.startswith(f"주문 #{oid} ") and b.endswith("판매자 출고, 운송 중") for b in bodies)
    faq = client.get("/v1/support/faq", headers=H(w["r"])).json()
    assert faq and not any(q["question"].endswith(("나요?", "가요?")) for q in faq)


def test_reset_mail_wording(client, _clean):
    signup(client, n=1)
    client.post("/v1/auth/password-reset", json={"email": "user1@example.com"})
    mail = sorted(_clean.glob("*.txt"))[-1].read_text(encoding="utf-8")
    assert "Subject: 잔재미 비밀번호 재설정" in mail and "[마대 장터]" not in mail
    assert "새 비밀번호 설정 필요" in mail and "이 메일 무시 필요" in mail and "십시오" not in mail


COLLOQUIAL = re.compile(r"(십시오|세요|해요|입니다|합니다|습니다|됩니다|니다|까요|주세요)")


def test_no_http_exception_detail_ends_in_terse_form():
    """사용자에게 가는 HTTPException 문구는 명사형(§23.1). ~합니다/~하십시오로 끝나면 실패한다."""
    bad = []
    for path in glob.glob("app/features/**/*.py", recursive=True) + ["app/core/deps.py"]:
        for node in ast.walk(ast.parse(open(path, encoding="utf-8").read())):
            if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "HTTPException" and len(node.args) > 1:
                msg = node.args[1]
                parts = [msg.value] if isinstance(msg, ast.Constant) else [v.value for v in getattr(msg, "values", []) if isinstance(v, ast.Constant)]
                last = (parts[-1] if parts else "").rstrip(" .)")
                if isinstance(msg, ast.Constant) and COLLOQUIAL.search(last):
                    bad.append((path, msg.value))
    assert not bad, bad


# ── 6. 재질 인식 ──
@pytest.mark.parametrize("name", ["철", "고철", "철스크랩", "골판지", "박스", "폐골판지", "알루미늄", "알루미늄캔", "PP", "pe", "PET"])
def test_seller_example_materials_are_recognized_and_have_a_price_item(name):
    g = compute_grade(name, [{"material": name, "kg": 100}])
    assert g["grade"] == "A" and g["reasons"] == [] and price_item_for(name)
    assert "[입력값]" not in str(g["reasons"]) + str(g["claim_reasons"])


def test_unknown_material_sentence_has_no_placeholder():
    g = compute_grade("pp", [{"material": "pp", "kg": 90}, {"material": "수상한재질", "kg": 10}])
    assert "인식하지 못한 재질이 있음, 재질 이름 확인 필요" in g["reasons"]
    assert "[입력값]" not in str(g["reasons"]) and "수상한재질" not in str(g["reasons"])


def test_pricing_advice_agrees_with_the_listing_market(client):
    w = world(client)
    _, lid = sell(client, w["f1"], kg=500, price=360, material="철")
    market = client.get(f"/v1/listings/{lid}", headers=H(w["r"])).json()["market"]
    assert market["item"] == "철스크랩"
    ctx = {"listing": {"waste_code": "51-29-01", "grade": "A", "total_kg": 500, "price_krw_per_kg": 360, "target_material": "철"},
           "bags": [{"waste_code": "51-29-01", "grade": "A", "target_material": "철", "total_kg": 500}], "nearby_listings": [],
           "factory": {"lat": 36.1, "lon": 128.4}}
    text = " ".join(c.text for r in run_flow("listing_advice", ctx, llm=None).results for c in r.claims)
    assert "찾지 못해" not in text and "철스크랩" in text


# ── 7. 연락처 가림 ──
def test_phone_masking_keeps_following_quantities():
    assert mask_contacts("연락처 010-1234-5678 750kg 380원") == ("연락처 *** 750kg 380원", True)
    assert mask_contacts("010 1234 5678 3개") == ("*** 3개", True)
    assert mask_contacts("(010) 1234 5678 750") == ("*** 750", True)
    assert mask_contacts("+82 10 1234 5678 3개") == ("*** 3개", True)
    assert mask_contacts("02-123-4567 380원") == ("*** 380원", True)
    assert mask_contacts("010-12-34567") == ("***", True)
    assert mask_contacts("1002 1234 5678 90")[1] is True                               # 기존 차단 유지


# ── 9. 공동판매 참여 조회 ──
def test_pool_join_screen_data(client):
    w = pool_world(client)
    pool, l1 = new_pool(client, w, kg=100, price=300, target=500)
    _, mine_l = sell(client, w["f2"], kg=60, price=300, mode="bundle")
    listed = client.get("/v1/pools", headers=H(w["f2"])).json()[0]
    assert (listed["joined"], listed["mine"], listed["is_owner"]) == (False, False, False) and "members" not in listed
    assert listed["target_kg"] == 500 and listed["current_kg"] == 100.0 and listed["remaining_kg"] == 400.0
    assert listed["min_join_price_krw_per_kg"] > 0 and listed["deadline"] == FUTURE
    assert [x["id"] for x in listed["joinable_listings"]] == [mine_l] and "공장1" not in str(listed)
    detail = client.get(f"/v1/pools/{pool['id']}", headers=H(w["f2"])).json()
    assert "members" not in detail and detail["id"] == pool["id"] and "공장1" not in str(detail)
    assert client.get(f"/v1/pools/{pool['id']}", headers=H(w["far"])).status_code == 404         # 반경 밖은 보이지 않음
    assert client.get("/v1/pools/9999", headers=H(w["f2"])).status_code == 404
    assert client.get(f"/v1/pools/{pool['id']}", headers=H(w["r"])).status_code == 403
    res = client.post(f"/v1/pools/{pool['id']}/join", headers=H(w["f2"]), json={"listing_id": mine_l}).json()
    assert (res["joined"], res["mine"], res["is_owner"]) == (True, True, False) and "joinable_listings" not in res
    after = client.get(f"/v1/pools/{pool['id']}", headers=H(w["f2"])).json()
    assert after["members"] and after["remaining_kg"] == 340.0
    owner = client.get("/v1/pools?mine=1", headers=H(w["f1"])).json()[0]
    assert (owner["joined"], owner["mine"], owner["is_owner"]) == (True, True, True)
    assert client.get("/v1/pools", headers=H(w["f2"])).json() == []                               # 참여한 것은 '참여할' 목록에서 빠짐


# ── 10. 관심 업체 목록 ──
def test_favorite_recycler_list_api_exists(client):
    w = world(client)
    assert client.put(f"/v1/me/favorite-recyclers/{w['r']}", headers=H(w["f1"]), json={}).json()["favorite"] is True
    got = client.get("/v1/me/favorite-recyclers", headers=H(w["f1"])).json()
    assert [r["id"] for r in got] == [w["r"]] and got[0]["favorite"] is True and {"name", "region", "materials", "distance_km"} <= set(got[0])
