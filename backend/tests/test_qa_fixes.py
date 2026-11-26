"""독립 QA 2팀이 찾은 문제의 재현 회귀 테스트(ARCHITECTURE §17). 동시성은 PostgreSQL에서만 확인한다."""
import datetime as dt
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.features.orders import router as orders_api
from app.core.security import LoginLimiter, login_limiter, signup_limiter
from app.db.models import Bag, Company, Listing, Order, Payment
from app.main import app
from app.features.inquiries.contact_mask import mask_contacts
from tests.conftest import OP_TOKEN, PG_URL, H, mk_company
from tests.test_app_features import (CODE, PNG, _close_db_sessions, buy, db, deliver, sell, weights, world)  # noqa: F401
from tests.test_seller_features import FUTURE, join, new_pool, pool_world
from tests.test_signup_auth import _clean, bearer, body, install_fake, login, oauth_signup_token, signup, social_body, start, callback  # noqa: F401

pg_only = pytest.mark.skipif(not PG_URL.startswith("postgresql"), reason="동시성은 PostgreSQL에서 확인")


@pytest.fixture(autouse=True)
def _reset_limiters():
    from app.core.security import inquiry_limiter, message_limiter
    for lim in (login_limiter, signup_limiter, inquiry_limiter, message_limiter):
        lim.clear()


def set_listing(lid, **values):
    s = db()
    for k, v in values.items():
        setattr(s.get(Listing, lid), k, v)
    s.commit()


# ── 1. 주문 단가 스냅샷 ──
@pytest.mark.parametrize("new_price", [400, 200])
def test_order_is_refused_when_unit_price_changes_between_read_and_claim(client, monkeypatch, new_price):
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    real = orders_api.check_orderable

    def racing(me, listing):
        real(me, listing)
        set_listing(listing.id, price_krw_per_kg=new_price)   # 읽은 뒤 선점 전에 판매자가 단가를 바꾼 것
    monkeypatch.setattr(orders_api, "check_orderable", racing)
    res = client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid})
    assert res.status_code == 409 and db().query(Order).count() == 0 and db().query(Payment).count() == 0
    assert db().get(Listing, lid).status == "posted"                                  # 선점이 되돌려지거나 일어나지 않음
    monkeypatch.setattr(orders_api, "check_orderable", real)
    ok = buy(client, w["r"], lid)
    assert ok["goods_krw"] == 100 * new_price
    assert client.get(f"/v1/orders/{ok['id']}", headers=H(w["r"])).json()["unit_price_krw_per_kg"] == new_price


def test_settlement_and_resolution_use_the_order_price_not_the_listing_price(client):
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    oid = buy(client, w["r"], lid)["id"]
    set_listing(lid, price_krw_per_kg=400)                                             # 예전 경합이 남긴 어긋남을 흉내
    out = deliver(client, w, oid, bag, 100, inspector=w["r"], inspect_kg=105)
    assert out.status_code == 200 and out.json()["settlement"]["factory_krw"] == 31500    # 105kg × 주문 단가 300
    bag2, lid2 = sell(client, w["f2"], kg=100, price=300)
    oid2 = buy(client, w["r"], lid2)["id"]
    set_listing(lid2, price_krw_per_kg=400)
    assert deliver(client, w, oid2, bag2, 100, inspector=w["r"], passed=False).json()["status"] == "disputed"
    op = H(w["op"])
    assert client.post(f"/v1/admin/orders/{oid2}/resolve", headers=op, json={"resolution": "regrade", "new_price_krw_per_kg": 350, "note": "x"}).status_code == 400   # 주문 단가(300) 초과
    ok = client.post(f"/v1/admin/orders/{oid2}/resolve", headers=op, json={"resolution": "regrade", "new_price_krw_per_kg": 250, "note": "x"})
    assert ok.status_code == 200 and ok.json()["settlement"]["factory_krw"] == 25000


