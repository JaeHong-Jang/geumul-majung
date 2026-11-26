"""시연용 판매 공장 공개 정보(가상 대표자, 소개, 전화)와 시연 후기 문구를 채운다. 여러 번 돌려도 같은 결과.
실행: python -m seed.demo_extras  (seed.gumi_demo, seed.demo_listings 뒤)"""
from app.db.models import Base, Company, CompanyExtra, Listing, ListingTerms, Rating
from app.db.session import SessionLocal, engine

# 이름, 대표자, 소개, 전화(모두 가상)
EXTRAS = {
    "가상사출A": ("김가상", "자동차 내장 부품 사출, PP 스크랩 월 3톤 배출", "054-000-0001"),
    "가상사출B": ("이가상", "가전 외장 사출, PP와 비철 스크랩 배출", "054-000-0002"),
    "가상사출C": ("박가상", "포장 용기 사출, PE와 골판지 배출", "054-000-0003"),
    "가상사출D": ("최가상", "산업용 부품 사출, PP 분쇄품 배출", "054-000-0004"),
    "가상사출E": ("정가상", "생활용품 사출, PP 스크랩 배출", "054-000-0005"),
}
# 시연 매물의 판매자 안내(운송, 출고 시간, 메모). 매물 번호로 골라 늘 같은 결과
HOURS = ["평일 09:00~18:00", "평일 08:00~17:00", "평일 07:00~19:00"]
NOTES = [
    "세척 후 건조 완료, 이물질 1% 이하",
    "압축 베일 단위로 출고, 지게차 상차 가능",
    "도착 30분 전 연락 주면 바로 상차",
    "분쇄 10mm 이하, 색상 혼합",
    "월 2회 같은 품질로 정기 공급 가능",
    "샘플 1kg 먼저 보내 드릴 수 있음",
    "평일 오전 현장 확인 방문 가능",
    "실내 보관이라 수분 거의 없음",
]
COMMENTS = {5: "분류 상태 좋고 약속 시간에 맞춰 상차", 4: "수량은 맞았고 이물질이 조금 섞임", 3: "연락은 원활, 포장 상태 보통"}


def main() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        for name, (ceo, intro, phone) in EXTRAS.items():
            c = s.query(Company).filter_by(name=name, role="factory").first()
            if c is None:
                continue
            if not c.phone:
                c.phone = phone
            if s.query(CompanyExtra).filter_by(company_id=c.id).first() is None:
                s.add(CompanyExtra(company_id=c.id, ceo_name=ceo, intro=intro))
        fill_listing_terms(s)
        for r in s.query(Rating).filter(Rating.target == "factory", Rating.comment.is_(None)):
            r.comment = COMMENTS.get(r.score, "거래 원활")
        s.commit()
    print("시연 판매 공장 정보 준비 완료")



def fill_listing_terms(s) -> None:
    """판매 중인 시연 매물 중 판매자 안내가 비어 있는 것만 채운다(판매자가 직접 적은 값은 건드리지 않음)."""
    for t in s.query(ListingTerms).filter(ListingTerms.unload_forklift.is_(None)):   # 하차 지원 칸이 생기기 전 시연 안내
        t.unload_forklift, t.unload_crane = t.listing_id % 2 == 0, t.listing_id % 5 == 0
    have = {t.listing_id for t in s.query(ListingTerms)}
    for l in s.query(Listing).filter(Listing.status.in_(("posted", "bundle_wait"))):
        if l.id in have:
            continue
        s.add(ListingTerms(listing_id=l.id, transport="own" if l.id % 3 == 0 else "matched", ship_hours=HOURS[l.id % len(HOURS)],
                           unload_forklift=l.id % 2 == 0, unload_crane=l.id % 5 == 0))
        if not l.pickup_note:
            l.pickup_note = f"{NOTES[l.id % len(NOTES)]}, {NOTES[(l.id * 3 + 1) % len(NOTES)]}" if l.id % 2 else NOTES[l.id % len(NOTES)]


if __name__ == "__main__":
    main()
