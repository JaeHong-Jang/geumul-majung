"""⑫ want_price(희망가 추천): 구매 희망의 재질로 공개 재활용 시세와 지금 판매 중인 매물 가격을 보고 희망 가격 범위를 낸다.
LLM을 쓰지 않는다. 말로 가격을 정했으면 덮지 않고 시세와 비교만 한다.
"""
from __future__ import annotations

from app.agents._common import claim, ev
from app.agents.sorting.intake import display
from app.contracts import AgentResult
from app.tools.calc import canon_material, fmt, latest_price, price_item_for

ID = "want_price"


def round_price(x: float) -> int:
    """판매 화면 추천가와 같은 반올림(1,000원 이상은 50원, 아래는 10원 단위)."""
    step = 50 if x >= 1000 else 10
    return int(round(x / step) * step)


def run(ctx: dict, llm=None) -> AgentResult:
    spoken = (((ctx.get("results") or {}).get("want_intake") or {}).get("data") or {}).get("fields") or {}
    material = ctx.get("material") or spoken.get("material")
    data: dict = {"material": material, "auto": None, "market": None, "listings": None}
    if not material:
        return AgentResult(agent_id=ID, data=data)
    claims = []
    item = price_item_for(material)
    p = latest_price(item) if item else None
    if p:
        low, high = sorted((round_price(p["low"]), round_price(p["high"])))
        data["market"] = {"item": p["item"], "date": p["date"], "price": p["price"], "low": low, "high": high}
        claims.append(claim(ID, f"{p['item']} 최근 시세({p['date']}) 지역별 {fmt(p['low'])}~{fmt(p['high'])}원/kg (환경공단 재활용 시세, 부가세 포함, 물류비 제외)",
                            "fact", ev("dataset", p["source"], "환경공단 재활용 시세")))
    else:
        claims.append(claim(ID, f"{display(canon_material(material))}에 맞는 공개 시세 없음", "question", ev("input", "material")))

    prices = [float(x["price_krw_per_kg"]) for x in ctx.get("listings") or [] if x.get("price_krw_per_kg")]
    if prices:
        data["listings"] = {"count": len(prices), "cheapest": min(prices)}
        claims.append(claim(ID, f"지금 판매 중 {len(prices)}건, 최저 {fmt(min(prices))}원/kg", "fact",
                            ev("calc", "게시 중인 같은 재질 매물 단가 최솟값")))

    said_lo, said_hi = spoken.get("price_min_krw_per_kg"), spoken.get("price_max_krw_per_kg")
    if said_lo is not None and p:
        pos = "아래" if said_hi < p["low"] else "위" if said_lo > p["high"] else "안"
        claims.append(claim(ID, f"말한 희망 가격은 최근 시세 범위의 {pos}, 그대로 둠", "estimate",
                            ev("input", "want_intake.price"), ev("calc", "희망 가격과 시세 범위 비교"), ev("dataset", p["source"])))
    elif said_lo is None and p:
        data["auto"] = {"min": low, "max": high}
        claims.append(claim(ID, f"희망 가격 {fmt(low)}~{fmt(high)}원/kg 자동 입력, 시세 지역별 범위 기준", "estimate",
                            ev("dataset", p["source"]), ev("calc", "지역별 최저, 최고 시세를 판매 화면과 같은 단위로 반올림")))
    return AgentResult(agent_id=ID, claims=claims, data=data)
