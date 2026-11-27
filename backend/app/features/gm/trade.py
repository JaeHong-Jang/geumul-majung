"""그물마중 자원 순환 판매·업체 회신·서류(/v1/gm).
- 판매: 떼어 놓은 묶음을 판매 가능 판정(gm_grade) → 판매 등록 → 업체 매입 제안 → 운영 수락 → 판매 정산
- 업체 회신: 지정 처리업체가 인수 조건(예상 인수량, 단가, 유효일)을 직접 보냄
- 서류: 반출 단계에 맞는 서류 목록과 초안(gm_docs), 인쇄용 HTML"""
import copy
import html

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.deps import current_company
from app.core.util import iso, now
from app.db.models import Company, GmScan, GmShipment
from app.db.session import get_session
from app.features._shared.flows import call_flow
from app.features.assistant.router import fact_view
from app.features.gm import circulation as circ
from app.features.gm import rules
from app.features.gm.router import _allow, _get, _save, ensure_seed, view

router = APIRouter(prefix="/v1/gm", tags=["gm-trade"])
SALE_CAN = {"sell": {"factory", "operator"}, "offer": {"recycler", "operator"}, "accept": {"operator"},
            "reply": {"recycler", "operator"}}


def _can(me: Company, action: str) -> None:
    if me.role not in SALE_CAN[action]:
        raise HTTPException(403, "이 역할로는 사용할 수 없음")


def _rule(fn, *a):
    try:
        return fn(*a)
    except rules.RuleError as e:
        raise HTTPException(400, str(e))


def _grade(session: Session, me: Company, lot: dict):
    result = call_flow(session, "gm_grade", {"lot": lot}, [me.id])
    agent = next((r for r in result.results if r.agent_id == "gm_grade"), None) if result else None
    if agent is None or not agent.ok:
        raise HTTPException(503, "판매 판정을 지금 사용할 수 없음")
    return agent.data, [fact_view(c) for c in result.public_claims]


def _lot(row: GmShipment, lot_id: str) -> tuple[dict, dict]:
    r = copy.deepcopy(row.data)
    s = next((x for x in r.get("sales") or [] if x["id"] == lot_id), None)
    if s is None:
        raise HTTPException(404, "판매 묶음을 찾을 수 없음")
    return r, s


