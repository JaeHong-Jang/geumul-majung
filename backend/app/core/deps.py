"""공통: 헤더 인증, 역할 확인, 에러 도우미."""
import os

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.security import read_token_claims
from app.core.util import MAX_ID
from app.db.models import Company
from app.db.session import get_session


def _resolve(authorization: str | None, x_company_id: str | None, session: Session) -> Company | None:
    """요청한 회사를 찾는다(§10.2). 못 찾으면 None."""
    if authorization:      # 토큰이 있으면 토큰만 본다(잘못돼도 헤더로 넘어가지 않음)
        scheme, _, token = authorization.partition(" ")
        claims = read_token_claims(token) if scheme.lower() == "bearer" else None
        cid, version = claims if claims else (None, 0)
    elif os.environ.get("AUTH_ALLOW_COMPANY_HEADER") == "1":
        version = None   # 헤더 모드에는 토큰 버전이 없다
        try:
            cid = int(x_company_id) if x_company_id else None
        except ValueError:
            cid = None
    else:
        cid, version = None, None
    company = session.get(Company, cid) if cid is not None and 1 <= cid <= MAX_ID else None   # 범위 밖 id는 '없는 회사'(401)
    if company is not None and version is not None and version != (company.token_version or 0):
        return None   # 비밀번호 재설정 전에 발급된 토큰
    return company


def current_company(authorization: str | None = Header(default=None), x_company_id: str | None = Header(default=None),
                    session: Session = Depends(get_session)) -> Company:
    company = _resolve(authorization, x_company_id, session)
    if company is None:
        raise HTTPException(401, "로그인 필요")
    if company.role == "hauler":   # 운송기사 역할은 없앰(운송은 판매자가 맡음). 예전 계정은 쓸 수 없다
        raise HTTPException(403, "운송기사 계정은 더 이상 쓸 수 없음")
    return company


def optional_company(authorization: str | None = Header(default=None), x_company_id: str | None = Header(default=None),
                     session: Session = Depends(get_session)) -> Company | None:
    """로그인 없이도 되는 조회에서 보여 줄 범위를 정할 때 쓴다."""
    return _resolve(authorization, x_company_id, session)


def need_role(company: Company, *roles: str, verified: bool = False) -> None:
    if company.role not in roles:
        raise HTTPException(403, "이 역할로는 사용할 수 없음")
    if verified and not company.verified:
        raise HTTPException(403, "운영자 승인 전에는 사용할 수 없음")


def get_or_404(session: Session, model, obj_id: int):
    obj = session.get(model, obj_id) if isinstance(obj_id, int) and 1 <= obj_id <= MAX_ID else None
    if obj is None:
        raise HTTPException(404, "요청한 항목을 찾을 수 없음")
    return obj
