"""그물마중 반출 API(/v1/gm). 웹·iOS 시제품이 기기 저장소 대신 부른다. 계산과 검증은 rules.py가 한다.
역할: factory=집하장, operator=운영(조건 협의), recycler=지정 처리업체(검수)."""
import copy
import os

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_company
from app.core.security import TOKEN_TTL_S, create_token
from app.core.util import iso, now
from app.db.models import Company, GmScan, GmShipment
from app.db.session import get_session
from app.features.gm import circulation, rules

router = APIRouter(prefix="/v1/gm", tags=["gm"])

ROLE_NAME = {"factory": "집하장", "operator": "운영", "recycler": "처리업체"}
CAN = {"create": {"factory", "operator"}, "quotes": {"operator"}, "confirm": {"operator"},
       "settle": {"recycler", "operator"}, "reset": {"operator"}}
NEW_FIELDS = ("kind", "material", "weight", "bags", "departure", "note", "checks", "photo", "facility",
              "baseRate", "feeRate", "directCost")
DEFAULT_RATES = {"facility": "보령 지정 재활용업체 (가상)", "baseRate": 300000, "feeRate": 40000, "directCost": 110000}


def _allow(me: Company, action: str) -> None:
    if me.role not in CAN[action]:
        raise HTTPException(403, "이 역할로는 사용할 수 없음")


def _check(record: dict) -> dict:
    try:
        return rules.verify(record)
    except rules.RuleError as e:
        raise HTTPException(400, str(e))


def ensure_seed(session: Session) -> None:
    if session.query(GmShipment).first() is None:
        for r in rules.seed():
            session.add(GmShipment(id=r["id"], data=r, status=r["status"]))
        session.commit()


def view(row: GmShipment) -> dict:
    r = copy.deepcopy(row.data)
    r["totals"] = rules.totals(r)
    r["circulation"] = circulation.circulation(r) if r.get("sales") else None
    for lot in r.get("sales") or []:          # 제안별 돈 내역은 저장값 대신 지금 계산식으로 다시 낸다
        for o in lot.get("offers") or []:
            o["money"] = circulation.lot_money(r, lot, o["price"])
    r["noticeBy"] = rules.notice_by(r["departure"]) if r["weight"] > 1 else None
    r["version"], r["updatedAt"] = row.version, iso(row.updated_at)
    return r


def _get(session: Session, sid: str) -> GmShipment:
    ensure_seed(session)
    row = session.get(GmShipment, sid)
    if row is None:
        raise HTTPException(404, "반출 건을 찾을 수 없음")
    return row


def _save(session: Session, row: GmShipment, record: dict, me: Company, action: str, version=None) -> dict:
    """검증 → 이력 추가 → version을 올려 저장. 화면이 version을 보냈는데 그 사이 바뀌었으면 409."""
    if version is not None and version != row.version:
        raise HTTPException(409, "다른 사람이 먼저 고침, 새로 불러온 뒤 다시 시도 필요")
    before = row.data.get("status") if row.data else None
    record = _check(record)
    record.setdefault("history", [])
    record["history"] = [*record["history"], {"at": iso(now()), "by": me.name, "role": ROLE_NAME.get(me.role, me.role),
                                              "action": action, "from": before, "to": record["status"]}]
    row.data, row.status, row.version, row.updated_at = record, record["status"], (row.version or 0) + 1, now()
    session.commit()
    return view(row)


@router.post("/demo-login/{role}")
def demo_login(role: str, session: Session = Depends(get_session)):
    """시연용 역할 로그인(DEMO_LOGIN=1일 때만). 그 역할의 첫 계정으로 토큰을 준다."""
    company = (session.query(Company).filter_by(role=role).order_by(Company.id).first()
               if os.environ.get("DEMO_LOGIN") == "1" and role in ROLE_NAME else None)
    if company is None:
        raise HTTPException(404, "시연 계정 없음")
    return {"access_token": create_token(company.id, company.token_version or 0), "token_type": "bearer",
            "expires_in": TOKEN_TTL_S, "role": role, "name": company.name}