@pg_only
@pytest.mark.parametrize("new_price", [400, 200])
def test_concurrent_order_and_price_patch_never_blocks_settlement(client, new_price):
    w = world(client)
    for _ in range(8):
        bag, lid = sell(client, w["f1"], kg=100, price=300)
        calls = [lambda: client.post("/v1/orders", headers=H(w["r"]), json={"listing_id": lid}),
                 lambda: client.patch(f"/v1/listings/{lid}", headers=H(w["f1"]), json={"price_krw_per_kg": new_price})]
        with ThreadPoolExecutor(2) as ex:
            order, patch = [f.result() for f in [ex.submit(c) for c in calls]]
        if order.status_code != 201:
            assert order.status_code == 409
            continue
        oid = order.json()["id"]
        out = deliver(client, w, oid, bag, 100, inspector=w["r"], inspect_kg=105)
        assert out.status_code == 200 and out.json()["status"] == "settled", out.text       # 단가가 어긋나 400으로 막히지 않음
        unit = client.get(f"/v1/orders/{oid}", headers=H(w["r"])).json()["unit_price_krw_per_kg"]
        assert out.json()["settlement"]["factory_krw"] == round(105 * unit)


# ── 2. 반송 주문 ──
def returned_trade(client, w):
    bag, lid = sell(client, w["f1"], kg=100, price=300)
    oid = buy(client, w["r"], lid)["id"]
    assert deliver(client, w, oid, bag, 100, inspector=w["r"], passed=False).json()["status"] == "disputed"
    res = client.post(f"/v1/admin/orders/{oid}/resolve", headers=H(w["op"]), json={"resolution": "return", "note": "반송"})
    assert res.status_code == 200 and res.json()["status"] == "returned"
    return oid


def test_returned_order_is_not_counted_in_impact(client):
    w = world(client)
    returned_trade(client, w)
    assert client.get("/v1/me/impact", headers=H(w["r"])).json()["order_count"] == 0                 # 반송은 실적 제외
    assert client.get("/v1/me/frequent-sellers", headers=H(w["r"])).json() == []


# ── 3. 공동판매 소수 합 ──
def test_pool_target_compare_uses_decimal_sums(client):
    w = pool_world(client)
    pool, _ = new_pool(client, w, kg=100.1, price=300, target=300.3)
    res, _ = join(client, w, pool["id"], "f2", kg=200.2, price=300)
    assert res.json()["status"] == "sold" and res.json()["current_kg"] == 300.3           # 100.1 + 200.2 == 300.3


def test_pool_patch_target_not_above_decimal_current_is_refused(client):
    w = pool_world(client)
    pool, _ = new_pool(client, w, kg=100.1, price=300, target=400)
    join(client, w, pool["id"], "f2", kg=200.2, price=300)
    assert client.patch(f"/v1/pools/{pool['id']}", headers=H(w["f1"]), json={"target_kg": 300.3}).status_code == 400


# ── 4. self 주문 hauler 평가 ──
def test_self_order_rating_hauler_is_400_even_before_handover_number(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid, transport="self")["id"]
    deliver(client, w, oid, bag, 100, inspector=w["r"])
    assert client.post("/v1/ratings", headers=H(w["f1"]), json={"order_id": oid, "target": "hauler", "score": 5}).status_code == 400


# ── 5. 반송 주문의 마대 스냅샷 ──
def test_returned_order_keeps_its_bag_snapshot(client):
    w = world(client)
    oid = returned_trade(client, w)
    got = client.get(f"/v1/orders/{oid}", headers=H(w["r"])).json()
    assert len(got["bag_ids"]) == 1 and len(got["bags"]) == 1 and got["bags"][0]["total_kg"] == 100.0
    row = client.get("/v1/me/orders", headers=H(w["r"])).json()[0]
    assert row["bag_count"] == 1 and row["target_material"] == "pp"
    assert client.get(f"/v1/orders/{oid}", headers=H(w["f1"])).json()["bag_ids"] == got["bag_ids"]   # 판매 공장(운송 담당)


# ── 6. POST /companies 공개 우회 ──
def company_body(role="factory", **kw):
    return {"name": "공개가입", "role": role, "biz_no": "000-00-00000", "lat": 36.1, "lon": 128.4, **kw}


