"""⑦ regulation: 주문 때 법 체크리스트(허가, 판매자 운송, 인계서). 법 근거 id 필수. LLM은 조문 요약 문장만."""
from __future__ import annotations

from app.agents._common import claim, ev, llm_note
from app.contracts import AgentResult

ID = "regulation"
L25 = ev("law", "wma-25", "폐기물처리업 허가")
L18_1 = ev("law", "wma-18-1", "사업장폐기물 위탁 의무")
L18_3 = ev("law", "wma-18-3", "전자인계서")
# 폐어구(폐어망, 폐부자, 스티로폼 부표, 생활폐기물로 나온 폐합성수지와 금속). 보통 생활폐기물이라 운반 자격과 인계서 대상이 다르다
GEAR_CODES = {"51-03-08", "51-03-05", "51-03-06", "91-06-01", "91-05-00"}
L66_6 = ev("law", "wma-rule-66-6-11", "어업, 양식업용 폐합성수지 신고 대상")
L46 = ev("law", "wma-46", "폐기물처리 신고")
L2 = ev("law", "wma-2", "생활폐기물과 사업장폐기물 구분")


def run(ctx: dict, llm=None) -> AgentResult:
    listing = ctx.get("listing") or {}
    recycler = ctx.get("recycler") or {}
    code = listing.get("waste_code") or (ctx.get("order") or {}).get("waste_code")
    codes = recycler.get("permit_codes")
    checklist = []
    if codes is None or code is None:
        c1 = claim(ID, "재활용업체의 허가 코드 정보가 없어 폐기물 코드와 맞는지 확인 필요 (법 제25조 허가, 법 제18조 제1항 위탁)", "question",
                   L25, L18_1, ev("input", "recycler.permit_codes"))
    elif code in codes:
        c1 = claim(ID, f"재활용업체 허가 코드에 {code}가 들어 있음, 법 제25조(처리업 허가)와 법 제18조 제1항(허가업자 위탁)에 따라 허가증 원본은 따로 확인 필요",
                   "fact", L25, L18_1, ev("input", "recycler.permit_codes, listing.waste_code"))
    else:
        c1 = claim(ID, f"재활용업체 허가 코드 목록에 {code}가 들어 있지 않음, 법 제25조(처리업 허가)와 법 제18조 제1항(허가업자 위탁) 기준으로 확인 필요",
                   "fact", L25, L18_1, ev("input", "recycler.permit_codes, listing.waste_code"))
    gear = code in GEAR_CODES
    if gear:
        claims = [
            c1,
            claim(ID, "생활폐기물로 배출되는 폐어구를 대신 운반하려면 시, 도지사에게 폐기물처리 신고를 한 자여야 하고 (규칙 제66조 제6항 제11호, 법 제46조), "
                      "사업장폐기물로 배출되면 수집, 운반업 허가가 있어야 함 (법 제25조)", "fact", L66_6, L46, L25),
            claim(ID, "전자인계서 입력 대상은 사업장폐기물이므로 (법 제18조 제3항) 생활폐기물로 배출되는 폐어구에는 적용되지 않음, "
                      "어느 쪽으로 배출되는지는 배출 지자체에 확인 필요 (법 제2조)", "fact", L18_3, L2),
        ]
    else:
        claims = [
            c1,
            claim(ID, "운송은 판매자가 맡으므로 인계서의 운반자 칸도 판매자가 전자인계서에 입력해야 함 (법 제18조 제3항)", "fact", L18_3),
            claim(ID, "인계서는 배출자, 운반자, 처리자가 각자 자기 칸을 전자인계서에 입력해야 함 (법 제18조 제3항), 앱은 올바로에 붙여넣을 값만 정리하고 제출하지 않음",
                  "fact", L18_3),
        ]
    checklist = [{"item": "recycler_permit", "ok": (code in codes) if codes is not None and code else None, "gear": gear},
                 {"item": "seller_transport", "ok": None, "gear": gear}, {"item": "handover_entry", "ok": None, "gear": gear}]
    note = llm_note(ID, llm, claims, "법 조문을 쉬운 말로 요약하는 말투로.", ctx)
    if note:
        claims.append(note)
    return AgentResult(agent_id=ID, claims=claims, data={"checklist": checklist}, used_llm=bool(note))
