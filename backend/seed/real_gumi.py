"""구미 실제 공장(공공 자료의 회사명, 공공 좌표)으로 시연 판매 매물을 만든다. 로컬 시연 DB 전용.

실행: python -m seed.real_gumi <service_factories.csv 경로> <서버 주소> <공통 비밀번호>
  예) python -m seed.real_gumi "../../data/data/60_서비스데이터셋/service_factories.csv" http://127.0.0.1:8100 janjaemi-demo-password

- 공장 자료(회사명, 주소, 좌표)는 저장소에 넣지 않고 실행할 때만 읽는다. 좌표는 '공공' 출처만 쓴다(카카오 좌표 제외).
- 매물(무게, 단가)은 시연용 예시다. 실제 그 공장이 판매한다는 뜻이 아니다.
- 기존 가상 공장(가상사출A~E)은 실제 공장 이름과 위치로 바꾼다. 여러 번 돌려도 같은 결과(이미 만든 공장·매물은 건너뜀).
"""
import csv
import random
import sys

import httpx

from app.core.security import hash_password
from app.db.models import Base, Company, CompanyExtra, Credential, Listing
from app.db.session import SessionLocal, engine

# 품목: (주 재질, 폐기물 코드, 공장 고르는 조건, 단가 범위 원/kg, 섞이는 이물질)
PLASTIC, IRON, NONFERROUS, PAPER = "51-03-01", "51-29-01", "51-29-02", "51-28-02"
ITEMS = [
    ("pp", PLASTIC, "plastic", (330, 420), "pe"),
    ("pe", PLASTIC, "plastic", (380, 460), "pp"),
    ("pet", PLASTIC, "plastic", (300, 380), "pp"),
    ("abs", PLASTIC, "plastic", (650, 850), "pp"),
    ("철", IRON, "metal", (330, 390), "기타"),
    ("알루미늄", NONFERROUS, "metal", (1800, 2600), "철"),
    ("구리", NONFERROUS, "metal", (8500, 10500), "철"),
    ("골판지", PAPER, "paper", (80, 120), "비닐"),
]
PER_ITEM = [5, 4, 4, 4, 5, 4, 4, 5]          # 품목마다 4~5건
FAKE = ["가상사출A", "가상사출B", "가상사출C", "가상사출D", "가상사출E"]


def kind_of(row: dict) -> set[str]:
    waste, sector, product = row["폐기물_목록"], row["업종_묶음"], row["생산품"]
    out = set()
    if "폐합성수지" in waste:
        out.add("plastic")
    if "폐금속" in waste or "금속" in sector or any(k in product for k in ("알루미늄", "주조", "금속", "자동차")):
        out.add("metal")
    if "폐지" in waste or "종이" in sector or any(k in product for k in ("포장", "인쇄", "식품", "라면")) or "동식물성" in waste:
        out.add("paper")
    return out


def gumi_factories(path: str) -> list[dict]:
    rows = [r for r in csv.DictReader(open(path, encoding="utf-8-sig"))
            if r["시군구"].startswith("구미") and r["좌표_출처"] == "공공" and r["lat"] and r["lon"]]
    seen, out = set(), []
    for r in sorted(rows, key=lambda r: int(r["factory_id"])):
        if r["회사명"] in seen:          # 같은 회사 여러 공장은 첫 공장만
            continue
        seen.add(r["회사명"])
        out.append(r)
    return out


def plan(rows: list[dict]) -> list[tuple[dict, tuple]]:
    """품목마다 맞는 공장을 겹치지 않게 골라 (공장, 품목) 목록을 만든다."""
    used, out = set(), []
    for item, n in zip(ITEMS, PER_ITEM):
        pool = [r for r in rows if item[2] in kind_of(r) and r["factory_id"] not in used]
        if len(pool) < n:   # 모자라면 다른 품목에 쓴 공장도 다시 쓴다
            pool += [r for r in rows if item[2] in kind_of(r) and r["factory_id"] in used]
        for r in pool[:n]:
            used.add(r["factory_id"])
            out.append((r, item))
    return out


