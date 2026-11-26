"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
import hmac
import logging
import os
import secrets
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.core.deps import _resolve
from app.core.security import (
    create_token,
    geocode_limiter,
    hash_password,
    login_limiter,
    signup_limiter,
    TOKEN_TTL_S,
    verify_password,
)
from app.core.util import now
from app.db.models import Company, Credential, PasswordResetToken, SocialAccount
from app.db.session import get_session
from app.features.auth import juso, oauth
from app.features.auth.mail import send_mail
from app.features.auth.schemas import GeocodeIn, LoginIn, ResetConfirmIn, ResetIn, SignupIn, SignupRole, SocialSignupIn
from app.features.auth.service import (
    app_base,
    check_signup_allowed,
    client_ip,
    cookie_name,
    do_signup,
    fragment_redirect,
    new_ticket,
    provider_or_404,
    register,
    sha,
    take_ticket,
)
from app.features.companies.service import company_dict


router = APIRouter(prefix="/v1")


log = logging.getLogger(__name__)


RESET_IP_LIMIT = 10    # 한 IP에서 5분에 재설정 요청 10번


OAUTH_IP_LIMIT = 30    # 한 IP에서 5분에 OAuth 시작 30번


APP_OF = {"factory": "seller", "recycler": "buyer"}


@router.post("/signup", status_code=201)
def signup(body: SignupIn, request: Request, session: Session = Depends(get_session)):
    return do_signup(body, None, request, session)


@router.post("/signup/factory", status_code=201)
def signup_factory(body: SignupIn, request: Request, session: Session = Depends(get_session)):
    if body.role not in (None, "factory"):
        raise HTTPException(400, "이 경로는 판매자(factory) 가입 전용")
    return do_signup(body, "factory", request, session)


# ── 비밀번호 재설정 (이메일) ──
RESET_TTL = timedelta(minutes=30)


@router.post("/auth/password-reset")
def password_reset(body: ResetIn, request: Request, background: BackgroundTasks, session: Session = Depends(get_session)):
    """계정이 있든 없든 응답이 같고 DB 쓰기 문장도 같다(UPDATE·INSERT·DELETE 한 번씩). 없는 이메일은 쓸 수 없는 미끼 행을 남기고
    다음 요청에서 지운다. 메일은 응답 뒤에 보내 응답 시간도 비슷하다. 시도는 이메일별·IP별로 제한한다."""
    keys = [(f"reset:{body.email}", None), (f"reset-ip:{client_ip(request)}", RESET_IP_LIMIT)]
    if any(signup_limiter.blocked(k, lim) for k, lim in keys):
        raise HTTPException(429, "시도가 너무 많음, 5분 뒤에 다시 시도 필요")
    for k, _ in keys:
        signup_limiter.failed(k)
    token = secrets.token_urlsafe(32)
    company = session.query(Company).filter_by(email=body.email).first()
    owner = company.id if company is not None else None
    session.execute(update(PasswordResetToken).where(PasswordResetToken.company_id == (owner or -1),
                                                     PasswordResetToken.used.is_(False)).values(used=True),
                    execution_options={"synchronize_session": False})   # 이전 토큰 무효
    session.execute(delete(PasswordResetToken).where(PasswordResetToken.used.is_(True),
                                                     PasswordResetToken.expires_at < now() - timedelta(days=1)),
                    execution_options={"synchronize_session": False})   # 오래된 쓴 토큰·미끼 정리
    session.add(PasswordResetToken(company_id=owner, token_hash=sha(token), used=owner is None,
                                   expires_at=now() + RESET_TTL if owner else now()))
    session.commit()
    if company is not None:
        link = f"{app_base()}/{APP_OF.get(company.role, 'buyer')}/#/reset?token={token}"
        background.add_task(send_mail, body.email, "잔재미 비밀번호 재설정",
                            f"아래 주소에서 30분 안에 새 비밀번호 설정 필요, 한 번만 사용 가능\n{link}\n"
                            "요청하지 않았다면 이 메일 무시 필요")
    return {"ok": True}


@router.post("/auth/password-reset/confirm")
def password_reset_confirm(body: ResetConfirmIn, session: Session = Depends(get_session)):
    row = session.query(PasswordResetToken).filter_by(token_hash=sha(body.token)).first()
    claimed = row is not None and session.execute(
        update(PasswordResetToken).where(PasswordResetToken.id == row.id, PasswordResetToken.used.is_(False),
                                         PasswordResetToken.expires_at > now()).values(used=True),
        execution_options={"synchronize_session": False}).rowcount == 1
    if not claimed:
        session.rollback()
        raise HTTPException(400, "유효하지 않거나 만료된 링크, 재설정 다시 요청 필요")
    cred = session.get(Credential, row.company_id)
    cred.password_hash = hash_password(body.new_password)
    company = session.get(Company, row.company_id)
    company.token_version = (company.token_version or 0) + 1   # 재설정 전에 발급된 로그인 토큰을 모두 무효로
    session.commit()
    for prefix in (f"{cred.login_id}|", f"company:{company.id}|", f"{company.email}|" if company.email else "\0"):
        login_limiter.clear_prefix(prefix)
    return {"ok": True}