# ── 판매 ──
@router.post("/shipments/{sid}/sales/check")
def check_sale(sid: str, body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """저장하지 않고 판정만: 팔 수 있나, 무엇을 하면 팔 수 있나, 누가 살 만한가."""
    _get(session, sid)
    lot = _rule(circ.check_lot, body.get("lot") or body)
    data, facts = _grade(session, me, lot)
    return {**data, "facts": facts}


@router.post("/shipments/{sid}/sales", status_code=201)
def add_sale(sid: str, body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _can(me, "sell")
    row = _get(session, sid)
    lot = _rule(circ.check_lot, body.get("lot") or body)
    data, facts = _grade(session, me, lot)
    if data["grade"] == "처리 대상":
        raise HTTPException(409, "판매 대상이 아님: " + ", ".join(data["blockers"]))
    r = copy.deepcopy(row.data)
    sales = r.setdefault("sales", [])
    sales.append({**lot, "id": circ.next_id(sales, "S"), "grade": data["grade"], "fixes": data["fixes"],
                  "buyers": [b["name"] for b in data["buyers"]], "status": "offering", "offers": [], "acceptedOffer": None,
                  "createdAt": iso(now())})
    out = _save(session, row, r, me, f"판매 등록 {sales[-1]['id']}", body.get("version"))
    return {**out, "facts": facts}


@router.post("/shipments/{sid}/sales/{lot_id}/offers", status_code=201)
def offer(sid: str, lot_id: str, body: dict = Body(...), me: Company = Depends(current_company),
          session: Session = Depends(get_session)):
    """매입 제안. 업체는 자기 이름으로, 운영은 전화·문자로 받은 제안을 업체 이름과 함께 대신 입력."""
    _can(me, "offer")
    row = _get(session, sid)
    r, s = _lot(row, lot_id)
    if s["status"] != "offering":
        raise HTTPException(409, "이미 판매가 끝난 묶음")
    o = _rule(circ.check_offer, {**body, "buyer": me.name if me.role == "recycler" else body.get("buyer")})
    if circ.is_past(o["validUntil"], rules.today()):
        raise HTTPException(400, "제안 유효일이 이미 지남")
    s["offers"].append({**o, "id": circ.next_id(s["offers"], "O"), "status": "open", "by": ROLE(me), "at": iso(now()),
                        "money": circ.lot_money(r, s, o["price"])})
    return _save(session, row, r, me, f"매입 제안 {lot_id}", body.get("version"))


@router.post("/shipments/{sid}/sales/{lot_id}/accept")
def accept(sid: str, lot_id: str, body: dict = Body(...), me: Company = Depends(current_company),
           session: Session = Depends(get_session)):
    _can(me, "accept")
    row = _get(session, sid)
    r, s = _lot(row, lot_id)
    if s["status"] != "offering":
        raise HTTPException(409, "이미 판매가 끝난 묶음")
    o = next((x for x in s["offers"] if x["id"] == body.get("offer")), None)
    if o is None:
        raise HTTPException(404, "제안을 찾을 수 없음")
    if not circ.offer_open(o, rules.today()):
        raise HTTPException(409, "유효기간이 지났거나 닫힌 제안")
    for x in s["offers"]:
        x["status"] = "accepted" if x is o else "declined"
    s["status"], s["acceptedOffer"] = "sold", o["id"]
    return _save(session, row, r, me, f"판매 확정 {lot_id}", body.get("version"))


@router.post("/shipments/{sid}/sales/{lot_id}/preview")
def preview_sale(sid: str, lot_id: str, body: dict = Body(...), me: Company = Depends(current_company),
                 session: Session = Depends(get_session)):
    r, s = _lot(_get(session, sid), lot_id)
    return _rule(circ.lot_money, r, s, _rule(rules.won, body.get("price"), "구매가(원/톤)"))


@router.get("/market")
def market(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """구매자용: 지금 판매 중인 폐어구 원료 묶음."""
    ensure_seed(session)
    out = []
    for row in session.query(GmShipment).all():
        for s in row.data.get("sales") or []:
            if s["status"] == "offering":
                best = max((o["price"] for o in s["offers"] if circ.offer_open(o, rules.today())), default=None)
                out.append({"shipment": row.id, "departure": row.data["departure"], "lot": s, "bestOffer": best,
                            "mine": [o for o in s["offers"] if o["buyer"] == me.name]})
    return sorted(out, key=lambda x: x["departure"])


# ── 업체 회신 ──
@router.post("/shipments/{sid}/quotes/{idx}/reply")
def reply(sid: str, idx: int, body: dict = Body(...), me: Company = Depends(current_company),
          session: Session = Depends(get_session)):
    """지정 처리업체가 인수 조건을 직접 보낸다. 등록 단계에서만. 회신한 조건에는 회신 표시가 붙는다."""
    _can(me, "reply")
    row = _get(session, sid)
    if row.status != "registered":
        raise HTTPException(409, "인수 협의 단계에서만 회신할 수 있음")
    r = copy.deepcopy(row.data)
    if not 0 <= idx < len(r["quotes"]):
        raise HTTPException(404, "인수 조건을 찾을 수 없음")
    q = r["quotes"][idx]
    for k in ("condition", "expected", "rate", "residualRate", "extra", "validUntil"):
        if body.get(k) is not None:
            q[k] = body[k]
    q |= {"repliedBy": me.name if me.role == "recycler" else str(body.get("buyer") or r["facility"]), "repliedAt": iso(now())}
    return _save(session, row, r, me, f"업체 회신 {q['label']}", body.get("version"))


# ── 서류 ──
def _docs(session: Session, me: Company, sid: str):
    shipment = view(_get(session, sid))
    scans = [{"id": s.id, "status": s.status, "fields": s.result.get("fields")}
             for s in session.query(GmScan).filter_by(shipment_id=sid).order_by(GmScan.id.desc())]
    result = call_flow(session, "gm_docs", {"shipment": shipment, "scans": scans}, [me.id])
    agent = next((r for r in result.results if r.agent_id == "gm_docs"), None) if result else None
    if agent is None or not agent.ok:
        raise HTTPException(503, "서류 안내를 지금 사용할 수 없음")
    return shipment, agent.data["docs"], result


@router.get("/shipments/{sid}/documents")
def documents(sid: str, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _, docs, result = _docs(session, me, sid)
    return {"id": sid, "docs": docs, "facts": [fact_view(c) for c in result.public_claims], "summary": result.summary,
            "run_id": result.run_id}


@router.get("/shipments/{sid}/documents/{key}", response_class=HTMLResponse)
def document_html(sid: str, key: str, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """인쇄용 초안. 빈칸은 비워 두고 '초안'을 표시한다."""
    shipment, docs, _ = _docs(session, me, sid)
    d = next((x for x in docs if x["key"] == key), None)
    if d is None or not d["fields"]:
        raise HTTPException(404, "초안을 만들 수 있는 서류가 아님")
    e = html.escape
    rows = "".join(f"<tr><th>{e(k)}</th><td>{'' if v in (None, '') else e(f'{v:,}' if isinstance(v, (int, float)) else str(v))}</td></tr>"
                   for k, v in d["fields"].items())
    return (f"<!doctype html><html lang='ko'><meta charset='utf-8'><title>{e(d['name'])} 초안 {e(sid)}</title>"
            "<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#111}"
            "h1{font-size:22px;margin:0 0 4px}p{margin:4px 0;color:#444;font-size:14px}table{width:100%;border-collapse:collapse;margin-top:16px}"
            "th,td{border:1px solid #999;padding:10px;text-align:left;font-size:15px}th{width:38%;background:#f3f5f7}"
            ".mark{display:inline-block;border:2px solid #c0392b;color:#c0392b;padding:2px 8px;font-weight:700;margin-bottom:12px}"
            "@media print{.mark{border-color:#000;color:#000}}</style>"
            f"<div class='mark'>초안, 그물마중 자동 작성</div><h1>{e(d['name'])}</h1>"
            f"<p>근거: {e(d['basis'])}</p><p>작성, 제출: {e(d['owner'])}, 시점: {e(d['when'])}</p><p>반출번호 {e(sid)}</p>"
            f"<table>{rows}</table><p style='margin-top:12px'>{e(d['note'])}</p>"
            "<p>빈칸은 담당자가 원본과 대조해 직접 적는다. 제출과 서명은 서류의 주인이 한다.</p></html>")


def ROLE(me: Company) -> str:
    return {"factory": "집하장", "operator": "운영", "recycler": "처리업체"}.get(me.role, me.role)
