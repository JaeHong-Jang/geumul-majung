"""카카오·구글 로그인 공급자(ARCHITECTURE §14.4). 공급자와 실제로 주고받는 httpx 호출은 이 파일에만 있다.
테스트는 PROVIDERS를 모의 공급자로 바꾼다. 비밀값은 환경변수에서만 읽는다."""
import base64
import hashlib
import os
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import jwt


@dataclass
class Identity:
    subject: str
    email: str | None
    name: str | None


def redirect_base() -> str:
    return (os.environ.get("OAUTH_REDIRECT_BASE") or os.environ.get("PUBLIC_BASE_URL") or "http://localhost:8000").rstrip("/")


def redirect_uri(provider: str) -> str:
    return f"{redirect_base()}/v1/auth/oauth/{provider}/callback"


def pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


class Kakao:
    name = "kakao"
    AUTH = "https://kauth.kakao.com/oauth/authorize"
    TOKEN = "https://kauth.kakao.com/oauth/token"
    ME = "https://kapi.kakao.com/v2/user/me"

    def configured(self) -> bool:
        return bool(os.environ.get("KAKAO_CLIENT_ID"))

    def authorize_url(self, state: str, nonce: str, challenge: str | None) -> str:
        q = {"client_id": os.environ["KAKAO_CLIENT_ID"], "redirect_uri": redirect_uri(self.name), "response_type": "code",
             "state": state, "scope": "profile_nickname account_email"}
        return f"{self.AUTH}?{urlencode(q)}"

    def exchange(self, code: str, verifier: str | None, nonce: str) -> Identity:
        data = {"grant_type": "authorization_code", "client_id": os.environ["KAKAO_CLIENT_ID"], "code": code,
                "redirect_uri": redirect_uri(self.name)}
        if os.environ.get("KAKAO_CLIENT_SECRET"):
            data["client_secret"] = os.environ["KAKAO_CLIENT_SECRET"]
        tok = httpx.post(self.TOKEN, data=data, timeout=10)
        tok.raise_for_status()
        me = httpx.get(self.ME, headers={"Authorization": f"Bearer {tok.json()['access_token']}"}, timeout=10)
        me.raise_for_status()
        body = me.json()
        account = body.get("kakao_account") or {}
        # 인증됐다고 분명히 알려 준 이메일만 믿는다(필드가 없으면 미검증)
        email = account.get("email") if account.get("is_email_verified") is True and account.get("is_email_valid", True) else None
        return Identity(str(body["id"]), email, (account.get("profile") or {}).get("nickname"))


GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs"


GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]


def verify_google_id_token(id_token: str, client_id: str, nonce: str, signing_key=None) -> dict:
    """공식 방식: Google 공개키(JWKS)로 RS256 서명, 발급자, 대상(aud=client_id), 만료, nonce를 확인한다.
    signing_key를 주면(테스트) 그 키로 검증하고, 없으면 JWKS를 내려받는다."""
    key = signing_key or jwt.PyJWKClient(GOOGLE_JWKS).get_signing_key_from_jwt(id_token).key
    claims = jwt.decode(id_token, key, algorithms=["RS256"], audience=client_id, issuer=GOOGLE_ISSUERS,
                        options={"require": ["exp", "iat", "iss", "aud", "sub"]})
    if claims.get("nonce") != nonce:
        raise jwt.InvalidTokenError("nonce가 다름")
    return claims


class Google:
    name = "google"
    AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN = "https://oauth2.googleapis.com/token"

    def configured(self) -> bool:
        return bool(os.environ.get("GOOGLE_CLIENT_ID"))

    def authorize_url(self, state: str, nonce: str, challenge: str | None) -> str:
        q = {"client_id": os.environ["GOOGLE_CLIENT_ID"], "redirect_uri": redirect_uri(self.name), "response_type": "code",
             "scope": "openid email profile", "state": state, "nonce": nonce, "code_challenge": challenge,
             "code_challenge_method": "S256"}
        return f"{self.AUTH}?{urlencode(q)}"

    def exchange(self, code: str, verifier: str | None, nonce: str) -> Identity:
        data = {"grant_type": "authorization_code", "code": code, "client_id": os.environ["GOOGLE_CLIENT_ID"],
                "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""), "redirect_uri": redirect_uri(self.name),
                "code_verifier": verifier}
        tok = httpx.post(self.TOKEN, data=data, timeout=10)
        tok.raise_for_status()
        claims = verify_google_id_token(tok.json()["id_token"], os.environ["GOOGLE_CLIENT_ID"], nonce)
        email = claims.get("email") if claims.get("email_verified") else None
        return Identity(claims["sub"], email, claims.get("name"))


PROVIDERS = {"kakao": Kakao(), "google": Google()}


def configured_providers() -> list[str]:
    return [name for name, p in PROVIDERS.items() if p.configured()]
