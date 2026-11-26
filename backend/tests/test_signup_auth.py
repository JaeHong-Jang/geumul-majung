"""공통 가입·이메일 비밀번호 재설정·카카오/구글 로그인·좌표(ARCHITECTURE §14)와 빈 쿼리 값. OAuth 공급자는 모의한다(키 없음)."""
import base64
import datetime as dt
import logging
import re
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.core.security import geocode_limiter, login_limiter, signup_limiter
from app.db.models import Company, Credential, OAuthTicket, PasswordResetToken, SocialAccount
from app.db.session import get_session
from app.main import app
from app.features.auth import juso, oauth
from tests.conftest import H, mk_company
from tests.test_app_features import db, sell, _close_db_sessions  # noqa: F401  (db 세션 정리 fixture를 이 파일에도 적용)

CODE = "51-03-01"
PW = "Str0ng-pass-1"


@pytest.fixture(autouse=True)
def _clean(monkeypatch, tmp_path):
    signup_limiter.clear()
    geocode_limiter.clear()
    login_limiter.clear()
    monkeypatch.setenv("MAIL_OUTBOX_DIR", str(tmp_path / "outbox"))
    monkeypatch.delenv("AUTO_APPROVE_SIGNUP", raising=False)
    for k in ("KAKAO_CLIENT_ID", "GOOGLE_CLIENT_ID", "JUSO_COORD_KEY", "JUSO_SEARCH_KEY"):
        monkeypatch.delenv(k, raising=False)
    return tmp_path / "outbox"


def body(role="factory", n=1, **kw):
    b = {"role": role, "email": f"user{n}@example.com", "password": PW, "name": f"가상{role}{n}", "biz_no": f"111-11-{n:05d}",
         "address": "경북 구미시 가상로 1", "phone": "010-1111-2222", "industry": "사출"}
    if role == "recycler":
        b.update(permit_no="가상-허가", permit_codes=[CODE])
    return {**b, **kw}


def signup(client, **kw):
    return client.post("/v1/signup", json=body(**kw))


def login(client, who, pw=PW):
    return client.post("/v1/auth/login", json={"login_id": who, "password": pw})


def bearer(client, who="user1@example.com"):
    return {"Authorization": "Bearer " + login(client, who).json()["access_token"]}


# ── 14.1 가입 ──
def test_two_roles_start_unverified_and_cannot_trade(client):
    f = signup(client, role="factory", n=1)
    assert f.status_code == 201 and f.json()["status"] == "pending"
    r = signup(client, role="recycler", n=2)
    assert r.status_code == 201
    for who in ("user1@example.com", "user2@example.com"):
        assert client.get("/v1/me", headers=bearer(client, who)).json()["verified"] is False
    fh = bearer(client, "user1@example.com")
    assert client.post("/v1/bags", headers=fh, json={"waste_code": CODE, "target_material": "pp", "items": [{"material": "pp", "kg": 10}]}).status_code == 403
    assert client.post("/v1/listings", headers=fh, json={"bag_ids": [1], "mode": "now", "price_krw_per_kg": 100}).status_code == 403
    seller = mk_company(client, "승인공장", "factory")
    _, lid = sell(client, seller)
    assert client.post("/v1/orders", headers=bearer(client, "user2@example.com"), json={"listing_id": lid}).status_code == 403
    assert client.get("/v1/me/approval", headers=bearer(client, "user2@example.com")).json() == {"status": "pending", "note": None, "missing": []}


def test_signup_validation(client):
    assert signup(client, role="operator").status_code == 400
    assert client.post("/v1/signup", json={k: v for k, v in body().items() if k != "role"}).status_code == 400   # role 필요
    assert signup(client, role="recycler", permit_codes=[]).status_code == 400
    assert signup(client, role="hauler", permit_no="가상-허가", permit_codes=[CODE]).status_code == 400   # 운송기사 역할은 없어짐
    assert signup(client, lat=36.1).status_code == 400
    assert signup(client, email="not-an-email").status_code == 400
    assert signup(client, password="short").status_code == 400
    assert signup(client, address="어딘가", region=None).status_code == 400              # 지역을 찾지 못함
    assert signup(client, region="없는지역").status_code == 400
    assert signup(client, login_id="other@example.com").status_code == 400             # 남의 이메일 모양 아이디 선점 금지
    assert db().query(Company).filter(Company.role != "operator").count() == 0