def test_public_company_creation_is_closed_unless_explicit_legacy_flag(client, monkeypatch):
    monkeypatch.delenv("LEGACY_COMPANY_CREATE")
    assert client.post("/v1/companies", json=company_body()).status_code == 403
    assert client.post("/v1/companies", json=company_body(login_id="x1", password="Str0ng-pass-1")).status_code == 403
    assert client.post("/v1/companies", json=company_body("operator")).status_code == 403
    ok = client.post("/v1/companies", json=company_body("operator"), headers={"X-Operator-Token": OP_TOKEN})
    assert ok.status_code == 201                                                       # 운영자 토큰이 있으면 가능
    assert client.post("/v1/companies", json=company_body("recycler", permit_no="R", permit_codes=[CODE]), headers={"X-Operator-Token": OP_TOKEN}).status_code == 201
    monkeypatch.setenv("LEGACY_COMPANY_CREATE", "1")
    assert client.post("/v1/companies", json=company_body()).status_code == 201       # 테스트용 명시 플래그
    monkeypatch.setenv("APP_ENV", "production")
    assert client.post("/v1/companies", json=company_body()).status_code == 403       # 운영에서는 플래그가 있어도 불가


# ── 7. 공동판매 가격 하한 ──
def test_pool_join_price_floor_from_market_or_creator_price(client):
    w = pool_world(client)
    market = {p["item"]: p["price"] for p in client.get("/v1/market/prices", headers=H(w["r"])).json()}["PP 압축"]
    pool, _ = new_pool(client, w, kg=100, price=250, target=900)
    floor = round(market * 0.7, 2)
    bad, bad_lid = join(client, w, pool["id"], "f2", kg=100, price=0.01)
    assert bad.status_code == 400 and str(floor).rstrip("0").rstrip(".") in bad.json()["detail"] or f"{floor:g}" in bad.json()["detail"]
    ok, _ = join(client, w, pool["id"], "f3", kg=100, price=floor)
    assert ok.status_code == 200 and ok.json()["applied_price_krw_per_kg"] == 250      # 하한 이상이면 들어가고, 단가는 최저(만든 공장 250)
    assert db().get(Listing, bad_lid).status == "bundle_wait"                          # 거부돼도 판매는 그대로
    # 시세가 없는 재질은 만든 공장 단가의 70%
    odd, _ = new_pool(client, w, kg=50, price=1000, target=900, who="f1") if False else (None, None)
    _, lid = sell(client, w["f2"], kg=50, price=1000, material="특수재질", mode="bundle")
    odd = client.post("/v1/pools", headers=H(w["f2"]), json={"listing_id": lid, "target_kg": 900, "deadline": FUTURE}).json()
    _, low = sell(client, w["f3"], kg=50, price=699, material="특수재질", mode="bundle")
    assert client.post(f"/v1/pools/{odd['id']}/join", headers=H(w["f3"]), json={"listing_id": low}).status_code == 400
    set_listing(low, price_krw_per_kg=700)
    assert client.post(f"/v1/pools/{odd['id']}/join", headers=H(w["f3"]), json={"listing_id": low}).status_code == 200


# ── 8. bundle_wait 비공개 ──
def test_bundle_wait_listing_is_visible_only_to_owner_and_operator(client):
    w = world(client)
    _, wait = sell(client, w["f1"], mode="bundle")
    assert client.get(f"/v1/listings/{wait}", headers=H(w["f1"])).status_code == 200
    assert client.get(f"/v1/listings/{wait}", headers=H(w["op"])).status_code == 200
    for who in ("r", "f2", "r2"):
        assert client.get(f"/v1/listings/{wait}", headers=H(w[who])).status_code == 404, who
    assert client.get("/v1/listings", headers=H(w["r"])).json() == []
    assert client.put(f"/v1/favorites/{wait}", headers=H(w["r"])).status_code == 404


# ── 9. 좌표 역산 ──
def test_distances_are_rounded_to_whole_km(client):
    w = world(client)
    bag, lid = sell(client, w["f1"], kg=600)
    sell(client, w["f2"], kg=500)
    items = client.get("/v1/listings", headers=H(w["r"])).json()
    one = client.get(f"/v1/listings/{lid}", headers=H(w["r"])).json()
    assert all(i["distance_km"] == round(i["distance_km"]) for i in items) and one["distance_km"] == round(one["distance_km"])
    assert all(r["distance_km"] == round(r["distance_km"]) for r in client.get("/v1/recyclers", headers=H(w["f1"])).json())
    assert all(b["avg_distance_km"] == round(b["avg_distance_km"]) for b in client.get("/v1/buyer/bundles", headers=H(w["r"])).json())


