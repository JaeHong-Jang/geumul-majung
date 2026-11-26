"""로그인과 요청 인증(ARCHITECTURE §10). 별도 표시가 없으면 배포와 같은 설정(X-Company-Id 꺼짐)으로 검사한다."""
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.security import create_token, hash_password, jwt_secret, verify_password
from app.db.models import Company, Credential
from app.db.session import get_session
from app.main import app
from seed import gumi_demo
from tests.conftest import OP_TOKEN

PASSWORD = "correct-horse-1"
CODE = "51-03-01"


@pytest.fixture
def prod(client, monkeypatch):
    monkeypatch.delenv("AUTH_ALLOW_COMPANY_HEADER", raising=False)
    return client


def signup(client, login_id="acme", role="factory", password=PASSWORD, **kw):
    body = {"name": f"{login_id} 회사", "role": role, "biz_no": "000-00-00000", "lat": 36.1, "lon": 128.4,
            "login_id": login_id, "password": password, **kw}
    headers = {"X-Operator-Token": OP_TOKEN} if role == "operator" else {}
    return client.post("/v1/companies", json=body, headers=headers)


def login(client, login_id="acme", password=PASSWORD):
    return client.post("/v1/auth/login", json={"login_id": login_id, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def rows(model):
    sessions = app.dependency_overrides[get_session]()
    try:
        return next(sessions).query(model).all()
    finally:
        sessions.close()   # 트랜잭션을 닫아야 PostgreSQL에서 다음 테스트의 DROP TABLE이 막히지 않는다


def test_signup_login_then_me(prod):
    cid = signup(prod).json()["id"]
    body = login(prod).json()
    assert body["token_type"] == "bearer" and body["expires_in"] == 12 * 3600
    assert body["company"]["id"] == cid and body["company"]["role"] == "factory"
    me = prod.get("/v1/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200 and me.json()["id"] == cid


def test_wrong_password_and_unknown_account_look_the_same(prod):
    signup(prod)
    wrong, unknown = login(prod, password="wrong-password"), login(prod, login_id="nobody")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_forged_company_header_is_ignored(prod):
    victim = signup(prod).json()["id"]
    op = signup(prod, "boss", "operator").json()["id"]
    assert prod.get("/v1/me", headers={"X-Company-Id": str(victim)}).status_code == 401
    assert prod.post(f"/v1/admin/companies/{victim}/verify", json={}, headers={"X-Company-Id": str(op)}).status_code == 401
    assert "cards" not in prod.get("/v1/harness", headers={"X-Company-Id": str(op)}).json()


def test_harness_cards_need_a_real_operator_token(prod):
    signup(prod)
    signup(prod, "boss", "operator")
    factory, operator = login(prod).json()["access_token"], login(prod, "boss").json()["access_token"]
    assert "cards" not in prod.get("/v1/harness", headers=bearer(factory)).json()
    assert "cards" in prod.get("/v1/harness", headers=bearer(operator)).json()
    assert "cards" not in prod.get("/v1/harness", headers=bearer("garbage")).json()


def test_bad_tokens_are_rejected(prod):
    cid = signup(prod).json()["id"]
    now = int(time.time())
    claims = {"sub": str(cid), "iat": now, "exp": now + 60}
    bad = [
        "garbage",
        jwt.encode(claims, "x" * 40, algorithm="HS256"),                                   # 다른 비밀값
        jwt.encode({**claims, "exp": now - 1}, jwt_secret(), algorithm="HS256"),           # 만료
        jwt.encode({"sub": str(cid), "iat": now}, jwt_secret(), algorithm="HS256"),        # 만료 시각 없음
        jwt.encode({**claims, "sub": "abc"}, jwt_secret(), algorithm="HS256"),             # 회사 id 아님
        jwt.encode(claims, None, algorithm="none"),                                        # 서명 없음
        create_token(999_999),                                                             # 없는 회사
    ]
    for token in bad:
        assert prod.get("/v1/me", headers=bearer(token)).status_code == 401, token
    assert prod.get("/v1/me", headers={"Authorization": f"Basic {create_token(cid)}"}).status_code == 401


def test_bad_token_does_not_fall_back_to_header_even_in_dev_mode(client):
    cid = signup(client).json()["id"]
    assert client.get("/v1/me", headers={"X-Company-Id": str(cid)}).status_code == 200    # 개발 모드에서는 헤더 인정
    assert client.get("/v1/me", headers={"X-Company-Id": str(cid), **bearer("garbage")}).status_code == 401


def test_signup_needs_credentials_outside_dev_mode(prod):
    body = {"name": "회사", "role": "factory", "biz_no": "0", "lat": 36.1, "lon": 128.4}
    assert prod.post("/v1/companies", json=body).status_code == 400
    assert prod.post("/v1/companies", json={**body, "login_id": "a"}).status_code == 400
    assert prod.post("/v1/companies", json={**body, "password": PASSWORD}).status_code == 400
    assert prod.post("/v1/companies", json={**body, "login_id": "a", "password": "short"}).status_code == 400
    assert rows(Company) == []


def test_partial_credentials_rejected_in_dev_mode_too(client):
    body = {"name": "회사", "role": "factory", "biz_no": "0", "lat": 36.1, "lon": 128.4}
    assert client.post("/v1/companies", json={**body, "login_id": "a"}).status_code == 400
    assert client.post("/v1/companies", json=body).status_code == 201


def test_duplicate_login_id_conflicts_and_creates_nothing(prod):
    assert signup(prod).status_code == 201
    assert signup(prod, role="recycler", password="another-pass-1").status_code == 409
    assert len(rows(Company)) == 1
    assert login(prod).status_code == 200
    assert login(prod, password="another-pass-1").status_code == 401


@pytest.mark.parametrize("password", ["password", "PASSWORD", "12345678", " " * 8])
def test_weak_passwords_are_rejected(prod, password):
    assert signup(prod, password=password).status_code == 400
    assert rows(Company) == []


def test_login_id_ignores_case_and_surrounding_spaces(prod):
    assert signup(prod, "Boss").status_code == 201
    assert signup(prod, "boss ", password="another-pass-1").status_code == 409
    assert login(prod, " BOSS").status_code == 200


def test_password_is_stored_only_as_hash(prod):
    response = signup(prod)
    assert PASSWORD not in response.text and "password" not in response.json()
    stored = rows(Credential)[0].password_hash
    assert PASSWORD not in stored and verify_password(PASSWORD, stored) and not verify_password("x", stored)
    assert PASSWORD not in login(prod).text


def test_operator_still_cannot_self_register_with_credentials(prod):
    body = {"name": "가짜", "role": "operator", "biz_no": "0", "lat": 36.1, "lon": 128.4,
            "login_id": "fake", "password": PASSWORD}
    assert prod.post("/v1/companies", json=body).status_code == 403
    assert login(prod, "fake").status_code == 401


def test_login_does_not_skip_permit_verification(prod):
    signup(prod, "buyer", "recycler", permit_no="R-1", permit_codes=[CODE])
    token = login(prod, "buyer").json()["access_token"]
    assert prod.post("/v1/orders", headers=bearer(token), json={"listing_id": 1}).status_code == 403   # 운영자 승인 전에는 주문 불가


def test_hauler_signup_rejected_and_legacy_hauler_locked_out(prod):
    assert signup(prod, "truck", "hauler", permit_no="H-1", permit_codes=[CODE]).status_code == 400   # 운송기사 역할은 없어짐
    assert rows(Company) == []
    sessions = app.dependency_overrides[get_session]()
    try:   # 예전에 가입한 운송기사 계정을 직접 만든다
        s = next(sessions)
        old = Company(name="예전 운송", role="hauler", biz_no="0", lat=36.1, lon=128.4)
        s.add(old)
        s.flush()
        s.add(Credential(company_id=old.id, login_id="truck", password_hash=hash_password(PASSWORD)))
        s.commit()
        cid = old.id
    finally:
        sessions.close()
    got = login(prod, "truck")
    assert got.status_code == 403 and got.json()["detail"] == "운송기사 계정은 더 이상 쓸 수 없음" and "access_token" not in got.text
    me = prod.get("/v1/me", headers=bearer(create_token(cid)))   # 예전에 받아 둔 토큰도 막힌다
    assert me.status_code == 403 and me.json()["detail"] == "운송기사 계정은 더 이상 쓸 수 없음"


@pytest.mark.parametrize("secret", [None, "too-short"])
def test_server_does_not_start_without_a_strong_secret(monkeypatch, secret):
    if secret is None:
        monkeypatch.delenv("JWT_SECRET", raising=False)
    else:
        monkeypatch.setenv("JWT_SECRET", secret)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        with TestClient(app):
            pass


def test_seed_accounts_can_log_in(prod, monkeypatch):
    session_factory = app.dependency_overrides[get_session]
    bind = next(session_factory()).get_bind()
    monkeypatch.setattr(gumi_demo, "engine", bind)
    from sqlalchemy.orm import sessionmaker
    monkeypatch.setattr(gumi_demo, "SessionLocal", sessionmaker(bind=bind, expire_on_commit=False))
    ids = gumi_demo.seed("demo-password-1", "operator-only-password")
    body = login(prod, "000-00-00004", "demo-password-1").json()
    assert body["company"]["id"] == ids["가상리사이클"] and body["company"]["role"] == "recycler"
    assert "가상운반" not in ids and login(prod, "000-00-00005", "demo-password-1").status_code == 401   # 운송기사 체험 계정은 없음
    assert login(prod, "000-00-00006", "demo-password-1").status_code == 401   # 공통 비밀번호로 운영자가 되지 않음
    assert login(prod, "000-00-00006", "operator-only-password").json()["company"]["role"] == "operator"


def test_signup_is_closed_unless_allowed(prod, monkeypatch):
    monkeypatch.delenv("ALLOW_SIGNUP", raising=False)
    assert signup(prod).status_code == 403
    assert rows(Company) == []
    assert signup(prod, "boss", "operator").status_code == 201   # 유효한 운영자 토큰은 예외


def test_too_many_failed_logins_are_blocked_then_clear_on_success(prod):
    signup(prod)
    for _ in range(4):
        assert login(prod, password="wrong-password").status_code == 401
    assert login(prod).status_code == 200                        # 성공하면 초기화
    for _ in range(5):
        assert login(prod, password="wrong-password").status_code == 401
    assert login(prod).status_code == 429                        # 맞는 비밀번호도 잠시 막힘
    assert login(prod, "acme ", PASSWORD).status_code == 429     # 공백·대소문자로 우회 불가
    assert login(prod, "ACME", PASSWORD).status_code == 429
    signup(prod, "other")
    assert login(prod, "other").status_code == 200               # 다른 계정은 영향 없음


def test_production_refuses_company_header_mode(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_ALLOW_COMPANY_HEADER", "1")
    with pytest.raises(RuntimeError, match="AUTH_ALLOW_COMPANY_HEADER"):
        with TestClient(app):
            pass


def test_unknown_waste_code_gives_empty_list(prod):
    r = prod.get("/v1/listings", params={"waste_code": "\x00"})
    assert r.status_code == 200 and r.json() == []


def test_demo_login_only_when_enabled(prod, monkeypatch):
    session_factory = app.dependency_overrides[get_session]
    bind = next(session_factory()).get_bind()
    monkeypatch.setattr(gumi_demo, "engine", bind)
    from sqlalchemy.orm import sessionmaker
    monkeypatch.setattr(gumi_demo, "SessionLocal", sessionmaker(bind=bind, expire_on_commit=False))
    ids = gumi_demo.seed("demo-password-1", "operator-only-password")
    monkeypatch.delenv("DEMO_LOGIN", raising=False)
    assert "demo" not in prod.get("/v1/auth/providers").json()          # 기본은 꺼짐(배포)
    assert prod.post("/v1/auth/demo/buyer").status_code == 404
    monkeypatch.setenv("DEMO_LOGIN", "1")
    assert "demo" in prod.get("/v1/auth/providers").json()
    body = prod.post("/v1/auth/demo/buyer").json()
    assert body["company"]["id"] == ids["가상리사이클"]
    assert prod.get("/v1/me/profile", headers=bearer(body["access_token"])).status_code == 200
    assert prod.post("/v1/auth/demo/seller").json()["company"]["id"] == ids["가상사출A"]
    assert prod.post("/v1/auth/demo/carrier").status_code == 404      # 운송기사 앱은 없어짐
    assert prod.post("/v1/auth/demo/operator").status_code == 404     # 운영자는 체험 계정 없음
