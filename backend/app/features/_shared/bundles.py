"""반경 안 판매자 묶기(ARCHITECTURE §12.4·12.5). 직선거리(haversine)만 쓰고 절감액 같은 값은 만들지 않는다."""
from sqlalchemy.orm import Session

from app.db.models import Company, Listing
from app.tools.calc import haversine_km


def cluster(listings: list[Listing], factories: dict[int, Company], radius_km: float) -> list[list[Listing]]:
    """매물 id 순으로 보며, 묶음의 첫 판매 공장에서 radius_km 안이면 그 묶음에 넣는다(묶음 안 모든 공장이 첫 공장 반경 안)."""
    groups: list[list[Listing]] = []
    for l in sorted(listings, key=lambda x: x.id):
        f = factories[l.factory_id]
        for g in groups:
            seed = factories[g[0].factory_id]
            if haversine_km(seed.lat, seed.lon, f.lat, f.lon) <= radius_km:
                g.append(l)
                break
        else:
            groups.append([l])
    return groups


def pickup_groups(session: Session, listings: list[Listing], radius_km: float) -> list[dict]:
    """같이 실을 수 있는 묶음(서로 다른 판매자 2곳 이상인 것만)."""
    factories = {c.id: c for c in session.query(Company).filter(Company.id.in_({l.factory_id for l in listings}))}
    out = []
    for g in cluster(listings, factories, radius_km):
        factory_ids = sorted({l.factory_id for l in g})
        if len(factory_ids) >= 2:
            out.append({"factory_ids": factory_ids, "listing_ids": [l.id for l in g],
                        "total_kg": round(sum(l.total_kg for l in g), 3), "radius_km": radius_km})
    return out