def test_coordinate_changes_are_limited_per_day(client):
    signup(client, n=1)
    me = bearer(client)
    for i in range(3):
        assert client.patch("/v1/me/profile", headers=me, json={"lat": 36.2 + i / 100, "lon": 128.4}).status_code == 200
    assert client.patch("/v1/me/profile", headers=me, json={"lat": 36.5, "lon": 128.4}).status_code == 429
    assert client.patch("/v1/me/profile", headers=me, json={"address": "다른 주소"}).status_code == 200   # 좌표 외 수정은 영향 없음


# ── 10. 운영 설정 검사 ──
def prod_env(monkeypatch, **over):
    base = {"APP_ENV": "production", "MAIL_MODE": "smtp", "PUBLIC_BASE_URL": "https://masdae.example", "AUTH_ALLOW_COMPANY_HEADER": "0"}
    for k, v in {**base, **over}.items():
        if v is None:
            monkeypatch.delenv(k, raising=False)
        else:
            monkeypatch.setenv(k, v)
    monkeypatch.delenv("AUTO_APPROVE_SIGNUP", raising=False)


def boots():
    with TestClient(app):
        pass


@pytest.mark.parametrize("env", ["production", " Production ", "PROD", "prod\n"])
def test_production_flag_is_normalized(monkeypatch, env):
    prod_env(monkeypatch, APP_ENV=env, AUTH_ALLOW_COMPANY_HEADER="1")
    with pytest.raises(RuntimeError, match="AUTH_ALLOW_COMPANY_HEADER"):
        boots()
    prod_env(monkeypatch, APP_ENV=env, MAIL_MODE="log")
    with pytest.raises(RuntimeError, match="MAIL_MODE"):
        boots()


def test_production_requires_exact_smtp_https_base_and_https_oauth_redirect(monkeypatch):
    prod_env(monkeypatch, MAIL_MODE="console")
    with pytest.raises(RuntimeError, match="MAIL_MODE"):
        boots()
    prod_env(monkeypatch, MAIL_MODE=None)
    with pytest.raises(RuntimeError, match="MAIL_MODE"):
        boots()
    prod_env(monkeypatch, PUBLIC_BASE_URL="http://masdae.example")
    with pytest.raises(RuntimeError, match="PUBLIC_BASE_URL"):
        boots()
    prod_env(monkeypatch, PUBLIC_BASE_URL=None)
    with pytest.raises(RuntimeError, match="PUBLIC_BASE_URL"):
        boots()
    prod_env(monkeypatch, GOOGLE_CLIENT_ID="gid", OAUTH_REDIRECT_BASE="http://masdae.example")
    with pytest.raises(RuntimeError, match="OAUTH_REDIRECT_BASE"):
        boots()
    prod_env(monkeypatch, MAIL_MODE=" SMTP ", GOOGLE_CLIENT_ID="gid", OAUTH_REDIRECT_BASE="https://masdae.example")
    boots()                                                                             # 올바른 운영 설정은 뜬다


# ── 11. 본문 크기 ──
def test_request_body_over_8mb_is_413_by_header_and_by_stream(client):
    big = b"x" * (8 * 1024 * 1024 + 1)
    assert client.post("/v1/auth/login", content=big, headers={"Content-Type": "application/json"}).status_code == 413

    def chunks():
        for _ in range(9):
            yield b"x" * (1024 * 1024)
    assert client.post("/v1/auth/login", content=chunks(), headers={"Content-Type": "application/json"}).status_code == 413   # Content-Length 없이
    ok = client.post("/v1/auth/login", json={"login_id": "a", "password": "b"})
    assert ok.status_code == 401                                                        # 작은 요청은 그대로


# ── 12. 로그인 제한 ──
def other_ip(ip):
    return TestClient(app, client=(ip, 5000))


def test_login_lock_is_per_login_and_ip_so_attacker_cannot_lock_the_victim(client):
    signup(client, n=1)
    attacker = other_ip("203.0.113.9")
    for _ in range(5):
        assert attacker.post("/v1/auth/login", json={"login_id": "user1@example.com", "password": "wrong-password"}).status_code == 401
    assert attacker.post("/v1/auth/login", json={"login_id": "user1@example.com", "password": "wrong-password"}).status_code == 429
    victim = other_ip("198.51.100.7")
    assert victim.post("/v1/auth/login", json={"login_id": "user1@example.com", "password": "Str0ng-pass-1"}).status_code == 200


def test_login_failures_from_one_ip_are_limited_globally(client):
    bot = other_ip("203.0.113.50")
    codes = [bot.post("/v1/auth/login", json={"login_id": f"nobody{i}", "password": "wrong-password"}).status_code for i in range(51)]
    assert codes[:50] == [401] * 50 and codes[50] == 429


