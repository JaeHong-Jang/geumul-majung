"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.contracts import Role
from app.core.config import is_production
from app.core.deps import current_company, get_or_404, need_role
from app.core.security import hash_password
from app.core.util import iso, now
from app.db.models import Company, CompanyDocument, Credential
from app.db.session import get_session
from app.features._shared.flows import call_flow, dump
from app.features._shared.regions import region_list
from app.features._shared.schemas import unique_byproducts
from app.features._shared.uploads import decode_upload, file_response
from app.features.auth.service import check_login_id
from app.features.companies.schemas import CompanyIn, DocumentPut, FixIn, ProfilePatch, ResubmitIn
from app.features.companies.service import approval_of, company_dict, document_dict, profile_dict


router = APIRouter(prefix="/v1")


@router.post("/companies", status_code=201)
def create_company(body: CompanyIn, x_operator_token: str | None = Header(default=None),
                   session: Session = Depends(get_session)):
    token = os.environ.get("OPERATOR_BOOTSTRAP_TOKEN", "")
    token_ok = bool(token) and bool(x_operator_token) and secrets.compare_digest(token, x_operator_token)
    if body.role == Role.operator:
        # 운영자는 공개 가입 불가: 환경변수 토큰이 설정돼 있고 헤더가 같을 때만
        if not token_ok:
            raise HTTPException(403, "운영자는 가입으로 만들 수 없음")
    elif not token_ok:
        # 공개 호출로는 만들 수 없다(승인·시도 제한·검증을 건너뛰는 우회로가 되므로). 가입은 POST /v1/signup.
        # 이 경로는 옛 테스트가 쓰는 LEGACY_COMPANY_CREATE=1일 때만 열리고, 운영(APP_ENV=production)에서는 그 값과 상관없이 닫힌다.
        if is_production() or os.environ.get("LEGACY_COMPANY_CREATE") != "1":
            raise HTTPException(403, "이 경로로는 가입할 수 없음, 회원가입 화면 이용 필요")
        if os.environ.get("ALLOW_SIGNUP") != "1":
            raise HTTPException(403, "지금은 가입 접수 중단")
    if body.login_id is not None:
        check_login_id(body.login_id, None)
    if (body.login_id is None) != (body.password is None):
        raise HTTPException(400, "아이디와 비밀번호를 함께 입력 필요")
    if body.login_id is None and os.environ.get("AUTH_ALLOW_COMPANY_HEADER") != "1":
        raise HTTPException(400, "아이디와 비밀번호 입력 필요")
    c = Company(name=body.name, role=body.role.value, biz_no=body.biz_no, lat=body.lat, lon=body.lon, coord_source="user",
                permit_no=body.permit_no, permit_codes=body.permit_codes, industry=body.industry, region=body.region,
                verified=body.role in (Role.factory, Role.operator))  # recycler는 운영자 확인 필요
    session.add(c)
    session.flush()
    if body.login_id is not None:   # 같은 login_id면 여기서 충돌 → 409, 회사도 함께 취소
        session.add(Credential(company_id=c.id, login_id=body.login_id, password_hash=hash_password(body.password)))
        session.flush()
    out = {"id": c.id, "name": c.name, "role": c.role, "verified": c.verified, "permit_codes": c.permit_codes}
    if c.role == "factory":
        ctx = {"company": {"id": c.id, "name": c.name, "industry": c.industry, "biz_no": c.biz_no}}
        out["guide"] = dump(call_flow(session, "profile_company", ctx, [c.id]))
    session.commit()
    return out


@router.get("/regions")
def regions():
    return region_list()


@router.post("/admin/companies/{company_id}/verify")
def verify_company(company_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "operator")
    target = get_or_404(session, Company, company_id)
    if target.role == "recycler" and not target.permit_codes:
        raise HTTPException(409, "허가 코드가 없는 업체는 승인할 수 없음")
    target.verified = True
    target.approval_status, target.approval_note, target.approval_missing = "approved", None, None
    session.commit()
    return {"id": target.id, "verified": True}