@router.get("/shipments")
def list_shipments(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    ensure_seed(session)
    rows = session.query(GmShipment).all()
    return sorted((view(r) for r in rows), key=lambda r: r["departure"], reverse=True)


@router.get("/shipments/{sid}")
def get_shipment(sid: str, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    return view(_get(session, sid))


@router.post("/shipments", status_code=201)
def create_shipment(body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _allow(me, "create")
    ensure_seed(session)
    record = {**DEFAULT_RATES, **{k: body[k] for k in NEW_FIELDS if body.get(k) is not None}}
    try:
        record["quotes"] = rules.defaults(record.get("weight"), str(record.get("departure", ""))[:10])
    except rules.RuleError as e:
        raise HTTPException(400, str(e))
    record |= {"id": rules.allocate_id([i for (i,) in session.query(GmShipment.id)]), "status": "registered",
               "choice": None, "actual": None, "photo": record.get("photo"), "note": record.get("note", "")}
    row = GmShipment(id=record["id"], data={}, status="registered", version=0)
    session.add(row)
    return _save(session, row, record, me, "등록")


@router.put("/shipments/{sid}/quotes")
def put_quotes(sid: str, body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _allow(me, "quotes")
    row = _get(session, sid)
    if row.status != "registered":
        raise HTTPException(409, "확정 뒤에는 인수 조건을 고칠 수 없음")
    return _save(session, row, {**copy.deepcopy(row.data), "quotes": body.get("quotes")}, me, "조건 수정", body.get("version"))


@router.post("/shipments/{sid}/confirm")
def confirm(sid: str, body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _allow(me, "confirm")
    row = _get(session, sid)
    if row.status != "registered":
        raise HTTPException(409, "인수 협의 단계에서만 확정할 수 있음")
    return _save(session, row, {**copy.deepcopy(row.data), "status": "confirmed", "choice": body.get("choice")}, me,
                 "조건 확정", body.get("version"))


def _actual(body: dict) -> dict:
    a = {k: body.get(k) for k in ("total", "accepted", "reference", "reason", "signer")}
    if body.get("extra") is not None:
        a["extra"] = body["extra"]
    return a


@router.post("/shipments/{sid}/preview")
def preview(sid: str, body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """정산 미리보기(저장 안 함). 입력 중 숫자를 바꿀 때마다 부른다."""
    r = _get(session, sid).data
    if r.get("choice") is None:
        raise HTTPException(409, "인수 조건 확정 필요")
    try:
        return rules.calculate(r, r["quotes"][r["choice"]], body.get("total"), body.get("accepted"), body.get("extra"))
    except rules.RuleError as e:
        raise HTTPException(400, str(e))


@router.post("/shipments/{sid}/settle")
def settle(sid: str, body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _allow(me, "settle")
    row = _get(session, sid)
    if row.status != "confirmed":
        raise HTTPException(409, "인수 확정 단계에서만 정산할 수 있음")
    return _save(session, row, {**copy.deepcopy(row.data), "status": "settled", "actual": _actual(body)}, me, "검수 정산",
                 body.get("version"))


@router.get("/summary")
def summary(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """대시보드 숫자. 화면과 같은 값이 나오도록 서버에서 센다."""
    ensure_seed(session)
    rs = [r.data for r in session.query(GmShipment).all()]
    done = [r for r in rs if r["status"] == "settled"]
    open_ = [r for r in rs if r["status"] != "settled"]
    shipped = sum(r["actual"]["total"] for r in done)
    accepted = sum(r["actual"]["accepted"] for r in done)
    t = [rules.totals(r) for r in done]
    c = [circulation.circulation(r) for r in rs if r.get("sales")]
    sale = {k: round(sum(x[k] for x in c), 3) for k in ("tons", "revenue", "avoided", "teamFee", "siteGain")} if c else \
        dict.fromkeys(("tons", "revenue", "avoided", "teamFee", "siteGain"), 0)
    sale["offering"] = sum(1 for r in rs for s in r.get("sales") or [] if s["status"] == "offering")
    return {"today": rules.today(), "count": len(rs),
            "byStatus": {s: sum(r["status"] == s for r in rs) for s in rules.STATUSES},
            "plannedWeight": round(sum(r["weight"] for r in open_), 3),
            "departingToday": sum(r["departure"][:10] == rules.today() for r in rs),
            "settledShipped": round(shipped, 3), "settledAccepted": round(accepted, 3),
            "acceptRatio": round(accepted / shipped * 100, 1) if shipped else None,
            "customerSavings": sum(x["savings"] for x in t), "teamFee": sum(x["fee"] for x in t),
            "teamMargin": sum(x["margin"] for x in t), "circulation": sale}


@router.post("/demo/reset")
def reset(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _allow(me, "reset")
    session.query(GmShipment).delete()
    session.query(GmScan).delete()          # 읽어 둔 계량증명서 스캔도 지운다(서류 초안에 옛 값이 남지 않게)
    session.commit()
    ensure_seed(session)
    return {"ok": True, "count": session.query(GmShipment).count()}
