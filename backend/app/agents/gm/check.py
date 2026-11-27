"""gm_check(반출 법·현장 점검): 반출 한 건을 보고 법 조문 근거가 붙은 점검 목록을 만든다.
법 주장은 law_articles.json id를 근거로 달고, 현장 점검은 기록 값과 계산에서만 나온다. LLM은 쉬운 말 요약만(게이트 통과 시)."""
from __future__ import annotations

from app.agents._common import claim, ev, llm_note
from app.contracts import AgentResult
from app.features.gm.rules import RuleError, calculate, notice_by

ID = "gm_check"


def run(ctx: dict, llm=None) -> AgentResult:
    r = ctx.get("shipment") or {}
    kind = str(r.get("kind") or "")
    checks = r.get("checks") or []
    items: list[dict] = []
    claims = []

    def add(item: str, ok, c):
        claims.append(c)
        items.append({"item": item, "ok": ok, "text": c.text, "law": [e.ref for e in c.evidence if e.kind == "law"]})

    add("waste_class", None, claim(ID, "폐어구는 보통 생활폐기물로 나오고 양이 많으면 사업장폐기물이 될 수 있어, 이 반출 물량의 구분을 보령시에 확인 필요",
                                   "fact", ev("law", "wma-2", "생활폐기물과 사업장폐기물 구분")))
    add("carrier", None, claim(ID, "생활폐기물인 폐어구를 대신 실어 나르려면 시, 도지사에게 신고한 운반자여야 하고, 사업장폐기물이면 수집, 운반업 허가 필요",
                               "fact", ev("law", "wma-rule-66-6-11", "폐어구 운반 신고"), ev("law", "wma-46", "폐기물처리 신고"),
                               ev("law", "wma-25", "폐기물처리업 허가")))
    add("handover", None, claim(ID, "전자인계서(올바로)는 사업장폐기물일 때 쓰므로, 생활폐기물로 나가는 폐어구는 앱의 반출 기록과 계량증명서로 인계 근거를 남김",
                                "fact", ev("law", "wma-18-3", "전자인계서"), ev("law", "wma-2", "폐기물 구분")))
    add("ledger", None, claim(ID, "집하장에 들어오고 나가는 폐어구는 시, 군이 관리대장에 적어야 하므로 이 반출 건의 계량 결과를 대장에 옮길 수 있게 보관",
                              "fact", ev("law", "fa-79", "폐어구 관리대장")))
    if any(w in kind for w in ("통발", "자망")):
        add("deposit", None, claim(ID, "통발과 자망 그물은 보증금 대상이라 보증금 표식이 붙은 어구는 따로 반납해야 보증금을 돌려받음, 반출 전 표식 확인 필요",
                                   "fact", ev("law", "fa-81", "어구 보증금")))

    route = r.get("route") or {}
    if not route or route.get("mode") == "미정":
        add("route", False, claim(ID, "운반 경로(시 용역 바지선, 도 운반선 등)가 정해지지 않아 배편과 하역항 확인 필요", "question",
                                  ev("input", "shipment.route")))
    elif "미확인" in str(route.get("contract") or "") or not route.get("contract"):
        add("contract", False, claim(ID, f"운반 경로({route['mode']}) 물량의 처리 계약이 확인되지 않아 하역 뒤 처리장과 비용 부담 주체 확인 필요",
                                     "question", ev("input", "shipment.route")))
    if route.get("status") in ("결항", "연기"):
        add("sailing", False, claim(ID, f"배편 {route['status']}, 업체 반입 일정과 견적 유효일 다시 확인 필요", "question",
                                    ev("input", "shipment.route.status")))
    rope = "부착 로프 분리" in checks
    quotes = r.get("quotes") or []
    if len(quotes) >= 2 and r.get("weight"):
        try:
            a = calculate(r, quotes[0], r["weight"], quotes[0]["expected"])
            b = calculate(r, quotes[1], r["weight"], quotes[1]["expected"])
            add("rope", rope, claim(
                ID, f"부착 로프를 섬에서 떼면 예상 인수량 {quotes[0]['expected']:g}톤에서 {quotes[1]['expected']:g}톤, "
                    f"고객 예상 절감 {a['savings']:,}원에서 {b['savings']:,}원" + ("" if rope else ", 아직 로프 분리 전"),
                "estimate", ev("input", "shipment.quotes", "두 인수 조건"), ev("calc", "gm.rules.calculate")))
        except (RuleError, KeyError, TypeError):
            pass
    if str(r.get("material") or "") in ("", "미확인", "혼합"):
        add("material", False, claim(ID, "재질이 확인되지 않아 업체 표본 확인 필요, 사진만으로는 나일론과 폴리에틸렌 구분이 어려움",
                                     "question", ev("input", "shipment.material")))
    if (r.get("weight") or 0) > 1 and r.get("departure"):
        add("notice", None, claim(ID, f"1톤 초과 반입이라 업체 반입 신청을 {notice_by(r['departure']).replace('T', ' ')}까지 해야 함",
                                  "fact", ev("input", "shipment.weight, departure"),
                                  ev("assumption", "출항 24시간 전 반입 신청(팀 시제품 운영 규칙)")))
    note = llm_note(ID, llm, [c for c in claims if any(e.kind == "law" for e in c.evidence)], "법 조문을 집하장 담당자에게 쉬운 말로 요약하는 말투로.", ctx)
    if note:
        claims.append(note)
    return AgentResult(agent_id=ID, claims=claims, data={"items": items}, used_llm=bool(note))
