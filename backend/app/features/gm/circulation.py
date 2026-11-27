"""자원 순환 판매: 반출분에서 떼어 놓은 묶음(예: 뜸줄을 뗀 나일론 자망 1톤)을 재활용업체에 판다.
판매 묶음은 반출 기록의 `sales`에 따로 둔다. 기존 처리 흐름(quotes, actual)과 계산은 건드리지 않는다.

돈의 흐름(대학창업대전/01_전략/그물마중 수익 구조.md 4절):
  매각 대금    = 판매 톤 × 구매가(원/톤)                       ← 구매자가 냄
  피한 처리비  = 판매 톤 × 기존 처리 단가(baseRate)             ← 처리 흐름으로 안 가서 아낀 돈
  준비비       = 판매 톤 × (섬에서 떼어 놓는 인건비 + 추가 운송비)  [팀 가정]
  우리 수수료  = 매각 대금 × 매각 수수료율 + 피한 처리비 × 절감 수수료율 [팀 가정, 문서 4절과 같은 기준]
  집하장 몫    = 매각 대금 + 피한 처리비 - 준비비 - 우리 수수료"""
from __future__ import annotations

from datetime import date

from app.features.gm.rules import RuleError, amount, calendar_day, js_round, positive_weight, require_text, won

# 팀 가정. 실증에서 재서 바꾼다(수익 구조 4절: 톤당 8시간 × 21,849원, 추가 운송 8만 원, 수수료 10%·15%)
DEFAULTS = {"prepRate": 175000, "haulRate": 80000, "saleFeePct": 10, "savingFeePct": 15}
ORIGINS = ("쓰다가 배출", "조업 중 인양", "침적 수거", "해안 수거", "모름")
GEAR = ("폐자망", "폐어망", "폐로프", "폐통발 그물", "폐부표", "혼합 그물")
ATTACH = ("뜸줄", "발줄", "납 봉돌", "부표", "철 틀", "금속 고리")
LOT_FIELDS = ("kind", "material", "weight", "origin", "separated", "intact", "attachments", "note")


def check_lot(lot: dict) -> dict:
    """판매 묶음 칸 검사. 틀리면 RuleError."""
    if not isinstance(lot, dict):
        raise RuleError("판매 묶음 확인 필요")
    if lot.get("kind") not in GEAR:
        raise RuleError("어구 종류: " + ", ".join(GEAR) + " 중 하나")
    require_text(lot.get("material"), "재질")
    positive_weight(lot.get("weight"), "판매 묶음 중량")
    if lot.get("origin") not in ORIGINS:
        raise RuleError("나온 곳: " + ", ".join(ORIGINS) + " 중 하나")
    if not isinstance(lot.get("separated"), bool):
        raise RuleError("종류별로 떼어 놓았는지 선택 필요")
    if lot.get("intact") not in (True, False, None):
        raise RuleError("절단 여부 확인 필요")
    att = lot.get("attachments") or []
    if not isinstance(att, list) or any(a not in ATTACH for a in att):
        raise RuleError("남은 부착물: " + ", ".join(ATTACH) + " 중에서 선택")
    return {k: lot.get(k) for k in LOT_FIELDS} | {"attachments": att}


def check_offer(o: dict) -> dict:
    require_text(o.get("buyer"), "구매 업체")
    price = won(o.get("price"), "구매가(원/톤)")   # 0원 = 무상 인수(처리비만 아껴도 남는 경우, 수익 구조 문서 4절)
    calendar_day(o.get("validUntil"), "제안 유효일")
    return {"buyer": o["buyer"].strip(), "price": price, "validUntil": o["validUntil"],
            "condition": str(o.get("condition") or "").strip()[:200]}


def lot_money(record: dict, lot: dict, price: int) -> dict:
    """판매 묶음 하나의 돈 계산(원). 같은 식을 화면 미리보기와 정산에 쓴다."""
    a = {**DEFAULTS, **(record.get("circ") or {})}
    t = lot["weight"]
    for k in ("prepRate", "haulRate"):
        won(a[k], k)
    amount(a["saleFeePct"], "매각 수수료율")
    amount(a["savingFeePct"], "절감 수수료율")
    revenue = js_round(t * price)
    avoided = js_round(t * won(record.get("baseRate"), "기존 처리 단가"))
    prep = js_round(t * a["prepRate"]) + js_round(t * a["haulRate"])
    sale_fee = js_round(revenue * a["saleFeePct"] / 100)
    saving_fee = js_round(avoided * a["savingFeePct"] / 100)    # 수익 구조 문서 4절: 절감액(안 쓰게 된 처리비)의 15%
    return {"tons": t, "revenue": revenue, "avoided": avoided, "prep": prep, "saleFee": sale_fee, "savingFee": saving_fee,
            "teamFee": sale_fee + saving_fee, "siteGain": revenue + avoided - prep - sale_fee - saving_fee}


def circulation(record: dict) -> dict:
    """반출 한 건의 판매 합계. 팔린(sold) 묶음만 센다."""
    sold = [s for s in record.get("sales") or [] if s.get("status") == "sold"]
    keys = ("tons", "revenue", "avoided", "prep", "saleFee", "savingFee", "teamFee", "siteGain")
    tot = dict.fromkeys(keys, 0)
    for s in sold:
        offer = next(o for o in s["offers"] if o["id"] == s["acceptedOffer"])
        for k, v in lot_money(record, s, offer["price"]).items():
            tot[k] += v
    tot["tons"] = round(tot["tons"], 3)
    return {"lots": len(sold), **tot}


def offer_open(o: dict, today: str) -> bool:
    return o.get("status") == "open" and o["validUntil"] >= today


def next_id(items: list[dict], prefix: str) -> str:
    n = max((int(str(x.get("id", ""))[len(prefix):]) for x in items if str(x.get("id", "")).startswith(prefix)
             and str(x.get("id", ""))[len(prefix):].isdigit()), default=0)
    return f"{prefix}{n + 1}"


def is_past(day: str, today: str) -> bool:
    return date.fromisoformat(day) < date.fromisoformat(today)
