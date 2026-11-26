"""공개 시세 조회와 물량 집계(ARCHITECTURE §11.2, §11.5). apps.py·listings.py가 함께 쓴다."""
from functools import lru_cache

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.db.models import Bag, Listing
from app.tools.calc import MATERIAL_PRICE_ITEM, canon_material
from app.tools.data import load_json




@lru_cache
def latest_prices() -> tuple[dict, ...]:
    """품목별 전국 최신값. 직전 값이 있으면 변화율을 붙인다."""
    rows = load_json("prices.json")
    by_item: dict[str, list[dict]] = {}
    for row in rows:
        if row.get("region") == "전국" and row.get("price"):
            by_item.setdefault(row["item"], []).append(row)
    out = []
    for item, history in by_item.items():
        history.sort(key=lambda r: str(r["date"]))
        last = history[-1]
        prev = history[-2]["price"] if len(history) > 1 else None
        out.append({"item": item, "category": last["category"], "price": last["price"], "unit": last["unit"],
                    "date": str(last["date"]), "source_id": last.get("sourceId"),
                    "change_pct": round((last["price"] - prev) / prev * 100, 1) if prev else None})
    out.sort(key=lambda r: (r["category"], r["item"]))
    return tuple(out)


def price_history(item: str) -> list[dict]:
    """한 품목의 전국 시세 [{date, price}] 오래된 순. 없는 품목이면 빈 목록."""
    rows = load_json("prices.json")
    mine = [r for r in rows if r.get("item") == item and r.get("region") == "전국" and r.get("price")]
    mine.sort(key=lambda r: str(r["date"]))
    return [{"date": str(r["date"]), "price": r["price"]} for r in mine]


def market_for(material: str | None) -> dict | None:
    """재질에 대응하는 공개 시세 {item, price, unit, date}. 대응이 없으면 None."""
    item = MATERIAL_PRICE_ITEM.get(canon_material(material or ""))
    for p in latest_prices():
        if p["item"] == item:
            return {"item": p["item"], "price": p["price"], "unit": p["unit"], "date": p["date"]}
    return None


def market_volumes(session: Session) -> list[dict]:
    """posted 매물을 (waste_code, 표준 재질)로 묶은 물량. 물량 큰 순."""
    first_bag = dict(session.query(Bag.listing_id, func.min(Bag.id)).filter(Bag.listing_id.isnot(None))
                     .group_by(Bag.listing_id).all())
    bag_rows = {b.id: b for b in session.query(Bag).filter(Bag.id.in_(first_bag.values()))} if first_bag else {}
    bag_counts = dict(session.query(Bag.listing_id, func.count(Bag.id)).filter(Bag.listing_id.isnot(None))
                      .group_by(Bag.listing_id).all())
    groups: dict[tuple[str, str], dict] = {}
    for l in session.query(Listing).filter(Listing.status == "posted").order_by(Listing.id):
        bag = bag_rows.get(first_bag.get(l.id))
        material = canon_material(bag.target_material) if bag and bag.target_material else ""
        g = groups.setdefault((l.waste_code, material), {"kg": 0.0, "ids": 0, "sellers": set(), "bags": 0,
                                                         "prices": [], "grades": {}})
        g["kg"] += l.total_kg
        g["ids"] += 1
        g["sellers"].add(l.factory_id)
        g["bags"] += bag_counts.get(l.id, 0)
        g["prices"].append(l.price_krw_per_kg)
        g["grades"][l.grade] = g["grades"].get(l.grade, 0.0) + l.total_kg
    out = [{"waste_code": code, "waste_name": waste_names().get(code, code), "target_material": material or None,
            "total_kg": round(g["kg"], 3), "listing_count": g["ids"], "seller_count": len(g["sellers"]),
            "bag_count": g["bags"], "min_price": min(g["prices"]), "max_price": max(g["prices"]),
            "grades": {k: round(v, 3) for k, v in sorted(g["grades"].items())}, "market": market_for(material)}
           for (code, material), g in groups.items()]
    out.sort(key=lambda v: (-v["total_kg"], v["waste_code"], v["target_material"] or ""))
    return out
