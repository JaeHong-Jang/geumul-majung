"""판매 공장에서 등록한 발생 품목 중 돈이 되는 것부터 알려 준다.
양(발생량)은 쓰지 않는다. kg당 공개 시세와 지금 올라온 구매 희망 수로만 판단한다."""
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.db.models import BuyRequest, Company
from app.features.market.metals import metal_reference
from app.features.market.service import latest_prices
from app.tools.calc import canon_material, price_item_for
from app.tools.data import assumptions

# 소각으로 가는 품목(플라스틱, 종이, 목재). 금속은 원래 사 가는 품목이라 소각비를 붙이지 않는다
BURNABLE = {"51-03-01", "51-28-02", "51-20-23"}


def _wants(session: Session) -> dict[str, int]:
    """열린 구매 희망을 재질별로 센다(같은 구매자는 한 번)."""
    seen: dict[str, set[int]] = {}
    for material, recycler_id in session.query(BuyRequest.material, BuyRequest.recycler_id).filter(BuyRequest.status == "open"):
        seen.setdefault(canon_material(material), set()).add(recycler_id)
    return {k: len(v) for k, v in seen.items()}


def byproduct_recommendations(session: Session, company: Company) -> list[dict]:
    prices = {row["item"]: row for row in latest_prices()}
    names = waste_names()
    a = assumptions()
    low = a["low_value_krw_per_kg"]
    incin = a["incineration_krw_per_ton"]
    wants = _wants(session)
    seen, result = set(), []
    for row in company.byproducts or []:
        code, material = row["code"], row["material"]
        key = (code, canon_material(material))
        if key in seen:
            continue
        seen.add(key)
        # 국내 공개 시세가 먼저, 없으면 비철금속 국제 가격. 합금은 가격 대신 기준 금속(reference)만 붙인다
        market = prices.get(price_item_for(material)) or metal_reference(material)
        reference = market if market and market.get("alloy") else None
        if reference:
            market = None
        price = market["price"] if market else None
        n = wants.get(canon_material(material), 0)
        if price is None and not n and not reference:
            verdict, reason = "quote", "공개 시세 없음, 매입 견적 확인 필요"
        elif n or reference or price >= low:
            verdict = "sell"
            if n:
                reason = f"구매 희망 {n}곳, 판매 추천"
            elif reference:
                reason = f"{reference['metal']} 가격 연동 고가 품목, 매입 견적 비교 후 판매"
            else:
                reason = "국제 금속 가격 기준 판매 추천" if market.get("intl") else "시세 기준 판매 추천"
        else:
            verdict = "bundle"
            reason = "kg당 단가가 낮아 단독 판매 어려움, 근처 공장과 공동판매로 모으기"
            if code in BURNABLE:
                reason += f", 소각하면 톤당 약 {incin['low'] / 10000:.1f}만~{incin['high'] / 10000:.1f}만 원 지출"
        result.append({"code": code, "material": material, "waste_name": names.get(code, code),
                       "market": dict(market) if market else None, "reference": reference, "wants": n, "verdict": verdict, "reason": reason})
    order = {"sell": 0, "bundle": 1, "quote": 2}
    # 판매 추천 먼저, 그 안에서 kg당 값이 높은 순(합금은 최소 함량 기준), 같으면 구매 희망이 많은 순
    value = lambda r: r["market"]["price"] if r["market"] else (r["reference"]["sort_price"] if r["reference"] else 0)  # noqa: E731
    result.sort(key=lambda r: (order[r["verdict"]], -value(r), -r["wants"], r["code"], r["material"]))
    valued = [r for r in result if r["verdict"] == "sell" and value(r)]
    if len(result) > 1 and valued:
        valued[0]["top"] = True
        valued[0]["reason"] = "우리 공장 품목 중 kg당 가장 비싼 품목, " + valued[0]["reason"]
    return result
