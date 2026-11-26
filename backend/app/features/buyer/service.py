"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.deps import get_or_404
from app.core.util import dec
from app.db.models import Bag, Address, Company, Favorite, Listing
from app.features._shared.bundles import cluster
from app.features.listings.service import listing_item
from app.tools.calc import coarse_km
from app.tools.data import assumptions


def buyer_bundles(session: Session, me: Company) -> list[dict]:
    """같은 waste_code·grade이고 반경 안 판매자 2곳 이상인 posted 묶음(§12.5)."""
    cfg = assumptions()
    radius, min_lot = cfg["bundle_radius_km"], cfg["min_lot_kg"]
    posted = session.query(Listing).filter(Listing.status == "posted").order_by(Listing.id).all()
    factories = {c.id: c for c in session.query(Company).filter(Company.id.in_({l.factory_id for l in posted}))} if posted else {}
    favorites = {f.listing_id for f in session.query(Favorite).filter_by(company_id=me.id)}
    # 같은 폐기물 코드라도 재질(PP, PE, PET 등)이 다르면 따로 묶는다. 구매자는 재질 단위로 사기 때문
    first_bag = {lid: mat for lid, mat in session.query(Bag.listing_id, Bag.target_material).filter(
        Bag.listing_id.in_([l.id for l in posted])).order_by(Bag.id.desc())} if posted else {}
    by_key: dict[tuple[str, str, str], list[Listing]] = {}
    for l in posted:
        by_key.setdefault((l.waste_code, l.grade, (first_bag.get(l.id) or "").lower()), []).append(l)
    out = []
    for (code, grade, _material), ls in by_key.items():
        for g in cluster(ls, factories, radius):
            sellers = {l.factory_id for l in g}
            if len(sellers) < 2:
                continue
            items = [listing_item(session, l, me, favorites) for l in g]
            total = sum(dec(l.total_kg) for l in g)
            avg_price = float(sum(dec(l.total_kg) * dec(l.price_krw_per_kg) for l in g) / total)
            market = items[0]["market"]
            reasons = [f"반경 {radius}km 안 판매자 {len(sellers)}곳의 같은 폐기물 코드({code}), {grade}등급 매물",
                       f"합계 {float(total):g}kg, 최소 묶음 {min_lot}kg {'충족' if total >= min_lot else '미충족'}"]
            if market:
                reasons.append(f"평균 단가 {avg_price:.1f}원/kg, 공개 시세 {market['item']} {market['price']:g}원/kg ({market['date']})")
            out.append({"id": f"{code}-{grade}-{g[0].id}", "waste_code": code, "waste_name": waste_names().get(code, code),
                        "target_material": items[0]["target_material"], "grade": grade, "listing_ids": [l.id for l in g],
                        "seller_count": len(sellers), "total_kg": round(float(total), 3),
                        "avg_distance_km": coarse_km(sum(i["distance_km"] for i in items) / len(items)),
                        "min_lot_kg": min_lot, "meets_min_lot": total >= min_lot, "avg_price": round(avg_price, 2),
                        "market": market, "reasons": reasons, "listings": items})
    out.sort(key=lambda b: (-b["total_kg"], b["id"]))
    return out


GRADE_RANK = {"A": 3, "B": 2, "C": 1}


def address_dict(a: Address) -> dict:
    return {"id": a.id, "label": a.label, "address": a.address, "is_default": a.is_default}


def own_address(session: Session, address_id: int, me: Company) -> Address:
    a = get_or_404(session, Address, address_id)
    if a.company_id != me.id:
        raise HTTPException(404, "배송지를 찾을 수 없음")
    return a


def interests_of(me: Company) -> dict:
    got = me.interests or {}
    return {"waste_codes": got.get("waste_codes", []), "min_grade": got.get("min_grade")}


def recommended(items: list[dict], me: Company) -> list[dict]:
    """관심 조건에 맞는 매물. 조건이 비어 있으면 추천 없음."""
    want = interests_of(me)
    if not want["waste_codes"] and not want["min_grade"]:
        return []
    return [i for i in items
            if (not want["waste_codes"] or i["waste_code"] in want["waste_codes"])
            and (not want["min_grade"] or GRADE_RANK[i["grade"]] >= GRADE_RANK[want["min_grade"]])]