@router.post("/geocode")
def geocode(body: GeocodeIn, request: Request, authorization: str | None = Header(default=None),
            x_company_id: str | None = Header(default=None), session: Session = Depends(get_session)):
    """가입 중에는 로그인이 없으므로 누구나 쓸 수 있고, 로그인했으면 회사별로, 아니면 접속 주소별로 시도를 센다."""
    me = _resolve(authorization, x_company_id, session)
    key = f"company:{me.id}" if me else "ip:" + (request.client.host if request.client else "?")
    if geocode_limiter.blocked(key):
        raise HTTPException(429, "주소 변환 시도가 너무 많음, 5분 뒤에 다시 시도 필요")
    geocode_limiter.failed(key)
    codes = juso.clean_codes(body.adm_cd, body.rn_mgt_sn, body.udrt_yn, body.buld_mnnm, body.buld_slno)
    got = juso.geocode(body.road_address, codes)
    if not got:
        return {"lat": None, "lon": None, "source": None, "region": None}
    return {"lat": got[0], "lon": got[1], "source": "juso", "region": got[2]}


# ── 카카오·구글 ──
@router.get("/auth/providers")
def providers():
    # demo = 체험 계정 원클릭 로그인(아래 demo_login)
    return oauth.configured_providers() + (["demo"] if os.environ.get("DEMO_LOGIN") == "1" else [])


@router.get("/auth/oauth/{provider}/start")
def oauth_start(provider: str, request: Request, role: SignupRole | None = None,
                app: Literal["buyer", "carrier", "seller"] = "buyer", session: Session = Depends(get_session)):
    p = provider_or_404(provider)
    ip_key = f"oauth-ip:{client_ip(request)}"
    if signup_limiter.blocked(ip_key, OAUTH_IP_LIMIT):
        raise HTTPException(429, "로그인 시작이 너무 잦음, 5분 뒤에 다시 시도 필요")
    signup_limiter.failed(ip_key)
    verifier, challenge = oauth.pkce_pair()
    nonce = secrets.token_urlsafe(16)
    browser = secrets.token_urlsafe(32)   # 이 브라우저에만 심는 값. 콜백에서 대조해 남이 시작한 로그인을 내 브라우저에 끼워 넣는 login CSRF를 막는다
    state = new_ticket(session, "state", {"provider": provider, "role": role, "app": app, "verifier": verifier,
                                          "nonce": nonce, "browser_hash": sha(browser)}, 10)
    session.commit()
    res = RedirectResponse(p.authorize_url(state, nonce, challenge), status_code=302)
    res.set_cookie(cookie_name(state), browser, max_age=600, httponly=True, samesite="lax", path="/v1/auth/oauth",
                   secure=app_base().startswith("https://"))
    return res


@router.get("/auth/oauth/{provider}/callback")
def oauth_callback(provider: str, request: Request, code: str | None = None, state: str | None = None,
                   error: str | None = None, session: Session = Depends(get_session)):
    p = provider_or_404(provider)
    ctx = take_ticket(session, "state", state) if state else None
    session.commit()   # 성공·실패와 상관없이 state는 한 번 쓰면 끝
    if ctx is None or ctx["provider"] != provider:
        raise HTTPException(400, "로그인 요청이 올바르지 않거나 만료됨, 처음부터 다시 시도 필요")
    browser = request.cookies.get(cookie_name(state), "")
    if not hmac.compare_digest(sha(browser), ctx["browser_hash"]):
        raise HTTPException(400, "로그인을 시작한 브라우저가 아님, 처음부터 다시 시도 필요")
    if error or not code:
        raise HTTPException(400, "로그인이 취소되었거나 거부됨")
    try:
        ident = p.exchange(code, ctx["verifier"], ctx["nonce"])
    except Exception:   # httpx 오류·id_token 검증 실패 모두: 공급자 응답을 믿을 수 없다
        log.exception("OAuth 교환 실패(%s)", provider)
        raise HTTPException(502, "로그인 서비스 확인 실패, 잠시 뒤 다시 시도 필요")
    link = session.query(SocialAccount).filter_by(provider=provider, subject=ident.subject).first()
    if link is not None:   # 공급자 이메일이 기존 회사와 같아도 자동으로 합치지 않는다
        return fragment_redirect(ctx["app"], {"access_token": create_token(link.company_id, session.get(Company, link.company_id).token_version or 0)}, state)
    raw = new_ticket(session, "signup", {"provider": provider, "subject": ident.subject, "email": ident.email, "name": ident.name}, 15)
    session.commit()
    params = {"signup_token": raw, "role": ctx["role"] or "", "provider": provider}
    if ident.email:
        params["email"] = ident.email
    if ident.name:
        params["name"] = ident.name
    return fragment_redirect(ctx["app"], params, state)


