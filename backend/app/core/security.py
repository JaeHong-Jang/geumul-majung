"""비밀번호 해시(scrypt)와 로그인 토큰(JWT). ARCHITECTURE §10."""
import hashlib
import hmac
import os
import time
from functools import lru_cache

import jwt

TOKEN_TTL_S = 12 * 3600
_ALGORITHM = "HS256"
_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 5}


def jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET 환경변수(32자 이상)가 필요함")
    return secret


def _derive(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, dklen=32, **_SCRYPT)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    return f"{salt.hex()}${_derive(password, salt).hex()}"


@lru_cache
def _dummy_hash() -> str:
    return hash_password("계정이 없을 때 시간을 맞추는 값")


def verify_password(password: str, stored: str | None) -> bool:
    """stored가 None(없는 계정)이어도 같은 계산을 하고 False를 돌려준다."""
    salt_hex, _, digest_hex = (stored or _dummy_hash()).partition("$")
    same = hmac.compare_digest(_derive(password, bytes.fromhex(salt_hex)).hex(), digest_hex)
    return same and stored is not None


class LoginLimiter:
    """키별로 5분 안에 LIMIT번 틀리면 잠시 막는다(§11.3). 서버 메모리 기준.
    키마다 limit을 따로 줄 수 있다(예: 'login_id|IP'는 5회, 'IP 전체'는 50회)."""
    LIMIT = 5
    WINDOW_S = 300
    SWEEP_AT = 1000   # 키가 이만큼 쌓이면 한 번도 다시 조회되지 않은 만료 키를 정리한다(메모리 누수 방지)

    def __init__(self) -> None:
        self._fails: dict[str, list[float]] = {}

    def blocked(self, login_id: str, limit: int | None = None) -> bool:
        cutoff = time.monotonic() - self.WINDOW_S
        fails = [t for t in self._fails.get(login_id, []) if t > cutoff]
        if fails:
            self._fails[login_id] = fails
        else:
            self._fails.pop(login_id, None)
        return len(fails) >= (limit or self.LIMIT)

    def failed(self, login_id: str) -> None:
        if len(self._fails) >= self.SWEEP_AT:
            cutoff = time.monotonic() - self.WINDOW_S
            self._fails = {k: v for k, v in ((k, [t for t in v if t > cutoff]) for k, v in self._fails.items()) if v}
        self._fails.setdefault(login_id, []).append(time.monotonic())

    def clear(self, login_id: str | None = None) -> None:
        if login_id is None:
            self._fails.clear()
        else:
            self._fails.pop(login_id, None)

    def clear_prefix(self, prefix: str) -> None:
        for k in [k for k in self._fails if k.startswith(prefix)]:
            del self._fails[k]


login_limiter = LoginLimiter()


class GeocodeLimiter(LoginLimiter):
    LIMIT = 30   # 주소 변환은 가입 화면에서 몇 번 쓰는 정도. 5분에 30번까지


geocode_limiter = GeocodeLimiter()


class InquiryLimiter(LoginLimiter):
    LIMIT = 20       # 회사당 1분에 문의 글 20건 (§15)
    WINDOW_S = 60


inquiry_limiter = InquiryLimiter()


class MessageLimiter(LoginLimiter):
    LIMIT = 20       # 주문 메시지: 회사당 1분 20건 (§17)
    WINDOW_S = 60


class TicketLimiter(LoginLimiter):
    LIMIT = 10       # 고객센터 티켓: 회사당 1분 10건 (§17)
    WINDOW_S = 60


message_limiter = MessageLimiter()
ticket_limiter = TicketLimiter()
signup_limiter = LoginLimiter()   # 가입·비밀번호 재설정 시도 제한. 로그인 실패 횟수와 키를 섞지 않도록 따로 둔다(§13.1)


def create_token(company_id: int, token_version: int = 0) -> str:
    """token_version: 비밀번호를 재설정하면 올라가서 그 전에 발급된 토큰이 모두 무효가 된다(§17)."""
    now = int(time.time())
    return jwt.encode({"sub": str(company_id), "ver": token_version, "iat": now, "exp": now + TOKEN_TTL_S},
                      jwt_secret(), algorithm=_ALGORITHM)


def read_token_claims(token: str) -> tuple[int, int] | None:
    """올바른 토큰이면 (회사 id, token_version), 아니면 None. ver가 없는 토큰은 0으로 본다."""
    try:
        claims = jwt.decode(token, jwt_secret(), algorithms=[_ALGORITHM], options={"require": ["exp", "sub"]})
        return int(claims["sub"]), int(claims.get("ver", 0))
    except (jwt.InvalidTokenError, ValueError):
        return None


def read_token(token: str) -> int | None:
    """올바른 토큰이면 회사 id, 아니면 None."""
    got = read_token_claims(token)
    return got[0] if got else None