def test_email_unique_login_by_id_or_email_and_case(client):
    assert signup(client, n=1, login_id="Seller_One").status_code == 201
    assert signup(client, n=2, email="USER1@example.com").status_code == 409            # 대소문자 달라도 같은 이메일
    assert signup(client, n=3, login_id="seller_one", email="x3@example.com").status_code == 409   # 아이디 중복
    for who in ("seller_one", "  SELLER_ONE ", "user1@example.com", " User1@Example.com "):
        assert login(client, who).status_code == 200, who
    assert signup(client, n=4, email="four@example.com").status_code == 201             # login_id 없으면 이메일이 아이디
    assert login(client, "four@example.com").status_code == 200
    assert login(client, "four@example.com", "wrong-password").status_code == 401


def test_coordinates_source_and_region_center(client):
    signup(client, n=1)
    signup(client, n=2, lat=36.5, lon=128.5)
    p1 = client.get("/v1/me/profile", headers=bearer(client, "user1@example.com")).json()
    p2 = client.get("/v1/me/profile", headers=bearer(client, "user2@example.com")).json()
    assert (p1["coord_source"], p1["region"], p1["lat"], p1["lon"]) == ("region", "경북 구미", 36.12, 128.34)
    assert (p2["coord_source"], p2["lat"], p2["lon"]) == ("user", 36.5, 128.5)


def test_signup_closed_without_allow_and_auto_approve(client, monkeypatch):
    monkeypatch.delenv("ALLOW_SIGNUP")
    assert signup(client).status_code == 403
    monkeypatch.setenv("ALLOW_SIGNUP", "1")
    monkeypatch.setenv("AUTO_APPROVE_SIGNUP", "1")
    res = signup(client, role="recycler")
    assert res.status_code == 201 and res.json()["status"] == "approved"
    assert client.get("/v1/me", headers=bearer(client)).json()["verified"] is True


def test_signup_factory_route_is_factory_only(client):
    b = body(role="factory")
    assert client.post("/v1/signup/factory", json={k: v for k, v in b.items() if k != "role"}).json()["status"] == "pending"
    assert client.post("/v1/signup/factory", json={**body(n=2), "role": "recycler"}).status_code == 400
    assert db().query(Company).filter_by(email="user1@example.com").one().role == "factory"


def test_signup_attempts_are_limited_per_biz_no_and_separate_from_login(client):
    for i in range(5):
        assert signup(client, n=100 + i, biz_no="777-77-77777").status_code in (201, 409)
    assert signup(client, n=200, biz_no="777-77-77777").status_code == 429
    assert signup(client, n=201, biz_no="888-88-88888").status_code == 201           # 다른 사업자번호는 영향 없음
    signup(client, n=300)
    for _ in range(5):
        assert login(client, "user300@example.com", "wrong-password").status_code == 401
    assert login(client, "user300@example.com").status_code == 429                 # 로그인 실패는 로그인 제한에만
    assert signup(client, n=301).status_code == 201                                  # 가입 제한과 키가 섞이지 않음


def test_production_refuses_auto_approve_and_log_mail(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("AUTH_ALLOW_COMPANY_HEADER", raising=False)
    monkeypatch.setenv("MAIL_MODE", "smtp")
    monkeypatch.setenv("AUTO_APPROVE_SIGNUP", "1")
    with pytest.raises(RuntimeError, match="AUTO_APPROVE_SIGNUP"):
        with TestClient(app):
            pass
    monkeypatch.delenv("AUTO_APPROVE_SIGNUP")
    monkeypatch.setenv("MAIL_MODE", "log")
    with pytest.raises(RuntimeError, match="MAIL_MODE"):
        with TestClient(app):
            pass


# ── 14.3 비밀번호 재설정 ──
def token_from_outbox(outbox):
    files = sorted(outbox.glob("*.txt"))
    return re.search(r"token=([\w-]+)", files[-1].read_text(encoding="utf-8")).group(1), files[-1].read_text(encoding="utf-8")


def reset(client, email="user1@example.com"):
    return client.post("/v1/auth/password-reset", json={"email": email})


def test_reset_full_flow_single_use_and_old_token_invalidated(client, _clean, caplog):
    signup(client, n=1, role="recycler")
    with caplog.at_level(logging.DEBUG):
        assert reset(client).json() == {"ok": True}
    first, mail = token_from_outbox(_clean)
    assert "/buyer/#/reset?token=" in mail and "To: user1@example.com" in mail
    assert first not in caplog.text                                                  # 로그에 토큰을 남기지 않음
    assert db().query(PasswordResetToken).one().token_hash != first and len(first) >= 43   # 해시만 저장, 32바이트 이상
    reset(client)
    second, _ = token_from_outbox(_clean)
    assert second != first
    new_pw = "Brand-new-pass-9"
    assert client.post("/v1/auth/password-reset/confirm", json={"token": first, "new_password": new_pw}).status_code == 400   # 새 토큰이 이전 것을 무효로
    assert client.post("/v1/auth/password-reset/confirm", json={"token": second, "new_password": "short"}).status_code == 400
    for _ in range(5):
        login(client, "user1@example.com", "wrong-password")
    assert login(client, "user1@example.com").status_code == 429
    assert client.post("/v1/auth/password-reset/confirm", json={"token": second, "new_password": new_pw}).json() == {"ok": True}
    assert login(client, "user1@example.com", new_pw).status_code == 200            # 실패 횟수 초기화 + 새 비밀번호
    assert login(client, "user1@example.com", PW).status_code == 401
    assert client.post("/v1/auth/password-reset/confirm", json={"token": second, "new_password": "Another-pass-9"}).status_code == 400   # 재사용
    assert client.post("/v1/auth/password-reset/confirm", json={"token": "x" * 43, "new_password": new_pw}).status_code == 400


def test_reset_expired_token_rejected(client, _clean):
    signup(client, n=1)
    reset(client)
    token, _ = token_from_outbox(_clean)
    s = db()
    s.query(PasswordResetToken).one().expires_at = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)
    s.commit()
    assert client.post("/v1/auth/password-reset/confirm", json={"token": token, "new_password": "Brand-new-pass-9"}).status_code == 400
    assert login(client, "user1@example.com").status_code == 200                     # 비밀번호는 그대로