# ── 13. 가입 제한 ──
def test_signup_ip_limit_and_biz_no_normalization_and_limiter_cleanup(client):
    a = other_ip("203.0.113.20")
    codes = [a.post("/v1/signup", json=body(n=300 + i, biz_no=f"22{i:08d}")).status_code for i in range(11)]
    assert 429 in codes and codes[-1] == 429 and codes[0] == 201
    b = other_ip("203.0.113.21")
    for n in range(5):                                                                  # 같은 사업자번호를 다른 모양으로 쓰는 우회
        b.post("/v1/signup", json=body(n=400 + n, biz_no=["555-55-55555", "5555555555", "555 55 55555", "555-5555555", "55555-55555"][n]))
    assert b.post("/v1/signup", json=body(n=499, biz_no="5555555555")).status_code == 429


def test_limiter_drops_expired_keys(monkeypatch):
    lim = LoginLimiter()
    t = [1000.0]
    monkeypatch.setattr(time, "monotonic", lambda: t[0])
    for i in range(1500):
        lim.failed(f"key{i}")
    t[0] += LoginLimiter.WINDOW_S + 1
    lim.failed("fresh")
    assert len(lim._fails) < 10                                                          # 한 번도 다시 조회되지 않은 키도 정리됨


# ── 14. 재설정 ──
def test_reset_ip_limit_and_old_tokens_die_after_reset(client, _clean):
    signup(client, n=1)
    old = bearer(client)
    assert client.get("/v1/me", headers=old).status_code == 200
    client.post("/v1/auth/password-reset", json={"email": "user1@example.com"})
    import re
    token = re.search(r"token=([\w-]+)", sorted(_clean.glob("*.txt"))[-1].read_text(encoding="utf-8")).group(1)
    assert client.post("/v1/auth/password-reset/confirm", json={"token": token, "new_password": "Brand-new-pass-9"}).status_code == 200
    assert client.get("/v1/me", headers=old).status_code == 401                         # 재설정 전 로그인 토큰 무효
    new = {"Authorization": "Bearer " + login(client, "user1@example.com", "Brand-new-pass-9").json()["access_token"]}
    assert client.get("/v1/me", headers=new).status_code == 200
    a = other_ip("203.0.113.30")
    codes = [a.post("/v1/auth/password-reset", json={"email": f"nobody{i}@example.com"}).status_code for i in range(12)]
    assert codes[0] == 200 and codes[-1] == 429                                          # 이메일을 바꿔도 같은 IP는 제한


def test_reset_does_same_database_work_for_known_and_unknown_email(client, monkeypatch):
    signup(client, n=1)
    statements = []
    from sqlalchemy import event
    engine = db().get_bind()

    def count(conn, cursor, statement, *a):
        statements.append(statement.split()[0])
    event.listen(engine, "before_cursor_execute", count)
    try:
        client.post("/v1/auth/password-reset", json={"email": "user1@example.com"})
        known = [s for s in statements if s in ("INSERT", "UPDATE")]
        statements.clear()
        client.post("/v1/auth/password-reset", json={"email": "nobody@example.com"})
        unknown = [s for s in statements if s in ("INSERT", "UPDATE")]
    finally:
        event.remove(engine, "before_cursor_execute", count)
    assert sorted(known) == sorted(unknown)                                              # 쓰기 문장 종류·개수가 같다


# ── 15. login_id·social 이메일·사업자번호 ──
def test_at_sign_login_id_must_equal_email_in_every_path(client):
    assert client.post("/v1/companies", json=company_body(login_id="someone@example.com", password="Str0ng-pass-1")).status_code == 400
    ok = client.post("/v1/companies", json=company_body(login_id="plain-id", password="Str0ng-pass-1"))
    assert ok.status_code == 201
    assert signup(client, n=1, login_id="other@example.com").status_code == 400
    assert signup(client, n=2, login_id="user2@example.com").status_code == 201


def test_social_signup_cannot_override_provider_verified_email(client, monkeypatch):
    install_fake(monkeypatch)
    token = oauth_signup_token(client, "kakao", "code-A")
    assert client.post("/v1/signup/social", json={**social_body(email="evil@example.com"), "signup_token": token}).status_code == 400
    ok = client.post("/v1/signup/social", json={**social_body(email="A@Example.com"), "signup_token": token})
    assert ok.status_code == 201 and db().get(Company, ok.json()["id"]).email == "a@example.com"


