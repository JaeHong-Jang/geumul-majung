"""구미 가상 시나리오 시드. 실제 회사명은 쓰지 않는다. 실행: python -m seed.gumi_demo"""
import os
import secrets
import sys

from app.core.security import hash_password
from app.db.models import Address, Base, Company, Credential
from app.db.session import SessionLocal, engine

CODE = "51-03-01"   # 폐합성수지류
SCRAP_IRON, NONFERROUS, PAPER = "51-29-01", "51-29-02", "51-28-02"   # 고철, 비철금속, 폐지류
ALL_CODES = [CODE, SCRAP_IRON, NONFERROUS, PAPER]
# (이름, 역할, 사업자번호, 위도, 경도, 허가번호, 허가코드, 업종)
COMPANIES = [
    ("가상사출A", "factory", "000-00-00001", 36.1030, 128.3920, None, [], "플라스틱 사출"),
    ("가상사출B", "factory", "000-00-00002", 36.1065, 128.3975, None, [], "플라스틱 사출"),
    ("가상사출C", "factory", "000-00-00003", 36.1002, 128.3868, None, [], "플라스틱 사출"),
    ("가상리사이클", "recycler", "000-00-00004", 36.1250, 128.3600, "가상-허가-R01", ALL_CODES, "폐합성수지, 금속, 폐지 재활용"),
    ("가상운영", "operator", "000-00-00006", 36.1190, 128.3440, None, [], "운영"),
    ("가상사출D", "factory", "000-00-00007", 36.1048, 128.3902, None, [], "플라스틱 사출"),   # 같은 지역 묶음용(§12.9)
    ("가상사출E", "factory", "000-00-00008", 36.0985, 128.3945, None, [], "플라스틱 사출"),
    ("가상리사이클B", "recycler", "000-00-00009", 36.1420, 128.4010, "가상-허가-R02", ALL_CODES, "폐합성수지, 금속 재활용"),   # 재활용업체 찾기용 2번째
]
# 가상 주소(실제 지번이 아님). 구매자에는 배송지 1개
ADDRESSES = {"가상사출A": "경북 구미시 가상로 1", "가상사출B": "경북 구미시 가상로 2", "가상사출C": "경북 구미시 가상로 3",
             "가상사출D": "경북 구미시 가상로 4", "가상사출E": "경북 구미시 가상로 5",
             "가상리사이클": "경북 구미시 가상산단로 10", "가상리사이클B": "경북 구미시 가상산단로 30", "가상운영": "경북 구미시 가상로 30"}
# 재활용업체 소개(가상 문구)
RECYCLER_INFO = {"가상리사이클": ("방문 수거 또는 입고", "현금 결제, 입고 검수 뒤 정산"),
                 "가상리사이클B": ("입고만 가능", "세금계산서 발행 거래")}


def seed(password: str | None = None, operator_password: str | None = None) -> dict:
    """가상 회사를 넣는다. password를 주면 사업자번호를 login_id로 하는 계정도 만든다.
    운영자는 공통 비밀번호를 쓰지 않는다(operator_password가 없으면 운영자 계정은 만들지 않음)."""
    Base.metadata.create_all(engine)
    ids = {}
    with SessionLocal() as s:
        for name, role, biz, lat, lon, permit, codes, industry in COMPANIES:
            c = Company(name=name, role=role, biz_no=biz, lat=lat, lon=lon, permit_no=permit,
                        permit_codes=codes, industry=industry, verified=True, region="경북 구미",   # 데모라 허가 확인 끝난 상태
                        address=ADDRESSES[name], coord_source="seed")
            if name in RECYCLER_INFO:
                c.pickup_method, c.terms = RECYCLER_INFO[name]
            s.add(c)
            s.flush()
            ids[name] = c.id
            account_password = operator_password if role == "operator" else password
            if role == "recycler":
                s.add(Address(company_id=c.id, label="본사 공장", address=ADDRESSES[name], is_default=True))
            if account_password:
                s.add(Credential(company_id=c.id, login_id=biz, password_hash=hash_password(account_password)))
        s.commit()
    return ids


if __name__ == "__main__":
    demo_password = os.environ.get("SEED_PASSWORD") or secrets.token_urlsafe(12)
    if len(demo_password) < 16:
        sys.exit("SEED_PASSWORD는 16자 이상이어야 함")
    operator_password = secrets.token_urlsafe(24)
    logins = {name: biz for name, _, biz, *_ in COMPANIES}
    for name, cid in seed(demo_password, operator_password).items():
        print(f"{name}: id={cid}  login_id={logins[name]}")
    print(f"공통 비밀번호(운영자 제외, 데모 전용): {demo_password}")
    print(f"운영자 비밀번호(다른 사람에게 주지 말 것): {operator_password}")