def test_reset_does_not_reveal_whether_account_exists(client, _clean):
    signup(client, n=1)
    known, unknown = reset(client, "user1@example.com"), reset(client, "nobody@example.com")
    assert (known.status_code, known.json(), known.headers["content-type"]) == (unknown.status_code, unknown.json(), unknown.headers["content-type"])
    assert len(list(_clean.glob("*.txt"))) == 1                                       # 있는 계정에만 메일
    assert reset(client, "bad").status_code == 400                                    # 형식 오류는 계정과 무관하게 같은 400


def test_reset_attempts_limited(client):
    codes = [reset(client, "nobody@example.com").status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]
    assert reset(client, "other@example.com").status_code == 200


def test_social_only_account_can_set_password_by_email_reset(client, _clean, monkeypatch):
    install_fake(monkeypatch)
    ticket = oauth_signup_token(client, "kakao", "code-A")
    res = client.post("/v1/signup/social", json={**social_body(), "signup_token": ticket})
    assert res.status_code == 201
    assert login(client, "a@example.com").status_code == 401                         # 비밀번호가 없는 계정
    reset(client, "a@example.com")
    token, _ = token_from_outbox(_clean)
    assert client.post("/v1/auth/password-reset/confirm", json={"token": token, "new_password": "Brand-new-pass-9"}).status_code == 200
    assert login(client, "a@example.com", "Brand-new-pass-9").status_code == 200


# ── 14.4 OAuth (공급자 모의) ──
class FakeProvider:
    def __init__(self, name, identities, fail=False):
        self.name, self.identities, self.fail = name, identities, fail
        self.seen = []

    def configured(self):
        return True

    def authorize_url(self, state, nonce, challenge):
        return f"https://fake.example/{self.name}/auth?" + f"state={state}&nonce={nonce}"

    def exchange(self, code, verifier, nonce):
        self.seen.append((code, verifier, nonce))
        if self.fail:
            raise RuntimeError("공급자 오류")
        return self.identities[code]


def install_fake(monkeypatch, fail=False):
    ident = {"code-A": oauth.Identity("kakao-subject-A", "a@example.com", "에이"),
             "code-NOMAIL": oauth.Identity("kakao-subject-N", None, "엔"),
             "code-TAKEN": oauth.Identity("kakao-subject-T", "user1@example.com", "탈취시도")}
    fakes = {"kakao": FakeProvider("kakao", ident, fail), "google": FakeProvider("google", {"code-A": oauth.Identity("g-1", "g@example.com", "지")})}
    monkeypatch.setattr(oauth, "PROVIDERS", fakes)
    return fakes


def start(client, provider="kakao", **q):
    res = client.get(f"/v1/auth/oauth/{provider}/start", params={"role": "factory", "app": "seller", **q}, follow_redirects=False)
    assert res.status_code == 302, res.text
    return parse_qs(urlparse(res.headers["location"]).query)["state"][0]


def callback(client, state, code="code-A", provider="kakao"):
    return client.get(f"/v1/auth/oauth/{provider}/callback", params={"code": code, "state": state}, follow_redirects=False)


def fragment(res):
    assert res.status_code == 302
    loc = urlparse(res.headers["location"])
    return loc.path, {k: v[0] for k, v in parse_qs(loc.fragment.split("?", 1)[1]).items()}, loc


def oauth_signup_token(client, provider, code):
    return fragment(callback(client, start(client, provider), code, provider))[1]["signup_token"]


def social_body(**kw):
    b = body(role="factory", n=9)
    for k in ("password", "email"):
        b.pop(k)
    return {**b, **kw}


