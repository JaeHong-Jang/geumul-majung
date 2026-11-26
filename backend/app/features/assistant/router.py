"""AI 대화: 질문 한 번에 답 한 번. 근거 항목은 코드가 데이터에서 만들고 LLM은 그 항목만으로 답을 쓴다(계약 21.3)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_company
from app.core.util import LEGAL_NOTE
from app.db.models import Company
from app.db.session import get_session
from app.agents.assistant import law_source_text
from app.features._shared.flows import call_flow
from app.features.assistant.schemas import ChatIn
from app.features.orders.service import list_my_orders
from app.features.orders.state import state_ko
from app.tools.data import law_plain

router = APIRouter(prefix="/v1")

MAX_MESSAGE = 300
NONE_ANSWER = "시세, 등급, 법 조문, 내 거래, 앱 사용 방법 질문 가능, 그 밖의 내용은 근거가 없어 답하지 않음"
TEMPLATE_ANSWER = "데이터에서 확인한 내용"


def fact_view(c) -> dict:
    """법 근거 항목은 쉬운 문구(headline, text)와 조문 원문(detail)으로 나눠 보낸다."""
    view = {"text": c.text, "level": c.level, "evidence": [{"kind": e.kind, "ref": e.ref, "label": e.label} for e in c.evidence]}
    law = next((e.ref for e in c.evidence if e.kind == "law"), None)
    if law:
        view.update(headline=law_plain()[law]["headline"], text=law_plain()[law]["body"], detail=law_source_text(law))
    return view


@router.post("/assistant/chat")
def chat(body: ChatIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    question = body.message.strip()
    if not 1 <= len(question) <= MAX_MESSAGE:
        raise HTTPException(422, f"질문은 공백을 뺀 1~{MAX_MESSAGE}자로 입력 필요")
    orders = None if me.role == "operator" else [      # 운영자의 목록은 전체 주문이라 '내 주문'이 아니다
        {"id": o["id"], "status": state_ko(o["status"]), "waste_name": o["waste_name"], "total_kg": o["total_kg"]}
        for o in list_my_orders(session, me)]
    result = call_flow(session, "assistant_chat", {"question": question, "role": me.role, "orders": orders}, [me.id])
    if result is None:
        raise HTTPException(503, "AI 대화를 지금 사용할 수 없음")
    agent = next((r for r in result.results if r.agent_id == "assistant"), None)
    topic_of = agent.data.get("claim_topics", []) if agent else []
    blocked = [c.blocked for c in agent.claims] if agent else []
    topics = list(dict.fromkeys(t for t, b in zip(topic_of, blocked) if not b))
    facts = [fact_view(c) for c in result.public_claims]
    if not facts:
        return {"answer": NONE_ANSWER, "source": "none", "topics": [], "facts": [], "legal_note": None, "run_id": result.run_id}
    answer = result.summary if result.summary_source == "llm" else TEMPLATE_ANSWER
    return {"answer": answer, "source": result.summary_source, "topics": topics, "facts": facts,
            "legal_note": LEGAL_NOTE if "law" in topics else None, "run_id": result.run_id}
