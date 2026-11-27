"""그물마중 AI 기능(/v1/gm). 하네스 흐름을 부르고 게이트를 통과한 주장만 화면에 보낸다.
- 말로 반출 등록: 음성(서버 안 Whisper) 또는 글 → gm_intake → 등록 칸 초안
- 반출 법 점검: gm_check → 조문 근거가 붙은 점검 목록
- 법 질문: 기존 대화 도우미(assistant_chat) → 폐어구 조문 57개에서 답
- 계량증명서 읽기: 사진 → gm_scan(사진 읽기 모델 + 코드 검산) → 초안. 확인 전에는 정산에 안 들어감"""
import base64
import binascii
import re

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_company
from app.core.util import LEGAL_NOTE, iso, now
from app.db.models import Company, GmScan
from app.db.session import get_session
from app.features._shared.flows import call_flow
from app.features._shared.voice import IntakeIn, agent_steps, hear, stt_status
from app.features.assistant.router import NONE_ANSWER, fact_view
from app.features.gm.router import _allow, _get, view
from app.llm import get_vision_provider, provider_info

router = APIRouter(prefix="/v1/gm", tags=["gm-ai"])

MAX_IMAGE = 6 * 1024 * 1024
IMAGE_RE = re.compile(r"^data:(image/(?:jpeg|png|webp|gif));base64,(.+)$", re.S)


def _facts(result) -> list[dict]:
    return [fact_view(c) for c in result.public_claims]


def _need(result):
    if result is None:
        raise HTTPException(503, "AI 작업을 지금 사용할 수 없음")
    return result


@router.get("/ai/status")
def ai_status(me: Company = Depends(current_company)):
    """화면이 버튼을 보일지 정한다. stt=말로 입력, vision=사진 읽기, llm=요약 문장."""
    v = get_vision_provider()
    return {**stt_status(), "vision": v is not None, "vision_model": getattr(v, "model", None), "llm": provider_info()}


@router.post("/intake")
def intake(body: IntakeIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _allow(me, "create")
    text, steps = hear(body)
    result = _need(call_flow(session, "gm_intake", {"text": text}, [me.id]))
    agent = next((r for r in result.results if r.agent_id == "gm_intake"), None)
    return {"heard": text, "fields": (agent.data.get("fields") if agent else {}) or {}, "facts": _facts(result),
            "summary": result.summary, "steps": steps + agent_steps(result), "run_id": result.run_id}


@router.get("/shipments/{sid}/checklist")
def checklist(sid: str, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    shipment = view(_get(session, sid))
    result = _need(call_flow(session, "gm_check", {"shipment": shipment}, [me.id]))
    agent = next((r for r in result.results if r.agent_id == "gm_check"), None)
    return {"id": sid, "items": (agent.data.get("items") if agent else []) or [], "facts": _facts(result),
            "summary": result.summary, "summary_source": result.summary_source, "legal_note": LEGAL_NOTE,
            "steps": agent_steps(result), "run_id": result.run_id}


@router.post("/ask")
def ask(body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """법 질문. 답은 조문마다 써 둔 쉬운 문구에서만 나온다(지어낸 조문 없음)."""
    q = str(body.get("message") or "").strip()
    if not 1 <= len(q) <= 300:
        raise HTTPException(400, "질문은 1~300자로 입력 필요")
    result = _need(call_flow(session, "assistant_chat", {"question": q, "role": me.role, "orders": None}, [me.id]))
    facts = [f for f in _facts(result) if any(e["kind"] == "law" for e in f["evidence"])]
    if not facts:
        return {"answer": NONE_ANSWER, "facts": [], "legal_note": None, "run_id": result.run_id}
    answer = result.summary if result.summary_source == "llm" else "관련 조문에서 확인한 내용"
    return {"answer": answer, "source": result.summary_source, "facts": facts, "legal_note": LEGAL_NOTE, "run_id": result.run_id}


def _scan_view(row: GmScan) -> dict:
    return {"id": row.id, "shipment_id": row.shipment_id, "kind": row.kind, "status": row.status, "created_at": iso(row.created_at),
            **{k: row.result.get(k) for k in ("fields", "transcript", "checks", "handwritten", "suggest", "facts", "model")}}


@router.post("/shipments/{sid}/scans", status_code=201)
def scan(sid: str, body: dict = Body(...), me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """계량증명서 사진(data URL) → 초안. 처리업체와 운영만."""
    _allow(me, "settle")
    _get(session, sid)
    m = IMAGE_RE.match(str(body.get("image") or ""))
    if not m:
        raise HTTPException(400, "사진: JPEG, PNG, WEBP, GIF 형식의 data URL 필요")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "사진 내용이 올바르지 않음")
    if not raw or len(raw) > MAX_IMAGE:
        raise HTTPException(400, "사진은 6MB 이하만 가능")
    vision = get_vision_provider()
    if vision is None:
        raise HTTPException(503, "사진 읽기 모델이 꺼져 있음, 계량값을 직접 입력 필요")
    result = _need(call_flow(session, "gm_scan", {"vision": vision, "media_type": m.group(1), "image_b64": m.group(2)}, [me.id]))
    agent = next((r for r in result.results if r.agent_id == "gm_scan"), None)
    if agent is None or not agent.ok:
        raise HTTPException(502, "사진을 읽지 못함, 다시 찍거나 직접 입력 필요")
    row = GmScan(shipment_id=sid, media_type=m.group(1), image=raw, uploaded_by=me.id,
                 result={**agent.data, "facts": _facts(result), "model": vision.model, "run_id": result.run_id})
    session.add(row)
    session.commit()
    return _scan_view(row)


@router.get("/shipments/{sid}/scans")
def list_scans(sid: str, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    _get(session, sid)
    return [_scan_view(r) for r in session.query(GmScan).filter_by(shipment_id=sid).order_by(GmScan.id.desc())]


@router.post("/scans/{scan_id}/confirm")
def confirm_scan(scan_id: int, body: dict = Body(default={}), me: Company = Depends(current_company),
                 session: Session = Depends(get_session)):
    """사람이 원본과 대조해 고친 칸으로 확정한다. 확정해도 정산은 따로 누른다(정산 칸을 채울 값만 돌려줌)."""
    _allow(me, "settle")
    row = session.get(GmScan, scan_id)
    if row is None:
        raise HTTPException(404, "스캔을 찾을 수 없음")
    if row.status != "draft":
        raise HTTPException(409, "이미 확정했거나 버린 스캔")
    fields = {**(row.result.get("fields") or {}), **{k: v for k, v in (body.get("fields") or {}).items()
                                                     if k in (row.result.get("fields") or {})}}
    net = fields.get("net_kg")
    suggest = {"total": round(net / 1000, 3) if isinstance(net, (int, float)) and net > 0 else None,
               "reference": fields.get("cert_no") or (row.result.get("suggest") or {}).get("reference")}
    row.result = {**row.result, "fields": fields, "suggest": suggest, "confirmed_at": iso(now())}
    row.status, row.confirmed_by = "confirmed", me.id
    session.commit()
    return _scan_view(row)