def test_providers_list_follows_env(client, monkeypatch):
    assert client.get("/v1/auth/providers").json() == []
    monkeypatch.setenv("KAKAO_CLIENT_ID", "k")
    assert client.get("/v1/auth/providers").json() == ["kakao"]
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "g")
    assert client.get("/v1/auth/providers").json() == ["kakao", "google"]
    assert client.get("/v1/auth/oauth/naver/start", follow_redirects=False).status_code == 404


def test_unconfigured_provider_is_404(client):
    assert client.get("/v1/auth/oauth/kakao/start", follow_redirects=False).status_code == 404
    assert client.get("/v1/auth/oauth/kakao/callback", params={"code": "c", "state": "s"}, follow_redirects=False).status_code == 404


def test_new_user_gets_signup_token_in_fragment_then_social_signup_and_relogin(client, monkeypatch):
    fakes = install_fake(monkeypatch)
    state = start(client)
    res = callback(client, state)
    path, frag, loc = fragment(res)
    assert path == "/seller/" and loc.query == "" and res.headers["cache-control"] == "no-store"   # 토큰은 # 조각에만
    assert frag["email"] == "a@example.com" and frag["role"] == "factory" and "access_token" not in frag
    assert fakes["kakao"].seen[0][2]                                                    # nonce 전달
    assert callback(client, state).status_code == 400                                   # state 재사용 거부
    done = client.post("/v1/signup/social", json={**social_body(), "signup_token": frag["signup_token"]})
    assert done.status_code == 201 and done.json()["status"] == "pending" and done.json()["company"]["role"] == "factory"
    me = client.get("/v1/me", headers={"Authorization": "Bearer " + done.json()["access_token"]}).json()
    assert me["id"] == done.json()["id"] and me["verified"] is False
    assert db().query(Company).get(me["id"]).email == "a@example.com"
    assert client.post("/v1/signup/social", json={**social_body(n=10), "signup_token": frag["signup_token"]}).status_code == 400   # signup_token 재사용
    # 같은 공급자 계정으로 다시 로그인 → 앱용 access_token
    _, again, _ = fragment(callback(client, start(client)))
    assert "signup_token" not in again
    assert client.get("/v1/me", headers={"Authorization": "Bearer " + again["access_token"]}).json()["id"] == me["id"]
    assert db().query(SocialAccount).count() == 1


def test_state_forgery_expiry_and_provider_mismatch_rejected(client, monkeypatch):
    install_fake(monkeypatch)
    assert callback(client, "forged-state-value").status_code == 400
    assert client.get("/v1/auth/oauth/kakao/callback", params={"code": "code-A"}, follow_redirects=False).status_code == 400
    state = start(client)
    assert callback(client, state, provider="google").status_code == 400                 # 다른 공급자에 쓰는 state
    assert callback(client, state).status_code == 400                                    # 위에서 소비됨
    state = start(client)
    s = db()
    s.query(OAuthTicket).filter_by(kind="state", used=False).one().expires_at = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=1)
    s.commit()
    assert callback(client, state).status_code == 400                                    # 만료
    state = start(client)
    res = client.get("/v1/auth/oauth/kakao/callback", params={"error": "access_denied", "state": state}, follow_redirects=False)
    assert res.status_code == 400
    assert db().query(SocialAccount).count() == 0


def test_provider_failure_is_502_and_state_is_spent(client, monkeypatch):
    install_fake(monkeypatch, fail=True)
    state = start(client)
    assert callback(client, state).status_code == 502
    assert callback(client, state).status_code == 400


def test_same_email_is_not_auto_merged_with_existing_company(client, monkeypatch):
    install_fake(monkeypatch)
    signup(client, n=1)                                                               # user1@example.com
    token = oauth_signup_token(client, "kakao", "code-TAKEN")                          # 공급자 이메일이 기존 회사와 같음
    assert db().query(SocialAccount).count() == 0                                      # 자동 연결 없음
    res = client.post("/v1/signup/social", json={**social_body(), "signup_token": token})
    assert res.status_code == 409                                                      # 새 회사로 가입도 막힘
    assert db().query(SocialAccount).count() == 0 and db().query(Company).count() == 1
    again = client.post("/v1/signup/social", json={**social_body(email="fresh@example.com"), "signup_token": token})
    assert again.status_code == 400                                                    # 공급자가 인증한 이메일은 본문으로 바꿀 수 없음(§17)


def test_missing_provider_email_is_asked_at_signup(client, monkeypatch):
    install_fake(monkeypatch)
    token = oauth_signup_token(client, "kakao", "code-NOMAIL")
    assert client.post("/v1/signup/social", json={**social_body(), "signup_token": token}).status_code == 400
    ok = client.post("/v1/signup/social", json={**social_body(email="Typed@Example.com"), "signup_token": token})
    assert ok.status_code == 201
    assert db().query(Company).get(ok.json()["id"]).email == "typed@example.com"