@router.post("/admin/companies/{company_id}/request-fix")
def request_fix(company_id: int, body: FixIn, me: Company = Depends(current_company),
                session: Session = Depends(get_session)):
    need_role(me, "operator")
    target = get_or_404(session, Company, company_id)
    if target.verified:
        raise HTTPException(409, "이미 승인된 업체")
    target.approval_status, target.approval_note, target.approval_missing = "needs_fix", body.note, body.missing
    session.commit()
    return {"id": target.id, "status": "needs_fix"}


@router.get("/me")
def me_info(me: Company = Depends(current_company)):
    return company_dict(me)


COORD_CHANGES_PER_DAY = 3


@router.get("/me/profile")
def get_profile(me: Company = Depends(current_company)):
    return profile_dict(me)


@router.patch("/me/profile")
def patch_profile(body: ProfilePatch, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if me.role != "recycler" and {"pickup_method", "terms"} & changes.keys():
        raise HTTPException(403, "수거 방식, 매입 조건은 재활용업체만 바꿀 수 있음")
    if "byproducts" in changes:
        if me.role != "factory":
            raise HTTPException(403, "나오는 부산물은 판매자만 입력 가능")
        changes["byproducts"] = unique_byproducts(body.byproducts)
    if ("lat" in changes) != ("lon" in changes):
        raise HTTPException(400, "위도와 경도를 함께 입력 필요")
    if "lat" in changes:
        # 좌표를 바꿔 가며 남의 위치를 거리로 역산하지 못하게 회사당 하루 3번까지(§17)
        since = now() - timedelta(hours=24)
        recent = [t for t in (me.coord_changes or []) if datetime.fromisoformat(t) > since]
        if len(recent) >= COORD_CHANGES_PER_DAY:
            raise HTTPException(429, f"좌표는 하루 {COORD_CHANGES_PER_DAY}번까지만 바꿀 수 있음")
        me.coord_changes = [*recent, iso(now())]
        me.coord_source = "user"
    for key, value in changes.items():
        setattr(me, key, value)
    session.commit()
    return profile_dict(me)


@router.put("/me/documents")
def put_document(body: DocumentPut, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory", "recycler")
    raw = decode_upload(body.content_type, body.data_base64)
    session.query(CompanyDocument).filter_by(company_id=me.id, kind=body.kind).delete()   # 같은 종류는 새 파일로 교체
    d = CompanyDocument(company_id=me.id, kind=body.kind, content_type=body.content_type, data=raw)
    session.add(d)
    session.commit()
    return document_dict(d)


@router.get("/me/documents")
def list_documents(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory", "recycler")
    return [document_dict(d) for d in session.query(CompanyDocument).filter_by(company_id=me.id).order_by(CompanyDocument.id)]


@router.get("/documents/{document_id}")
def get_document(document_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """증빙 파일. 올린 회사와 운영자만(운영자가 승인 전에 확인한다)."""
    d = get_or_404(session, CompanyDocument, document_id)
    if d.company_id != me.id and me.role != "operator":
        raise HTTPException(404, "증빙 파일을 찾을 수 없음")
    return file_response(d.data, d.content_type)


@router.get("/me/approval")
def get_approval(me: Company = Depends(current_company)):
    need_role(me, "factory", "recycler")
    return approval_of(me)


@router.post("/me/approval/resubmit")
def resubmit(body: ResubmitIn | None = None, me: Company = Depends(current_company),
             session: Session = Depends(get_session)):
    need_role(me, "factory", "recycler")
    if me.verified:
        raise HTTPException(409, "이미 승인됨")
    me.approval_status = "pending"
    session.commit()
    return {"status": "pending"}


@router.get("/me/coupons")
def coupons(me: Company = Depends(current_company)):
    return []   # 쿠폰 제도가 정해지지 않아 값을 만들지 않는다(§12, §13.5)