def ensure_companies(picks: list[tuple[dict, tuple]], password: str) -> dict[str, str]:
    """공장 회사와 로그인 계정을 만든다(가상 공장 5곳은 이름과 위치를 실제 공장으로 바꿈). {factory_id: login_id}"""
    Base.metadata.create_all(engine)
    logins: dict[str, str] = {}
    with SessionLocal() as s:
        fakes = [s.query(Company).filter_by(name=n, role="factory").first() for n in FAKE]
        fakes = [c for c in fakes if c]
        for r, _ in picks:
            fid = r["factory_id"]
            if fid in logins:
                continue
            c = s.query(Company).filter_by(name=r["회사명"], role="factory").first()
            if c is None:
                c = fakes.pop(0) if fakes else None
                old = s.query(Credential).filter_by(company_id=c.id).first() if c is not None else None
                if c is not None:   # 가상 공장 → 실제 공장(기존 거래 기록과 체험 로그인 계정은 그대로 따라감)
                    s.query(CompanyExtra).filter_by(company_id=c.id).delete()
                else:
                    c = Company(role="factory", verified=True, permit_codes=[], coord_source="seed", biz_no="")
                    s.add(c)
                c.name, c.lat, c.lon = r["회사명"], float(r["lat"]), float(r["lon"])
                c.region, c.address = "경북 구미", r["주소"]
                c.industry = (r["생산품"].strip(" .,-") or r["업종_묶음"])[:60]
                c.phone = r["연락처"] or None
                c.biz_no = "공공자료 미기재"   # 공공 폐기물 자료에는 사업자번호가 없음
                c.coord_source, c.verified = "seed", True
                s.flush()
                if old is None:
                    s.add(Credential(company_id=c.id, login_id=f"gumi-{fid}", password_hash=hash_password(password)))
                s.add(CompanyExtra(company_id=c.id, ceo_name=None,
                                   intro=f"{r['업종_묶음']}, 공공 폐기물 기록: {r['폐기물_목록'].replace(';', ', ')}"[:200]))
                s.flush()
            login = s.query(Credential).filter_by(company_id=c.id).first().login_id
            logins[fid] = login
        s.commit()
    return logins


def has_listing(company_login: str, material: str) -> bool:
    with SessionLocal() as s:
        cred = s.query(Credential).filter_by(login_id=company_login).first()
        if cred is None:
            return False
        from app.db.models import Bag
        return s.query(Listing).join(Bag, Bag.listing_id == Listing.id).filter(
            Listing.factory_id == cred.company_id, Listing.status == "posted", Bag.target_material == material).first() is not None


def post_listings(base: str, password: str, picks, logins) -> int:
    rng = random.Random(2026)
    made = 0
    with httpx.Client(base_url=base, timeout=60) as c:
        tokens: dict[str, dict] = {}
        for r, (material, code, _, (lo, hi), dirt) in picks:
            login = logins[r["factory_id"]]
            if has_listing(login, material):
                continue
            if login not in tokens:
                t = c.post("/v1/auth/login", json={"login_id": login, "password": password})
                t.raise_for_status()
                tokens[login] = {"Authorization": f"Bearer {t.json()['access_token']}"}
            h = tokens[login]
            bag_ids = []
            ratio = rng.choice([0.02, 0.03, 0.05])   # 한 매물의 마대는 같은 등급이어야 하므로 이물질 비율을 같게
            kg = rng.choice([200, 250, 300, 400, 500, 600, 750, 900]) if material != "구리" else rng.choice([80, 120, 150, 200])
            for _ in range(rng.randint(1, 3)):   # 마대 무게도 같게(반올림 차이로 등급이 갈리지 않게)
                impure = round(kg * ratio)
                bag = c.post("/v1/bags", headers=h, json={"waste_code": code, "target_material": material,
                                                          "items": [{"material": material, "kg": kg - impure}, {"material": dirt, "kg": impure}]})
                bag.raise_for_status()
                g = c.post(f"/v1/bags/{bag.json()['id']}/grade", headers=h, json={})
                g.raise_for_status()
                bag_ids.append(bag.json()["id"])
            price = rng.randrange(lo, hi + 1, 5 if hi < 1000 else 50)
            got = c.post("/v1/listings", headers=h, json={"bag_ids": bag_ids, "mode": "now", "price_krw_per_kg": price})
            if got.status_code != 201:
                print(f"매물 실패 {r['회사명']} {material}: {got.status_code} {got.text[:120]}")
                continue
            made += 1
            print(f"매물 {got.json()['id']}: {r['회사명']} {material} {got.json()['total_kg']}kg {price}원/kg")
    return made


def main(path: str, base: str, password: str) -> None:
    rows = gumi_factories(path)
    picks = plan(rows)
    logins = ensure_companies(picks, password)
    made = post_listings(base, password, picks, logins)
    from seed.demo_extras import fill_listing_terms
    with SessionLocal() as s:   # 새로 올린 매물에도 판매자 안내(운송, 출고 시간, 메모)
        fill_listing_terms(s)
        s.commit()
    print(f"구미 실제 공장 {len(logins)}곳, 새 매물 {made}건")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