def test_social_signup_rules_match_normal_signup(client, monkeypatch):
    install_fake(monkeypatch)
    token = oauth_signup_token(client, "kakao", "code-A")
    assert client.post("/v1/signup/social", json={**social_body(role="recycler"), "signup_token": token}).status_code == 400   # 허가 필요
    assert client.post("/v1/signup/social", json={**social_body(), "role": "operator", "signup_token": token}).status_code == 400
    assert client.post("/v1/signup/social", json={**social_body(), "role": "hauler", "permit_no": "P", "permit_codes": [CODE], "signup_token": token}).status_code == 400
    assert client.post("/v1/signup/social", json={**social_body(), "signup_token": "bogus-token-value"}).status_code == 400
    ok = client.post("/v1/signup/social", json={**social_body(role="recycler", permit_no="P", permit_codes=[CODE]), "signup_token": token})
    assert ok.status_code == 201 and ok.json()["company"]["role"] == "recycler"


def test_real_providers_build_authorize_urls_with_state_and_pkce(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "gid")
    monkeypatch.setenv("KAKAO_CLIENT_ID", "kid")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE", "https://example.test")
    g = client.get("/v1/auth/oauth/google/start", params={"app": "buyer"}, follow_redirects=False)
    url = urlparse(g.headers["location"])
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert url.netloc == "accounts.google.com" and q["code_challenge_method"] == "S256" and q["code_challenge"] and q["nonce"] and q["state"]
    assert q["redirect_uri"] == "https://example.test/v1/auth/oauth/google/callback" and "openid" in q["scope"]
    k = parse_qs(urlparse(client.get("/v1/auth/oauth/kakao/start", follow_redirects=False).headers["location"]).query)
    assert k["client_id"] == ["kid"] and k["state"][0] != q["state"]
    row = db().query(OAuthTicket).filter_by(kind="state").first()
    assert row.token_hash != q["state"] and row.data["verifier"]                    # state는 해시로만 저장


@pytest.fixture(scope="module")
def keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key, key.public_key()


def make_id_token(key, **over):
    now = dt.datetime.now(dt.timezone.utc)
    claims = {"iss": "https://accounts.google.com", "aud": "gid", "sub": "g-sub-1", "iat": now, "exp": now + dt.timedelta(minutes=5),
              "nonce": "n1", "email": "g@example.com", "email_verified": True, "name": "지", **over}
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, key, algorithm="RS256")


def test_google_id_token_verification(keypair):
    key, pub = keypair
    verify = lambda t, **kw: oauth.verify_google_id_token(t, kw.get("aud", "gid"), kw.get("nonce", "n1"), signing_key=pub)   # noqa: E731
    assert verify(make_id_token(key))["sub"] == "g-sub-1"
    assert verify(make_id_token(key, iss="accounts.google.com"))["sub"] == "g-sub-1"
    for bad in (make_id_token(key, aud="other"), make_id_token(key, iss="https://evil.example"),
                make_id_token(key, exp=dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)),
                make_id_token(key, nonce="other"), make_id_token(key, nonce=None),
                make_id_token(rsa.generate_private_key(public_exponent=65537, key_size=2048)),   # 다른 키로 서명
                jwt.encode({"iss": "https://accounts.google.com", "aud": "gid", "sub": "x", "iat": 1, "exp": 4102444800, "nonce": "n1"}, "secret", algorithm="HS256")):
        with pytest.raises(jwt.InvalidTokenError):
            verify(bad)


def test_google_exchange_uses_verified_id_token_and_kakao_parses_profile(monkeypatch, keypair):
    key, pub = keypair
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "gid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    orig = oauth.verify_google_id_token
    monkeypatch.setattr(oauth, "verify_google_id_token", lambda t, c, n: orig(t, c, n, signing_key=pub))
    sent = {}

    class Resp:
        def __init__(self, data):
            self.data = data

        def raise_for_status(self):
            pass

        def json(self):
            return self.data

    def fake_post(url, data=None, **kw):
        sent.update(url=url, data=data)
        return Resp({"id_token": make_id_token(key), "access_token": "at"} if "google" in url else {"access_token": "kat"})

    monkeypatch.setattr(oauth.httpx, "post", fake_post)
    ident = oauth.PROVIDERS["google"].exchange("the-code", "the-verifier", "n1")
    assert (ident.subject, ident.email, ident.name) == ("g-sub-1", "g@example.com", "지")
    assert sent["data"]["code_verifier"] == "the-verifier" and sent["data"]["code"] == "the-code"
    with pytest.raises(jwt.InvalidTokenError):
        oauth.PROVIDERS["google"].exchange("c", "v", "wrong-nonce")
    monkeypatch.setenv("KAKAO_CLIENT_ID", "kid")
    monkeypatch.setattr(oauth.httpx, "get", lambda url, **kw: Resp({"id": 12345, "kakao_account": {"email": "k@example.com", "is_email_verified": True, "profile": {"nickname": "카"}}}))
    k = oauth.PROVIDERS["kakao"].exchange("c", None, "n")
    assert (k.subject, k.email, k.name) == ("12345", "k@example.com", "카")
    monkeypatch.setattr(oauth.httpx, "get", lambda url, **kw: Resp({"id": 1, "kakao_account": {"email": "x@example.com", "is_email_verified": False}}))
    assert oauth.PROVIDERS["kakao"].exchange("c", None, "n").email is None            # 인증 안 된 이메일은 믿지 않음


