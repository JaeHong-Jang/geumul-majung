"""비철금속 스크랩 재질에 국제 금속 가격(한국은행 ECOS, 월평균)을 붙인다. 공개 국내 시세가 없는 재질에만 쓴다.
순수 금속(구리)은 가격을 그대로 보여 주고, 합금(황동, 스테인리스)은 함량만큼만 값이 나가므로 가격을 붙이지 않고 기준 금속만 알린다."""
from app.tools.calc import canon_material, fmt
from app.tools.data import load_json

# 재질 → (기준 금속, 최소 함량, 합금 설명). 합금 설명이 있으면 가격 숫자를 카드에 쓰지 않고,
# 최소 함량 × 기준 금속 가격은 정렬에만 쓴다(황동 구리 60%, 스테인리스 304 니켈 8%)
BRASS = ("구리", 0.6, "황동은 구리 약 60~70% 합금이라 매입가는 구리 가격보다 크게 낮음")
STAINLESS = ("니켈", 0.08, "스테인리스는 니켈 약 8~10% 합금이라 매입가는 니켈 가격보다 크게 낮음")
METAL_OF = {"구리": ("구리", 1.0, None), "동": ("구리", 1.0, None), "납": ("납", 1.0, None),   # 납: 자망 발줄의 납추, 봉돌
           
            "황동": BRASS, "신주": BRASS, "스테인리스": STAINLESS, "스텐": STAINLESS, "sus": STAINLESS}


def metal_reference(material: str) -> dict | None:
    pick = METAL_OF.get(canon_material(material or ""))
    if not pick:
        return None
    metal, share, alloy = pick
    rows = sorted((r for r in load_json("metal_prices.json")["rows"] if r["metal"] == metal), key=lambda r: r["month"])
    if not rows:
        return None
    last = rows[-1]
    prev = rows[-2]["usd_per_ton"] if len(rows) > 1 else None
    basis = (f"국제 {metal} 가격 {last['month']} 월평균 {fmt(last['usd_per_ton'])}달러/톤 × {fmt(last['krw_per_usd'])}원/달러 "
             f"= 약 {fmt(round(last['krw_per_kg']))}원/kg, 정련 금속 가격이라 스크랩 매입가는 순도와 상태에 따라 이보다 낮음")
    return {"item": f"국제 {metal} 가격", "metal": metal, "category": "국제 금속", "price": round(last["krw_per_kg"]), "unit": "원/kg",
            "date": last["month"], "source_id": last.get("source", "D3-METAL"), "intl": True, "alloy": bool(alloy), "sort_price": round(last["krw_per_kg"] * share),
            "change_pct": round((last["usd_per_ton"] / prev - 1) * 100, 1) if prev else None,
            "basis": f"{alloy}. {basis}" if alloy else basis}
