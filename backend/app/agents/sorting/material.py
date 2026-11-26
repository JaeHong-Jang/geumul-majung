"""⑩ material(재질 추천): 품목 코드에 맞는 주 재질 후보를 근거와 함께 낸다. LLM을 쓰지 않는다.
근거 세 가지: 품목 코드에 해당하는 재질(팀 가정 code_materials), 내 지난 등록(같은 품목), 장터 등록 물량(같은 품목).
사진으로 재질을 맞히지 않는다(PP와 PE는 사진으로 구분 안 됨).
"""
from __future__ import annotations

from app.agents._common import claim, ev
from app.agents.sorting.intake import display
from app.contracts import AgentResult
from app.tools.calc import canon_material, fmt
from app.tools.data import assumptions, waste_name

ID = "material"
MAX_CANDIDATES = 5


def run(ctx: dict, llm=None) -> AgentResult:
    intake = ((ctx.get("results") or {}).get("intake") or {}).get("data") or {}
    spoken = (intake.get("fields") or {})
    code = ctx.get("waste_code") or spoken.get("waste_code")
    data = {"waste_code": code, "candidates": [], "auto": None}
    if not code:
        return AgentResult(agent_id=ID, data=data)
    mapped = [canon_material(m) for m in assumptions().get("code_materials", {}).get(code, [])]
    history = {canon_material(m): n for m, n in ((ctx.get("history") or {}).get(code) or {}).items() if m}
    market = {canon_material(m): kg for m, kg in ((ctx.get("market") or {}).get(code) or {}).items() if m}

    names = list(dict.fromkeys([*history, *mapped, *market]))
    single = len(mapped) == 1

    def rank(m: str):
        return (-history.get(m, 0), -(single and m in mapped), -market.get(m, 0.0),
                mapped.index(m) if m in mapped else len(mapped))

    out = []
    for m in sorted(names, key=rank)[:MAX_CANDIDATES]:
        reasons = []
        if history.get(m):
            reasons.append(f"지난 등록 {history[m]}회")
        if market.get(m):
            reasons.append(f"장터 등록 물량 {fmt(round(market[m]))} kg")
        if m in mapped:
            reasons.append("이 품목의 유일한 재질" if single else "이 품목에 해당하는 재질")
        out.append({"material": display(m), "reasons": reasons})
    data["candidates"] = out

    top = sorted(names, key=rank)[0] if names else None
    has_basis = top is not None and (history.get(top) or market.get(top) or single)
    if has_basis and not spoken.get("material"):          # 사람이 말한 재질은 덮지 않는다
        data["auto"] = display(top)

    name = waste_name(code) or code
    if not out:
        claims = [claim(ID, f"{name}에 맞는 재질 기록 없음, 직접 입력 필요", "question", ev("input", "waste_code"))]
    else:
        # 화면 단계 문장은 앞 3개만, 근거가 있으면 '해당 재질' 같은 일반 이유는 뺀다(전체는 후보 칩에)
        def short(c):
            specific = [r for r in c["reasons"] if "해당하는 재질" not in r]
            return f"{c['material']}({', '.join(specific)})" if specific else c["material"]
        listed = ", ".join(short(c) for c in out[:3]) + (f" 외 {len(out) - 3}개" if len(out) > 3 else "")
        evidence = [ev("input", "waste_code", "고른 품목")]
        if history:
            evidence.append(ev("calc", "my_bags", "내 지난 마대 등록 횟수"))
        if market:
            evidence.append(ev("calc", "market_volumes", "장터 등록 물량 합계"))
        if mapped:
            evidence.append(ev("assumption", "code_materials(팀 가정)", "품목별 해당 재질"))
        claims = [claim(ID, f"재질 후보: {listed}", "estimate", *evidence)]
        if data["auto"]:
            claims.append(claim(ID, f"주 재질 {data['auto']} 자동 입력, 다르면 후보에서 선택", "estimate", *evidence))
    return AgentResult(agent_id=ID, claims=claims, data=data)