# ── 14.5 좌표 ──
def test_utmk_conversion_round_trip_and_origin():
    assert juso.wgs84_to_utmk(38.0, 127.5) == (1_000_000.0, 2_000_000.0)             # EPSG:5179 원점
    for lat, lon in ((37.5665, 126.9780), (36.12, 128.34), (33.5, 126.53), (35.18, 129.08)):
        back = juso.utmk_to_wgs84(*juso.wgs84_to_utmk(lat, lon))
        assert back == pytest.approx((lat, lon), abs=1e-7)


def test_geocode_without_key_returns_nulls_and_needs_no_login(client):
    assert client.post("/v1/geocode", json={"road_address": "경북 구미시 가상로 1"}).json() == {"lat": None, "lon": None, "source": None, "region": None}
    assert client.post("/v1/geocode", json={"road_address": ""}).status_code == 400


class Resp:
    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self.data


def fake_juso(monkeypatch, entx, enty, calls=None):
    def get(url, params=None, **kw):
        if calls is not None:
            calls.append((url, params))
        if url == juso.LINK_URL:
            return Resp({"results": {"common": {"errorCode": "0"}, "juso": [{"admCd": "4719010100", "rnMgtSn": "471903000001", "udrtYn": "0", "buldMnnm": 1, "buldSlno": 0}]}})
        return Resp({"results": {"common": {"errorCode": "0"}, "juso": [{"entX": str(entx), "entY": str(enty)}]}})

    monkeypatch.setattr(juso.httpx, "get", get)


def test_geocode_with_key_converts_coordinate_system(client, monkeypatch):
    monkeypatch.setenv("JUSO_COORD_KEY", "test-key")
    monkeypatch.setenv("JUSO_SEARCH_KEY", "test-search-key")
    x, y = juso.wgs84_to_utmk(36.1196, 128.3446)
    calls = []
    fake_juso(monkeypatch, x, y, calls)
    got = client.post("/v1/geocode", json={"road_address": "경북 구미시 가상로 1"}).json()
    assert got["source"] == "juso" and got["lat"] == pytest.approx(36.1196, abs=1e-5) and got["lon"] == pytest.approx(128.3446, abs=1e-5)
    assert calls[0][1]["keyword"] == "경북 구미시 가상로 1" and calls[1][1]["admCd"] == "4719010100"


def test_geocode_failure_or_implausible_value_gives_nulls(client, monkeypatch, caplog):
    monkeypatch.setenv("JUSO_COORD_KEY", "test-key")
    monkeypatch.setenv("JUSO_SEARCH_KEY", "test-search-key")
    nulls = {"lat": None, "lon": None, "source": None, "region": None}
    fake_juso(monkeypatch, 10, 10)                                                        # 한반도 밖으로 변환되는 값(좌표계 가정이 틀린 경우)
    assert client.post("/v1/geocode", json={"road_address": "x"}).json() == nulls

    def boom(*a, **k):
        raise RuntimeError("네트워크 오류")

    monkeypatch.setattr(juso.httpx, "get", boom)
    with caplog.at_level(logging.ERROR):
        assert client.post("/v1/geocode", json={"road_address": "x"}).json() == nulls
    assert "좌표제공 API 호출 실패" in caplog.text                                         # 예외를 숨기지 않고 로그


def test_geocode_attempts_are_limited(client):
    codes = [client.post("/v1/geocode", json={"road_address": "x"}).status_code for _ in range(31)]
    assert codes == [200] * 30 + [429]
    other = mk_company(client, "공장", "factory")
    assert client.post("/v1/geocode", json={"road_address": "x"}, headers=H(other)).status_code == 200   # 로그인하면 회사별로 센다


