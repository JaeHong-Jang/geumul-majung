"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
import hashlib
import os
import re
import secrets
from datetime import timedelta
from urllib.parse import urlencode

from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from app.core.security import hash_password, signup_limiter
from app.core.util import now
from app.db.models import Company, Credential, OAuthTicket
from app.features._shared.regions import BY_NAME, region_from_address
from app.features._shared.schemas import unique_byproducts
from app.features.auth import oauth
from app.features.auth.schemas import SignupBase, SignupIn


SIGNUP_IP_LIMIT = 10   # 한 IP에서 5분에 가입 시도 10번


def sha(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def app_base() -> str:
    return (os.environ.get("PUBLIC_BASE_URL") or "http://localhost:8000").rstrip("/")


def digits(biz_no: str) -> str:
    return re.sub(r"\D", "", biz_no)


def register(session: Session, body: SignupBase, role: str, email: str | None, login_id: str | None, password_hash: str) -> Company:
    """회사·계정을 만든다(커밋은 호출한 쪽). 세 역할 모두 승인 전(verified=false)으로 시작한다.
    같은 사업자등록번호(숫자만 비교)가 이미 있으면 409. 이 검사는 새 가입 경로에만 있다."""
    if role == "recycler" and not body.phone:
        raise HTTPException(400, "구매자는 전화번호 입력 필요")
    if role == "recycler" and not email:
        raise HTTPException(400, "구매자는 이메일 입력 필요")
    login = login_id or email
    if not login:
        raise HTTPException(400, "아이디 입력 필요")
    check_login_id(login, email)
    if email and session.query(Company).filter_by(email=email).first():
        raise HTTPException(409, "이미 가입된 이메일")
    clean = lambda col: func.replace(func.replace(col, "-", ""), " ", "")   # noqa: E731
    if session.query(Company.id).filter(clean(Company.biz_no) == digits(body.biz_no)).first():
        raise HTTPException(409, "이미 가입된 사업자등록번호")
    region = body.region or region_from_address(body.address)
    if region not in BY_NAME:
        raise HTTPException(400, "사업장 주소를 시, 군을 포함해 입력 필요" if role == "factory" else "시, 군을 목록에서 선택 필요")
    lat, lon = (body.lat, body.lon) if body.lat is not None else BY_NAME[region]
    source = "user" if body.lat is not None else "region"
    auto = os.environ.get("AUTO_APPROVE_SIGNUP") == "1"
    c = Company(name=body.name, role=role, biz_no=body.biz_no.strip(), lat=lat, lon=lon, industry=body.industry,
                region=region, address=body.address, address_detail=body.address_detail, phone=body.phone, email=email,
                emitter_report=body.emitter_report, permit_no=body.permit_no, permit_codes=body.permit_codes,
                coord_source=source, verified=auto, approval_status="approved" if auto else "pending",
                byproducts=unique_byproducts(body.byproducts) if role == "factory" else None)
    session.add(c)
    session.flush()
    session.add(Credential(company_id=c.id, login_id=login, password_hash=password_hash))
    session.flush()   # 같은 login_id면 409, 회사도 함께 취소
    return c


def client_ip(request: Request) -> str:
    """접속 주소. 프록시 뒤라면 uvicorn의 FORWARDED_ALLOW_IPS로 신뢰할 프록시를 정해야 이 값이 실제 접속자가 된다."""
    return request.client.host if request.client else "?"


def check_signup_allowed(biz_no: str, request: Request) -> None:
    if os.environ.get("ALLOW_SIGNUP") != "1":
        raise HTTPException(403, "지금은 가입 접수 중단")
    keys = [(f"signup:{digits(biz_no)}", None), (f"signup-ip:{client_ip(request)}", SIGNUP_IP_LIMIT)]   # 사업자번호는 숫자만 비교
    if any(signup_limiter.blocked(k, lim) for k, lim in keys):
        raise HTTPException(429, "가입 시도가 너무 많음, 5분 뒤에 다시 시도 필요")
    for k, _ in keys:
        signup_limiter.failed(k)   # 성공·실패와 상관없이 시도 한 번으로 센다


def do_signup(body: SignupIn, role: str | None, request: Request, session: Session) -> dict:
    check_signup_allowed(body.biz_no, request)
    role = role or body.role
    if role is None:
        raise HTTPException(400, "가입 유형(role) 선택 필요")
    c = register(session, body, role, body.email, body.login_id, hash_password(body.password))
    session.commit()
    return {"id": c.id, "status": "approved" if c.verified else "pending"}


def new_ticket(session: Session, kind: str, data: dict, minutes: int) -> str:
    raw = secrets.token_urlsafe(32)
    session.add(OAuthTicket(kind=kind, token_hash=sha(raw), data=data, expires_at=now() + timedelta(minutes=minutes)))
    return raw


def take_ticket(session: Session, kind: str, raw: str) -> dict | None:
    """한 번만, 기한 안에서만 꺼낸다(조건부 UPDATE라 동시에 와도 한 쪽만 성공)."""
    row = session.query(OAuthTicket).filter_by(kind=kind, token_hash=sha(raw)).first()
    if row is None:
        return None
    got = session.execute(update(OAuthTicket).where(OAuthTicket.id == row.id, OAuthTicket.used.is_(False),
                                                    OAuthTicket.expires_at > now()).values(used=True),
                          execution_options={"synchronize_session": False})
    return row.data if got.rowcount == 1 else None


def provider_or_404(name: str):
    p = oauth.PROVIDERS.get(name)
    if p is None or not p.configured():
        raise HTTPException(404, "사용할 수 없는 로그인 방법")
    return p


def cookie_name(state: str) -> str:
    return "oauth_" + state[:12]   # 시작마다 다른 이름이라 탭을 여러 개 열어도 서로 덮어쓰지 않는다


def fragment_redirect(app: str, params: dict, state: str) -> RedirectResponse:
    """토큰은 주소 조각(#)으로만 넘긴다. 서버 로그·Referer에 남지 않게 한다. 쓴 브라우저 쿠키는 지운다."""
    res = RedirectResponse(f"{app_base()}/{app}/#/oauth?{urlencode(params)}", status_code=302,
                           headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
    res.delete_cookie(cookie_name(state), path="/v1/auth/oauth")
    return res


def check_login_id(login_id: str, email: str | None) -> None:
    """login_id에 @가 있으면 그 회사의 이메일과 같아야 한다. 남의 이메일을 아이디로 선점해 가입을 막는 것을 방지(§17)."""
    if "@" in login_id and login_id != email:
        raise HTTPException(400, "아이디에 이메일 모양을 쓰려면 이메일과 같아야 함")