@router.post("/signup/social", status_code=201)
def signup_social(body: SocialSignupIn, request: Request, session: Session = Depends(get_session)):
    check_signup_allowed(body.biz_no, request)
    if body.role is None:
        raise HTTPException(400, "가입 유형(role) 선택 필요")
    ticket = take_ticket(session, "signup", body.signup_token)
    if ticket is None:
        session.rollback()
        raise HTTPException(400, "가입 정보가 만료되었거나 이미 사용됨, 처음부터 다시 시도 필요")
    if ticket["email"]:   # 공급자가 인증한 이메일을 본문이 덮어쓸 수 없다. 이미 쓰는 이메일이면 가입 대신 기존 계정으로 로그인
        if body.email is not None and body.email != ticket["email"]:
            session.rollback()
            raise HTTPException(400, "로그인 서비스가 인증한 이메일은 바꿀 수 없음")
        email = ticket["email"]
    else:
        email = body.email   # 공급자가 이메일을 주지 않은 경우(카카오 미동의 등)에만 직접 받는다
        if email is None and not (body.role == "factory" and body.login_id):
            session.rollback()
            raise HTTPException(400, "이메일 입력 필요")
    try:
        c = register(session, body, body.role, email, body.login_id, hash_password(secrets.token_urlsafe(32)))   # 아무도 모르는 비밀번호
        session.add(SocialAccount(provider=ticket["provider"], subject=ticket["subject"], company_id=c.id))
        session.flush()
    except Exception:
        session.rollback()   # 가입이 실패하면 signup_token도 쓰지 않은 것으로 돌아간다
        raise
    session.commit()
    return {"id": c.id, "status": "approved" if c.verified else "pending", "access_token": create_token(c.id, c.token_version or 0),
            "token_type": "bearer", "expires_in": TOKEN_TTL_S, "company": company_dict(c)}


IP_LOGIN_LIMIT = 50   # 한 IP에서 5분에 틀린 로그인 50번까지


@router.post("/auth/login")
def login(body: LoginIn, request: Request, session: Session = Depends(get_session)):
    """login_id는 아이디 또는 이메일(§14.2). 제한은 (계정, IP) 조합과 IP 전체로 센다: 남이 내 계정을 잠그기 어렵고, 한 IP의
    계정 돌려가며 시도도 막는다. IP는 request.client.host이며 프록시 뒤라면 uvicorn의 FORWARDED_ALLOW_IPS로 신뢰할 프록시를 정한다(§17)."""
    ip = request.client.host if request.client else "?"
    cred = session.query(Credential).filter_by(login_id=body.login_id).first()
    if cred is None and "@" in body.login_id:
        owner = session.query(Company).filter_by(email=body.login_id).first()
        cred = session.get(Credential, owner.id) if owner else None
    keys = [f"{body.login_id}|{ip}"] + ([f"company:{cred.company_id}|{ip}"] if cred else [])   # 같은 계정을 아이디·이메일로 번갈아 써도 한 계정
    if any(login_limiter.blocked(k) for k in keys) or login_limiter.blocked(f"ip|{ip}", IP_LOGIN_LIMIT):
        raise HTTPException(429, "로그인 시도가 너무 많음, 5분 뒤에 다시 시도 필요")
    # 계정이 없어도 같은 계산을 해서 응답 시간으로 계정 유무를 알 수 없게 한다
    if not verify_password(body.password, cred.password_hash if cred else None):
        for k in (*keys, f"ip|{ip}"):
            login_limiter.failed(k)
        raise HTTPException(401, "아이디 또는 비밀번호가 맞지 않음")
    for k in keys:
        login_limiter.clear(k)
    company = session.get(Company, cred.company_id)
    if company.role == "hauler":
        raise HTTPException(403, "운송기사 계정은 더 이상 쓸 수 없음")
    return {"access_token": create_token(company.id, company.token_version or 0), "token_type": "bearer",
            "expires_in": TOKEN_TTL_S, "company": company_dict(company)}


# ── 체험 계정 원클릭 로그인. DEMO_LOGIN=1(로컬 시연)일 때만 열린다. 배포에서는 켜지 않는다 ──
DEMO_LOGINS = {"seller": "000-00-00001", "buyer": "000-00-00004"}   # seed.gumi_demo 계정


def _demo_company(session: Session, app_name: str) -> Company | None:
    cred = session.query(Credential).filter_by(login_id=DEMO_LOGINS.get(app_name, "")).first()
    return session.get(Company, cred.company_id) if cred else None


@router.post("/auth/demo/{app_name}")
def demo_login(app_name: str, session: Session = Depends(get_session)):
    company = _demo_company(session, app_name) if os.environ.get("DEMO_LOGIN") == "1" else None
    if company is None:
        raise HTTPException(404, "체험 계정 없음")
    return {"access_token": create_token(company.id, company.token_version or 0), "token_type": "bearer",
            "expires_in": TOKEN_TTL_S, "company": company_dict(company)}