def test_profile_lat_lon_marks_user_source(client):
    signup(client, n=1)
    h = bearer(client)
    assert client.patch("/v1/me/profile", headers=h, json={"lat": 36.2}).status_code == 400
    got = client.patch("/v1/me/profile", headers=h, json={"lat": 36.2, "lon": 128.4}).json()
    assert (got["lat"], got["lon"], got["coord_source"]) == (36.2, 128.4, "user")
    assert client.patch("/v1/me/profile", headers=h, json={"lat": 99, "lon": 128.4}).status_code == 400
    sid = mk_company(client, "직접", "factory")
    assert client.get("/v1/me/profile", headers=H(sid)).json()["coord_source"] == "user"


def test_seed_marks_coord_source_seed(client):
    from sqlalchemy.orm import sessionmaker
    from seed import gumi_demo
    Session = sessionmaker(bind=next(app.dependency_overrides[get_session]()).get_bind(), expire_on_commit=False)
    gumi_demo.SessionLocal, gumi_demo.engine = Session, Session.kw["bind"]
    ids = gumi_demo.seed()
    assert client.get("/v1/me/profile", headers=H(ids["가상사출A"])).json()["coord_source"] == "seed"
    assert db().query(Company).filter_by(role="recycler").count() >= 2


# ── 빈 쿼리 값 ──
def test_empty_query_values_are_treated_as_absent(client):
    f = mk_company(client, "공장", "factory", lat=36.1, lon=128.4)
    r = mk_company(client, "구매", "recycler", permit_no="R", permit_codes=[CODE])
    sell(client, f)
    plain = client.get("/v1/listings", headers=H(r)).json()
    assert plain
    for q in ("q=&grade=&sort=distance", "q=&grade=&sort=", "waste_code=&q=&grade=&sort=&", "grade=A&sort="):
        res = client.get(f"/v1/listings?{q}", headers=H(r))
        assert res.status_code == 200, q
        assert [i["id"] for i in res.json()] == [i["id"] for i in plain]
    assert client.get("/v1/listings?grade=Z", headers=H(r)).status_code == 400            # 값이 있는데 틀리면 여전히 400
    assert client.get("/v1/listings?sort=bogus", headers=H(r)).status_code == 400
    assert client.get("/v1/market/prices?category=", headers=H(r)).json() == client.get("/v1/market/prices", headers=H(r)).json()
    assert client.get("/v1/pools?mine=", headers=H(f)).status_code == 200


def test_juso_real_sample_response_lands_on_the_right_place():
    """테스트 키 TESTJUSOGOKR의 실제 응답(상암동 한국지역정보개발원)이 상암동에 놓인다."""
    from app.features.auth.juso import in_korea, utmk_to_wgs84
    lat, lon = utmk_to_wgs84(945959.0381341814, 1953851.7348996028)
    assert in_korea(lat, lon)
    assert 37.57 <= lat <= 37.59 and 126.87 <= lon <= 126.91


# ── 좌표제공 키와 검색 키는 별개: 위젯 코드로 검색 없이 동작 (§14.5) ──
CODES = {"adm_cd": "1165010200", "rn_mgt_sn": "116504163008", "udrt_yn": "0", "buld_mnnm": "6", "buld_slno": "0"}


def juso_calls(monkeypatch, entx, enty, errcode="0"):
    calls = []

    def get(url, params=None, **kw):
        calls.append((url, dict(params)))
        if url == juso.LINK_URL:
            return Resp({"results": {"common": {"errorCode": "0"}, "juso": [{"admCd": "1165010200", "rnMgtSn": "116504163008", "udrtYn": "0",
                                                                           "buldMnnm": "6", "buldSlno": "0", "siNm": "서울특별시", "sggNm": "서초구"}]}})
        return Resp({"results": {"common": {"errorCode": errcode}, "juso": [{"entX": str(entx), "entY": str(enty)}] if errcode == "0" else []}})
    monkeypatch.setattr(juso.httpx, "get", get)
    return calls


def test_geocode_with_widget_codes_skips_the_search_api(client, monkeypatch):
    monkeypatch.setenv("JUSO_COORD_KEY", "fake-coord-key")                    # 검색 키는 없다
    x, y = juso.wgs84_to_utmk(37.469346, 127.040002)
    calls = juso_calls(monkeypatch, x, y)
    got = client.post("/v1/geocode", json={"road_address": "서울 서초구 양재동 6", **CODES}).json()
    assert got["source"] == "juso" and got["lat"] == pytest.approx(37.469346, abs=1e-5) and got["lon"] == pytest.approx(127.040002, abs=1e-5)
    assert [c[0] for c in calls] == [juso.COORD_URL]                           # 검색 API는 부르지 않음
    assert calls[0][1]["confmKey"] == "fake-coord-key" and calls[0][1]["admCd"] == "1165010200" and calls[0][1]["rnMgtSn"] == "116504163008"
    assert got["region"] == "서울"                                            # 입력 주소에서 가입 지역 목록과 대조
    num = {**CODES, "adm_cd": 1165010200, "rn_mgt_sn": 116504163008, "udrt_yn": 0, "buld_mnnm": 6, "buld_slno": 0}   # 숫자로 와도 된다
    assert client.post("/v1/geocode", json={"road_address": "서울 서초구 양재동 6", **num}).json()["source"] == "juso"