def test_duplicate_biz_no_is_409_on_new_signup_paths_only(client):
    assert signup(client, n=1, biz_no="123-45-67890").status_code == 201
    assert signup(client, n=2, biz_no="1234567890").status_code == 409
    assert client.post("/v1/signup/factory", json={**{k: v for k, v in body(n=3).items() if k != "role"}, "biz_no": "123 45 67890"}).status_code == 409
    assert client.post("/v1/companies", json=company_body(biz_no="123-45-67890")).status_code == 201     # 기존 경로는 그대로


# ── 16. 사진·qr 접근 ──
def test_bag_photo_access_rules(client):
    w = world(client)
    bag, lid = sell(client, w["f1"], mode="bundle")
    path = f"/v1/bags/{bag}/photo"
    put = client.put(path, headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG})
    assert put.status_code == 200
    assert client.get(path, headers=H(w["f1"])).status_code == 200 and client.get(path, headers=H(w["op"])).status_code == 200
    for who in ("r", "f2", "r2"):
        assert client.get(path, headers=H(w[who])).status_code == 404, who          # bundle_wait 마대는 공개 안 됨
    client.post(f"/v1/listings/{lid}/withdraw", headers=H(w["f1"]))
    bag2, lid2 = sell(client, w["f1"])
    path2 = f"/v1/bags/{bag2}/photo"
    client.put(path2, headers=H(w["f1"]), json={"content_type": "image/png", "data_base64": PNG})
    assert client.get(path2, headers=H(w["r"])).status_code == 200                      # posted 매물의 마대는 공개
    oid = buy(client, w["r"], lid2)["id"]
    assert client.get(path2, headers=H(w["r"])).status_code == 200                      # 주문 당사자
    assert client.get(path2, headers=H(w["r2"])).status_code == 404                     # 팔린 뒤 남에게는 비공개


def test_listing_qr_only_for_owner_seller(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    qr = lambda who: client.get(f"/v1/listings/{lid}", headers=H(w[who])).json()["bags"][0]   # noqa: E731
    assert qr("f1")["qr"].startswith("MDP-") and qr("r")["qr"] is None and qr("r")["pass_id"] is None and qr("f2")["qr"] is None
    buy(client, w["r"], lid)
    # 팔린 뒤에도 QR은 판매 공장(운송 담당)에게만, 구매자에게는 없음
    assert qr("f1")["qr"].startswith("MDP-") and qr("r")["qr"] is None


# ── 17. 분당 제한·페이지 ──
def test_order_messages_and_tickets_are_rate_limited_and_attachments_capped(client):
    import base64
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    codes = [client.post(f"/v1/orders/{oid}/messages", headers=H(w["r"]), json={"body": f"m{i}"}).status_code for i in range(21)]
    assert codes == [201] * 20 + [429]
    assert client.post(f"/v1/orders/{oid}/messages", headers=H(w["f1"]), json={"body": "다른 회사는 영향 없음"}).status_code == 201
    tickets = [client.post("/v1/support/tickets", headers=H(w["f2"]), json={"subject": "s", "body": "b"}).status_code for i in range(11)]
    assert tickets == [201] * 10 + [429]
    tid = client.get("/v1/support/tickets", headers=H(w["f2"])).json()[0]["id"]
    big = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * (1800 * 1024)).decode()
    sizes = [client.post(f"/v1/support/tickets/{tid}/attachments", headers=H(w["f2"]), json={"content_type": "image/png", "data_base64": big}).status_code for _ in range(5)]
    assert sizes[:3] == [201] * 3 and set(sizes[3:]) == {400}                           # 합계 6MB 제한


def test_listing_pagination(client):
    w = world(client)
    ids = [sell(client, w["f1"] if i % 2 else w["f2"])[1] for i in range(5)]
    get = lambda q="": client.get(f"/v1/listings{q}", headers=H(w["r"]))   # noqa: E731
    assert len(get().json()) == 5
    assert [i["id"] for i in get("?limit=2").json()] == ids[:2]
    assert [i["id"] for i in get("?limit=2&offset=4").json()] == ids[4:]
    assert len(get("?limit=1000").json()) == 5 and len(get("?limit=&offset=").json()) == 5
    assert get("?limit=0").status_code == 400 and get("?offset=-1").status_code == 400 and get("?limit=abc").status_code == 400


