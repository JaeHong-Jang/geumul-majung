"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from app.core.util import iso
from app.db.models import Company, CompanyDocument


def company_dict(c: Company) -> dict:
    return {"id": c.id, "name": c.name, "role": c.role, "verified": c.verified, "permit_codes": c.permit_codes,
            "lat": c.lat, "lon": c.lon}


def has_permit(c: Company, code: str) -> bool:
    return code in (c.permit_codes or [])


def me_dict(me: Company) -> dict:
    return {**company_dict(me), "region": me.region, "biz_no": me.biz_no, "permit_no": me.permit_no,
            "byproducts": me.byproducts or []}


MAX_ATTACHMENT_TOTAL = 6 * 1024 * 1024   # 문의 하나의 첨부 합계


# ── 12.1 회사 정보 ──
def profile_dict(c: Company) -> dict:
    return {"id": c.id, "name": c.name, "role": c.role, "verified": c.verified, "biz_no": c.biz_no,
            "permit_no": c.permit_no, "permit_codes": c.permit_codes, "region": c.region, "address": c.address,
            "lat": c.lat, "lon": c.lon, "phone": c.phone, "industry": c.industry, "coord_source": c.coord_source,
            "address_detail": c.address_detail, "emitter_report": c.emitter_report,
            "pickup_method": c.pickup_method, "terms": c.terms, "byproducts": c.byproducts or []}


# ── 13.1 증빙·승인 ──
def approval_of(c: Company) -> dict:
    status = "approved" if c.verified else (c.approval_status if c.approval_status != "approved" else "pending")
    return {"status": status, "note": c.approval_note if status == "needs_fix" else None,
            "missing": (c.approval_missing or []) if status == "needs_fix" else []}


def document_dict(d: CompanyDocument) -> dict:
    return {"id": d.id, "kind": d.kind, "created_at": iso(d.created_at)}