def test_geocode_region_comes_from_the_input_address(client, monkeypatch):
    monkeypatch.setenv("JUSO_COORD_KEY", "fake-coord-key")
    x, y = juso.wgs84_to_utmk(36.1196, 128.3446)
    juso_calls(monkeypatch, x, y)
    assert client.post("/v1/geocode", json={"road_address": "경북 구미시 송정동 1", **CODES}).json()["region"] == "경북 구미"


def test_geocode_without_codes_and_search_key_is_null_and_calls_nothing(client, monkeypatch):
    monkeypatch.setenv("JUSO_COORD_KEY", "fake-coord-key")
    calls = juso_calls(monkeypatch, 1, 1)
    assert client.post("/v1/geocode", json={"road_address": "경북 구미시 송정동 1"}).json() == {"lat": None, "lon": None, "source": None, "region": None}
    assert calls == []
    monkeypatch.setenv("JUSO_SEARCH_KEY", "fake-search-key")                   # 검색 키가 있으면 검색 뒤 좌표
    x, y = juso.wgs84_to_utmk(36.1196, 128.3446)
    calls = juso_calls(monkeypatch, x, y)
    assert client.post("/v1/geocode", json={"road_address": "경북 구미시 송정동 1"}).json()["source"] == "juso"
    assert [c[0] for c in calls] == [juso.LINK_URL, juso.COORD_URL] and calls[0][1]["confmKey"] == "fake-search-key" and calls[1][1]["confmKey"] == "fake-coord-key"


@pytest.mark.parametrize("bad", [{"adm_cd": "12345"}, {"rn_mgt_sn": "abc"}, {"udrt_yn": "2"}, {"buld_mnnm": "x1"}, {"buld_slno": ""},
                                 {"adm_cd": ["1165010200"]}, {"adm_cd": True}, {"buld_mnnm": "123456"}])
def test_malformed_codes_are_ignored_not_rejected(client, monkeypatch, bad):
    monkeypatch.setenv("JUSO_COORD_KEY", "fake-coord-key")
    calls = juso_calls(monkeypatch, 1, 1)
    res = client.post("/v1/geocode", json={"road_address": "경북 구미시 송정동 1", **CODES, **bad})
    assert res.status_code == 200 and res.json()["source"] is None and calls == []      # 400이 아니고, 코드를 무시해 검색(키 없음)으로 넘어가 null


def test_geocode_api_error_code_is_a_failure_and_logs_hide_the_key(client, monkeypatch, caplog):
    monkeypatch.setenv("JUSO_COORD_KEY", "SECRET-COORD-KEY-123")
    juso_calls(monkeypatch, 1, 1, errcode="E0005")
    with caplog.at_level(logging.DEBUG):
        got = client.post("/v1/geocode", json={"road_address": "서울 서초구 양재동 6", **CODES}).json()
    assert got == {"lat": None, "lon": None, "source": None, "region": None}
    assert "좌표제공 API 호출 실패" in caplog.text and "E0005" in caplog.text and "SECRET-COORD-KEY-123" not in caplog.text


def test_geocode_http_exception_log_never_contains_the_key(client, monkeypatch, caplog):
    import httpx
    monkeypatch.setenv("JUSO_COORD_KEY", "SECRET-COORD-KEY-123")

    def boom(url, params=None, **kw):
        raise httpx.ConnectError(f"연결 실패: {url}?confmKey=SECRET-COORD-KEY-123&admCd=1")   # httpx는 예외 메시지에 URL을 넣기도 한다
    monkeypatch.setattr(juso.httpx, "get", boom)
    with caplog.at_level(logging.DEBUG):
        assert client.post("/v1/geocode", json={"road_address": "서울 서초구 양재동 6", **CODES}).json()["source"] is None
    assert "좌표제공 API 호출 실패" in caplog.text and "ConnectError" in caplog.text
    assert "SECRET-COORD-KEY-123" not in caplog.text and not any(r.exc_info for r in caplog.records)   # 트레이스백에도 남기지 않음


def test_geocode_is_still_rate_limited_with_codes(client, monkeypatch):
    monkeypatch.setenv("JUSO_COORD_KEY", "fake-coord-key")
    juso_calls(monkeypatch, 1, 1)
    codes = [client.post("/v1/geocode", json={"road_address": "x", **CODES}).status_code for _ in range(31)]
    assert codes[:30] == [200] * 30 and codes[30] == 429
