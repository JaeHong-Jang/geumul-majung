"""⑬ want_match(판매 매물 맞추기): 구매 희망(재질, 수량, 희망 가격)을 지금 판매 중인 같은 재질 매물과 맞춰 본다.
LLM을 쓰지 않는다. 가격이 맞는지, 수량이 되는지, 거리를 코드가 비교해 순서를 정한다.
"""
from __future__ import annotations

from app.agents._common import claim, ev
from app.agents.sorting.intake import display
from app.contracts import AgentResult
from app.tools.calc import canon_material, fmt

ID = "want_match"
TOP = 5


def want_of(ctx: dict) -> dict:
    """화면에서 넘긴 구매 희망 값이 먼저, 없으면 말 입력 정리(want_intake)가 채운 칸."""
    spoken = (((ctx.get("results") or {}).get("want_intake") or {}).get("data") or {}).get("fields") or {}
    want = ctx.get("want") or {}
    pick = lambda k: want.get(k) if want.get(k) is not None else spoken.get(k)
    return {"material": pick("material"), "qty_kg": pick("qty_kg"),
            "price_min": pick("price_min_krw_per_kg"), "price_max": pick("price_max_krw_per_kg")}


def fit(l: dict, qty: float | None, hi: float | None) -> dict:
    price, kg, km = float(l["price_krw_per_kg"]), float(l["total_kg"]), l.get("distance_km")
    price_fit = None if hi is None else ("in" if price <= hi else "over")
    qty_fit = None if not qty else ("enough" if kg >= qty else "part")
    reasons = []
    if price_fit == "in":
        reasons.append("희망 상한가 안")
    elif price_fit == "over":
        reasons.append(f"상한가보다 {fmt(price - hi)}원/kg 높음")
    if qty_fit == "enough":
        reasons.append("희망 수량 충분")
    elif qty_fit == "part":
        reasons.append(f"희망 수량의 {round(kg / qty * 100)}%")
    if km is not None:
        reasons.append(f"{fmt(km)} km")
    return {"id": l["id"], "price_fit": price_fit, "qty_fit": qty_fit, "reasons": reasons,
            "_order": (price_fit == "over", qty_fit == "part", km if km is not None else 1e9, price)}


def run(ctx: dict, llm=None) -> AgentResult:
    w = want_of(ctx)
    data: dict = {"material": w["material"], "count": 0, "fit_all": 0, "matches": []}
    if not w["material"]:
        return AgentResult(agent_id=ID, data=data)
    want = canon_material(w["material"])
    same = [l for l in ctx.get("listings") or [] if l.get("target_material") and canon_material(l["target_material"]) == want]
    rows = sorted((fit(l, w["qty_kg"], w["price_max"]) for l in same), key=lambda r: r["_order"])
    for r in rows:
        r.pop("_order")
    full = [r for r in rows if r["price_fit"] != "over" and r["qty_fit"] != "part"]
    data |= {"count": len(rows), "fit_all": len(full), "matches": rows[:TOP]}
    name = display(want)
    said = ev("input", "want", "구매 희망 재질, 수량, 희망 가격")
    how = ev("calc", "게시 중인 같은 재질 매물의 단가, 무게, 거리를 희망 상한가, 수량과 비교")
    if not rows:
        claims = [claim(ID, f"지금 판매 중인 {name} 매물 없음", "fact", said, how)]
    else:
        claims = [claim(ID, f"판매 중 {name} 매물 {len(rows)}건, 가격과 수량이 모두 맞는 매물 {len(full)}건", "fact", said, how)]
        best = next(l for l in same if l["id"] == rows[0]["id"])
        claims.append(claim(ID, f"가장 맞는 매물: {best.get('factory_name') or '판매 공장'} {fmt(best['total_kg'])} kg, "
                                f"{fmt(best['price_krw_per_kg'])}원/kg ({', '.join(rows[0]['reasons'])})", "estimate", said, how))
    return AgentResult(agent_id=ID, claims=claims, data=data)