# ── 18. OAuth CSRF·IP 제한 ──
def test_oauth_callback_requires_the_cookie_from_the_same_browser(client, monkeypatch):
    install_fake(monkeypatch)
    res = client.get("/v1/auth/oauth/kakao/start", params={"role": "factory", "app": "seller"}, follow_redirects=False)
    cookie = res.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    from urllib.parse import parse_qs, urlparse
    state = parse_qs(urlparse(res.headers["location"]).query)["state"][0]
    attacker_state_victim_browser = TestClient(app)                                       # 쿠키 없는 다른 브라우저
    assert attacker_state_victim_browser.get("/v1/auth/oauth/kakao/callback", params={"code": "code-A", "state": state}, follow_redirects=False).status_code == 400
    client.cookies.clear()
    assert callback(client, state).status_code == 400                                     # 쿠키가 없으면 거부(그리고 state는 소비됨)
    state2 = start(client)
    other = TestClient(app)
    other.get("/v1/auth/oauth/kakao/start", params={"app": "seller"}, follow_redirects=False)   # 다른 시작의 쿠키
    client.cookies.clear()
    client.cookies.update(other.cookies)
    assert callback(client, state2).status_code == 400
    state3 = start(client)
    assert callback(client, state3).status_code == 302                                    # 같은 브라우저면 통과


def test_oauth_start_is_ip_limited_and_kakao_email_needs_explicit_verification(client, monkeypatch):
    install_fake(monkeypatch)
    codes = [client.get("/v1/auth/oauth/kakao/start", follow_redirects=False).status_code for _ in range(31)]
    assert codes[0] == 302 and codes[-1] == 429
    from app.features.auth import oauth

    class Resp:
        def __init__(self, d):
            self.d = d

        def raise_for_status(self):
            pass

        def json(self):
            return self.d
    monkeypatch.setenv("KAKAO_CLIENT_ID", "kid")
    monkeypatch.setattr(oauth.httpx, "post", lambda *a, **k: Resp({"access_token": "t"}))
    monkeypatch.setattr(oauth.httpx, "get", lambda *a, **k: Resp({"id": 1, "kakao_account": {"email": "k@example.com"}}))   # is_email_verified 없음
    assert oauth.Kakao().exchange("c", None, "n").email is None


# ── 19. 연락처 가림 강화 ──
@pytest.mark.parametrize("text", [
    "010_1234_5678", "010/1234/5678", "010–1234–5678", "010—1234—5678", "(010)1234-5678", "(010) 1234 5678", "010\n1234\n5678",
    "010\t1234\t5678", "0​1​0​1234 5678", "010ㆍ1234ㆍ5678", "010 - 1234 - 5678", "０１０-１２３４-５６７８",
    "010-12-34567", "031-12-34567", "a＠b.com", "a at b dot com", "a(at)b.com",
    "a[at]b.com", "a (at) b (dot) com", "x.y@z.co.kr"])
def test_masking_hardened_variants(text):
    out, masked = mask_contacts(f"문의 {text} 부탁")
    assert masked and out == "문의 *** 부탁", (text, out)


@pytest.mark.parametrize("text", ["110-123-456789원", "1234567890123kg"])
def test_account_numbers_are_masked_even_with_a_unit(text):
    out, masked = mask_contacts(f"문의 {text} 부탁")
    assert masked and not any(ch.isdigit() for ch in out)


@pytest.mark.parametrize("text", [
    "750kg", "380원/kg", "380원", "2026-11-05", "1,200,000원", "사업자번호 000-00-00001", "사업자번호 123-45-67890", "3500.5kg", "마대 12개 주문 #345"])
def test_masking_still_leaves_ordinary_values(text):
    assert mask_contacts(text) == (text, False)


def test_order_chat_is_not_masked_by_policy(client):
    w = world(client)
    bag, lid = sell(client, w["f1"])
    oid = buy(client, w["r"], lid)["id"]
    sent = client.post(f"/v1/orders/{oid}/messages", headers=H(w["f1"]), json={"body": "도착 전 010-1234-5678 로 전화드려요"})
    assert sent.json()["body"] == "도착 전 010-1234-5678 로 전화드려요"
