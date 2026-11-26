"""계산 도구: 순도·등급, 구성비, 거리, 시세, 소각비. 숫자는 여기서만 만든다."""
from __future__ import annotations

import math
import re
from typing import Any

from app.tools.data import assumptions, load_json


def _squash(name: str) -> str:
    return " ".join(str(name).strip().lower().split())


def alias_map() -> dict[str, str]:
    """별칭(소문자·공백 정리) → 표준 이름. harness.yaml material_aliases."""
    out: dict[str, str] = {}
    for canon, aliases in (assumptions().get("material_aliases") or {}).items():
        out[_squash(canon)] = _squash(canon)
        for a in aliases:
            out[_squash(a)] = _squash(canon)
    return out


def canon_material(name: str) -> str:
    n = _squash(name)
    return alias_map().get(n, n)


# 표준 재질명 → data/prices.json 품목. 표에 없는 재질은 시세 없음(null). 시세 비교(pricing)와 판매 화면의 시세(market)가 같은 표를 쓴다.
MATERIAL_PRICE_ITEM = {"pp": "PP 압축", "pe": "PE 압축", "pet": "PET 압축",
                       "철": "철스크랩", "알루미늄": "알루미늄캔", "골판지": "폐골판지", "신문지": "폐신문지"}


def known_materials() -> set[str]:
    return set(alias_map().values()) | {m["id"] for m in load_json("materials.json")}


def normalize_items(items: list[dict] | None) -> dict[str, float]:
    """재질명을 별칭 표준화·소문자·공백 정리로 합쳐 {재질: kg}. kg가 숫자가 아니거나 음수면 무시."""
    out: dict[str, float] = {}
    for it in items or []:
        name = canon_material(it.get("material", ""))
        try:
            kg = float(it.get("kg", 0))
        except (TypeError, ValueError):
            continue
        if name and kg > 0:
            out[name] = out.get(name, 0.0) + kg
    return out


def is_hazard(material: str, terms: set[str]) -> bool:
    """영문 위험어는 단어 단위(foil의 oil은 아님), 한글 위험어는 부분 일치(폐유 섞임)."""
    name = str(material).lower()
    words = set(re.findall(r"[a-z]+", name))
    return any((t in words) if t.isascii() else (t in name) for t in terms)


def hazard_terms(text: str, terms: set[str]) -> list[str]:
    """text에서 찾은 위험어(사전에 있는 말만) 목록."""
    name = str(text).lower()
    words = set(re.findall(r"[a-z]+", name))
    return sorted(t for t in terms if ((t in words) if t.isascii() else (t in name)))


UNKNOWN_MATERIAL_REASON = "인식하지 못한 재질이 있음, 재질 이름 확인 필요"   # 대괄호 자리표시자를 화면에 내보내지 않는다(§18)


def compute_grade(target_material: str, items: list[dict] | None, note: str | None = None,
                  confirm_no_hazard: bool = False) -> dict:
    """순도 = target kg / 전체 kg. 품목에 hazard 재질이 있으면 항상 등급 없음.
    메모에 위험어가 있으면 confirm_no_hazard가 아닌 한 등급 보류. 기준은 harness.yaml."""
    a = assumptions()
    th, hazard_set = a["grade_thresholds"], {h.lower() for h in a["hazard_materials"]}
    target = canon_material(target_material)
    mats = normalize_items(items)
    total = sum(mats.values())
    raw = mats.get(target, 0.0) / total if total > 0 else 0.0
    purity = round(raw, 4)
    hazards = sorted({t for i in (items or []) for t in hazard_terms(i.get("material", ""), hazard_set)})
    note_hz = hazard_terms(note or "", hazard_set)
    reasons: list[str] = []
    grade = None
    known = known_materials()
    unknown = [m for m in [target, *mats] if m and m not in known]
    if total <= 0:
        reasons.append("품목 무게가 없어 순도를 계산할 수 없음")
    elif hazards:
        reasons.append("위험 재질 포함: " + ", ".join(hazards))
    elif note_hz and not confirm_no_hazard:
        reasons.append(f"메모에 위험 재질 언급({', '.join(note_hz)}). 품목에 넣거나 위험 재질이 없음을 확인한 뒤 다시 등급 산정 필요")
    else:
        for g in ("A", "B", "C"):
            if raw >= th[g]:
                grade = g
                break
        if grade is None:
            reasons.append(f"순도 {purity}가 통과증 최소 기준 {th['C']}에 못 미침")
    claim_reasons = list(reasons)       # 주장·LLM 문장용: 사용자가 쓴 재질 이름은 "[입력값]"으로
    for m in dict.fromkeys(unknown):
        reasons.append(UNKNOWN_MATERIAL_REASON)  # 계약 9.3: reasons에도 사용자 문자열 금지(원문은 bag.items)
    if unknown:
        claim_reasons.append(UNKNOWN_MATERIAL_REASON)
    return {"target_material": target, "purity": purity, "grade": grade,
            "hazard": bool(hazards), "note_hazard": note_hz, "reasons": reasons, "claim_reasons": claim_reasons,
            "total_kg": round(total, 3)}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def coarse_km(km: float) -> float:
    """다른 회사까지의 거리는 1km 단위로만 준다(여러 번 물어 좌표를 역산하는 것을 막음, §17)."""
    return float(round(km))


def price_item_for(target_material: str) -> str | None:
    """target_material → prices.json 품목명. 예: pp → 'PP 압축'. 못 찾으면 None."""
    t = canon_material(target_material or "")
    if not t:
        return None
    items = {p["item"] for p in load_json("prices.json")}
    if MATERIAL_PRICE_ITEM.get(t) in items:
        return MATERIAL_PRICE_ITEM[t]
    for cand in (f"{t.upper()} 압축", t):
        if cand in items:
            return cand
    for m in load_json("materials.json"):
        if m["id"] == t.lower() and m.get("priceItem") in items:
            return m["priceItem"]
    return None


def latest_price(item: str) -> dict | None:
    """전국 최근값(원/kg)과 같은 날짜 지역별 최소~최대."""
    rows = [p for p in load_json("prices.json") if p["item"] == item]
    if not rows:
        return None
    date = max(p["date"] for p in rows)       # 'YYYY' < 'YYYY-MM-DD' 문자열 비교로 최신이 뒤
    same = [p for p in rows if p["date"] == date]
    nat = next((p for p in same if p["region"] == "전국"), None)
    prices = [p["price"] for p in same]
    return {"item": item, "date": date, "price": (nat or same[0])["price"],
            "low": min(prices), "high": max(prices), "unit": same[0]["unit"],
            "source": same[0]["sourceId"], "basis": same[0]["basis"]}


def incineration_cost(total_kg: float) -> dict:
    inc = assumptions()["incineration_krw_per_ton"]
    tons = total_kg / 1000
    return {"tons": round(tons, 3), "low": round(tons * inc["low"]), "high": round(tons * inc["high"]),
            "per_ton_low": inc["low"], "per_ton_high": inc["high"], "source": inc["source"]}


def fmt(n: Any) -> str:
    """숫자 표기를 한 곳에서 통일(천 단위 쉼표). 요약 게이트가 쉼표를 지우고 비교한다."""
    if isinstance(n, float) and not n.is_integer():
        return f"{n:,.2f}".rstrip("0").rstrip(".")
    return f"{int(n):,}"
