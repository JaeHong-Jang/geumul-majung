"""SQLAlchemy 모델. 시간은 UTC."""
from datetime import date, datetime

from sqlalchemy import (JSON, BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, String,
                        UniqueConstraint)
from sqlalchemy.orm import DeclarativeBase, Mapped, deferred, mapped_column


from app.core.util import now


class Base(DeclarativeBase):
    pass


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    biz_no: Mapped[str] = mapped_column(String)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    permit_no: Mapped[str | None] = mapped_column(String, nullable=True)
    permit_codes: Mapped[list] = mapped_column(JSON, default=list)
    industry: Mapped[str | None] = mapped_column(String, nullable=True)
    verified: Mapped[bool] = mapped_column(default=False)
    region: Mapped[str | None] = mapped_column(String, nullable=True)   # 화면 표시용 지역명(예: 경북 구미)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    vehicle_no: Mapped[str | None] = mapped_column(String, nullable=True)       # 예전 운송기사 계정용, 지금은 쓰지 않음
    vehicle_type: Mapped[str | None] = mapped_column(String, nullable=True)
    capacity_ton: Mapped[float | None] = mapped_column(Float, nullable=True)
    online: Mapped[bool] = mapped_column(Boolean, default=False)                # 예전 운송기사 표시용, 지금은 쓰지 않음
    interests: Mapped[dict | None] = mapped_column(JSON, nullable=True)         # {waste_codes, min_grade} (§12.2)
    notify_orders: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_market: Mapped[bool] = mapped_column(Boolean, default=True)
    coord_source: Mapped[str] = mapped_column(String, default="region")   # region | juso | user | seed (§14.5)
    token_version: Mapped[int] = mapped_column(Integer, default=0)       # 재설정 때 올려 기존 로그인 토큰을 무효화 (§17)
    coord_changes: Mapped[list | None] = mapped_column(JSON, nullable=True)   # 좌표를 바꾼 시각들(하루 3회 제한)
    email: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)   # 소문자로 저장 (§14.1)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)            # §13.1
    address_detail: Mapped[str | None] = mapped_column(String, nullable=True)
    emitter_report: Mapped[str | None] = mapped_column(String, nullable=True)   # 배출자 신고 대상 여부(문자열)
    pickup_method: Mapped[str | None] = mapped_column(String, nullable=True)    # recycler 소개 (§13.3)
    terms: Mapped[str | None] = mapped_column(String, nullable=True)
    approval_status: Mapped[str] = mapped_column(String, default="approved")    # approved | pending | needs_fix
    approval_note: Mapped[str | None] = mapped_column(String, nullable=True)
    approval_missing: Mapped[list | None] = mapped_column(JSON, nullable=True)
    byproducts: Mapped[list | None] = mapped_column(JSON, nullable=True)   # 판매자 공장에서 나오는 부산물 [{code, material, monthly_kg}]


class Credential(Base):
    """회사 로그인 정보(§10.1). 비밀번호는 해시만 저장."""
    __tablename__ = "credentials"
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), primary_key=True)
    login_id: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)


class Bag(Base):
    __tablename__ = "bags"
    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    waste_code: Mapped[str] = mapped_column(String)
    target_material: Mapped[str] = mapped_column(String)
    items: Mapped[list] = mapped_column(JSON)
    total_kg: Mapped[float] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="registered")
    grade: Mapped[str | None] = mapped_column(String, nullable=True)
    listing_id: Mapped[int | None] = mapped_column(ForeignKey("listings.id"), nullable=True)
    purity: Mapped[float | None] = mapped_column(Float, nullable=True)
    photo_type: Mapped[str | None] = mapped_column(String, nullable=True)                     # §12.8
    photo_data: Mapped[bytes | None] = deferred(mapped_column(LargeBinary, nullable=True))    # 목록 조회에서 읽지 않음
    reasons: Mapped[list | None] = mapped_column(JSON, nullable=True)
    history: Mapped[list | None] = mapped_column(JSON, nullable=True)   # 등급 요청 기록(확인자 등)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class BagPass(Base):
    """통과증."""
    __tablename__ = "passes"
    id: Mapped[int] = mapped_column(primary_key=True)
    bag_id: Mapped[int] = mapped_column(ForeignKey("bags.id"), unique=True)
    grade: Mapped[str] = mapped_column(String)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Listing(Base):
    __tablename__ = "listings"
    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    mode: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    waste_code: Mapped[str] = mapped_column(String)
    grade: Mapped[str] = mapped_column(String)
    total_kg: Mapped[float] = mapped_column(Float)
    price_krw_per_kg: Mapped[float] = mapped_column(Float)
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    pickup_note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"))
    recycler_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    hauler_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="ordered")
    goods_krw: Mapped[int] = mapped_column(BigInteger)
    unit_price_krw_per_kg: Mapped[float | None] = mapped_column(Float, nullable=True)   # 주문 시점 단가 스냅샷 (§17)
    bag_snapshot: Mapped[list | None] = mapped_column(JSON, nullable=True)              # 주문 시점 마대 id (반송 뒤에도 남김)
    freight_cap_krw: Mapped[int] = mapped_column(BigInteger, default=0)   # 구매자가 정한 운임 상한
    held_krw: Mapped[int] = mapped_column(BigInteger, default=0)          # 보류 금액 = round(goods×1.05) + cap
    freight_krw: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    pickup_weights: Mapped[list | None] = mapped_column(JSON, nullable=True)
    inspect_weights: Mapped[list | None] = mapped_column(JSON, nullable=True)
    inspect_note: Mapped[str | None] = mapped_column(String, nullable=True)
    settlement: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    allbaro_no: Mapped[str | None] = mapped_column(String, nullable=True)
    weight_warning: Mapped[str | None] = mapped_column(String, nullable=True)
    dispute_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    transport: Mapped[str] = mapped_column(String, default="seller")    # seller(판매자 운송) | self(구매 업체 직접 수거) | matched(예전 운송기사 배차)
    payment: Mapped[str] = mapped_column(String, default="escrow")       # escrow | invoice
    delivery_address: Mapped[str | None] = mapped_column(String, nullable=True)
    desired_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    scanned_bag_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OrderHistory(Base):
    __tablename__ = "order_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    from_status: Mapped[str] = mapped_column(String)
    to_status: Mapped[str] = mapped_column(String)
    by_company_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = 서버
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Payment(Base):
    """가짜 PG 결제."""
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    amount_krw: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String)  # authorized | captured | refunded


class HandoverSection(Base):
    __tablename__ = "handover_sections"
    __table_args__ = (UniqueConstraint("order_id", "section"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    section: Mapped[str] = mapped_column(String)  # emitter | carrier | processor
    data: Mapped[dict] = mapped_column(JSON)


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("order_id", "rater_id", "target"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    rater_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    target: Mapped[str] = mapped_column(String)
    target_company_id: Mapped[int] = mapped_column(Integer)
    score: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String, nullable=True)


class AgentRun(Base):
    """하네스 RunResult JSON 저장."""
    __tablename__ = "agent_runs"
    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    flow: Mapped[str] = mapped_column(String)
    result: Mapped[dict] = mapped_column(JSON)
    company_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)   # 요청 회사 + 거래 당사자 (§9.4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Address(Base):
    """구매자 배송지 (§12.2)."""
    __tablename__ = "addresses"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    label: Mapped[str] = mapped_column(String)
    address: Mapped[str] = mapped_column(String)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("company_id", "listing_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"))


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    title: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(String)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    subject: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CompanyDocument(Base):
    """가입 증빙 (§13.1)."""
    __tablename__ = "company_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    kind: Mapped[str] = mapped_column(String)
    content_type: Mapped[str] = mapped_column(String)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class FavoriteRecycler(Base):
    __tablename__ = "favorite_recyclers"
    __table_args__ = (UniqueConstraint("company_id", "recycler_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    recycler_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))


class Message(Base):
    """주문별 대화 (§13.4)."""
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    body: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OrderPhoto(Base):
    """수거·검사 기록 사진 (§13.5)."""
    __tablename__ = "order_photos"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    stage: Mapped[str] = mapped_column(String)   # pickup | inspect
    uploader_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    content_type: Mapped[str] = mapped_column(String)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"
    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id"), index=True)
    content_type: Mapped[str] = mapped_column(String)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Pool(Base):
    """공동판매 (§13.2). status: open | sold | cancelled ('closed'는 기한이 지난 open을 보여 줄 때만 계산)."""
    __tablename__ = "pools"
    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    title: Mapped[str] = mapped_column(String)
    waste_code: Mapped[str] = mapped_column(String)
    grade: Mapped[str] = mapped_column(String)
    target_material: Mapped[str | None] = mapped_column(String, nullable=True)
    target_kg: Mapped[float] = mapped_column(Float)
    deadline: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String, default="open")
    applied_price: Mapped[float | None] = mapped_column(Float, nullable=True)   # 판매가 확정되면 고정
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PoolMember(Base):
    __tablename__ = "pool_members"
    __table_args__ = (UniqueConstraint("pool_id", "company_id"), UniqueConstraint("listing_id"))
    id: Mapped[int] = mapped_column(primary_key=True)
    pool_id: Mapped[int] = mapped_column(ForeignKey("pools.id"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"))
    kg: Mapped[float] = mapped_column(Float)
    price_krw_per_kg: Mapped[float] = mapped_column(Float)


class SocialAccount(Base):
    """카카오·구글 계정 연결 (§14.4)."""
    __tablename__ = "social_accounts"
    __table_args__ = (UniqueConstraint("provider", "subject"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String)
    subject: Mapped[str] = mapped_column(String)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)


class PasswordResetToken(Base):
    """비밀번호 재설정 일회용 토큰. 해시만 저장 (§14.3)."""
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), index=True, nullable=True)   # None은 없는 이메일용 미끼
    token_hash: Mapped[str] = mapped_column(String, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OAuthTicket(Base):
    """OAuth 일회용 값: state(10분)와 가입 완료용 signup_token(15분). 무작위 값의 해시로만 찾는다 (§14.4)."""
    __tablename__ = "oauth_tickets"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String)   # state | signup
    token_hash: Mapped[str] = mapped_column(String, unique=True)
    data: Mapped[dict] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Inquiry(Base):
    """주문 전 매물 문의 (§15). (매물, 구매 업체) 쌍 하나가 한 건."""
    __tablename__ = "inquiries"
    __table_args__ = (UniqueConstraint("listing_id", "recycler_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"), index=True)
    recycler_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    reported: Mapped[bool] = mapped_column(Boolean, default=False)
    recycler_read_id: Mapped[int] = mapped_column(Integer, default=0)   # 여기까지 읽음(메시지 id)
    factory_read_id: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class InquiryMessage(Base):
    __tablename__ = "inquiry_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    inquiry_id: Mapped[int] = mapped_column(ForeignKey("inquiries.id"), index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    body: Mapped[str] = mapped_column(String)   # 연락처를 가린 뒤의 글. 원문은 저장하지 않는다
    masked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OrderDock(Base):
    """주문마다 구매자 입고지의 상·하차 조건. 기존 orders 표를 바꾸지 않으려고 따로 둔다(create_all로 새 표만 생김)."""
    __tablename__ = "order_docks"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    unload: Mapped[str] = mapped_column(String)              # forklift | crane | manual | none(운송 차량이 직접 하차)
    load_ok: Mapped[bool] = mapped_column(Boolean)           # 입고지에서 상차(반송·회수 짐 싣기) 지원 가능
    max_vehicle: Mapped[str] = mapped_column(String)         # 입고지에 들어올 수 있는 가장 큰 차: 1t | 2.5t | 5t | 11t | 25t
    hours: Mapped[str | None] = mapped_column(String, nullable=True)   # 상·하차 가능 시간(예: 평일 09:00~17:00)
    note: Mapped[str | None] = mapped_column(String, nullable=True)


class BuyRequest(Base):
    """구매자가 올리는 구매 희망: 이 원료를 이만큼, 이 가격에 사고 싶다. 판매자가 보고 매물로 응한다."""
    __tablename__ = "buy_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    recycler_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    material: Mapped[str] = mapped_column(String)            # 주 재질(크게 보여 줄 이름): PP, 철, 골판지 …
    item: Mapped[str] = mapped_column(String)                # 품목(작게): 사출 스크랩, 압축 캔 …
    waste_code: Mapped[str | None] = mapped_column(String, nullable=True)
    qty_kg: Mapped[float] = mapped_column(Float)
    price_krw_per_kg: Mapped[float | None] = mapped_column(Float, nullable=True)   # 비우면 가격 협의
    price_unit: Mapped[str] = mapped_column(String, default="kg")   # 화면에 먼저 보여 줄 단위: kg | ton (저장은 늘 원/kg)
    # 희망 가격 범위(원/kg)와 협상 여부. 나중에 생긴 칸이라 기존 DB에는 시작할 때 붙인다(main.add_late_columns)
    price_min_krw_per_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_max_krw_per_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    negotiable: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    need_by: Mapped[date | None] = mapped_column(Date, nullable=True)
    repeat: Mapped[str] = mapped_column(String, default="once")     # once | monthly
    delivery_address: Mapped[str | None] = mapped_column(String, nullable=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="open")     # open | closed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ListingTerms(Base):
    """판매자가 매물에 적는 거래 조건(운송 방법, 출고 시간). 기존 listings 표를 바꾸지 않으려고 따로 둔다."""
    __tablename__ = "listing_terms"
    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"), unique=True)
    transport: Mapped[str] = mapped_column(String, default="own")   # own(판매자 회사 차량) | matched(판매자가 화물차를 따로 구함)
    ship_hours: Mapped[str | None] = mapped_column(String, nullable=True)   # 출고 가능 시간(예: 평일 09:00~18:00)
    unload_forklift: Mapped[bool | None] = mapped_column(Boolean, nullable=True)   # 입고지 하차 때 판매자가 지게차 지원
    unload_crane: Mapped[bool | None] = mapped_column(Boolean, nullable=True)      # 입고지 하차 때 판매자가 크레인(카고크레인) 지원


class BagPhoto(Base):
    """등록 물품 사진(물품마다 최대 5장). 예전 한 장짜리 칸(bags.photo_*)에는 첫 장을 같이 넣어 둔다."""
    __tablename__ = "bag_photos"
    id: Mapped[int] = mapped_column(primary_key=True)
    bag_id: Mapped[int] = mapped_column(ForeignKey("bags.id"), index=True)
    content_type: Mapped[str] = mapped_column(String)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OrderInvoice(Base):
    """주문의 세금계산서 발행 요청(안전결제 주문에 붙음). 기존 orders 표를 바꾸지 않으려고 따로 둔다."""
    __tablename__ = "order_invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    email: Mapped[str] = mapped_column(String)              # 세금계산서 받을 이메일
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CompanyExtra(Base):
    """판매 공장 공개 정보 중 companies 표에 없는 것(대표자, 소개). 없으면 미등록으로 보인다."""
    __tablename__ = "company_extras"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), unique=True)
    ceo_name: Mapped[str | None] = mapped_column(String, nullable=True)
    intro: Mapped[str | None] = mapped_column(String, nullable=True)


class OrderTerms(Base):
    """주문 조건 중 orders 표에 없는 것. freight_payer=seller면 운임은 판매자 몫에서 나가고 구매자 보류액에 넣지 않는다."""
    __tablename__ = "order_terms"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    freight_payer: Mapped[str] = mapped_column(String, default="buyer")   # buyer | seller


class GmShipment(Base):
    """그물마중 반출 한 건. data는 화면(model.js·Model.swift)이 쓰는 기록 모양 그대로 둔다(docs/GEUMUL_API.md)."""
    __tablename__ = "gm_shipments"
    id: Mapped[str] = mapped_column(String, primary_key=True)          # SS-2611-006
    data: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class GmScan(Base):
    """그물마중 문서 사진(계량증명서 등)과 읽은 초안. 원본 사진은 지우지 않는다. status: draft | confirmed | rejected."""
    __tablename__ = "gm_scans"
    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[str] = mapped_column(String, index=True)
    kind: Mapped[str] = mapped_column(String, default="계량증명서")
    media_type: Mapped[str] = mapped_column(String)
    image: Mapped[bytes] = deferred(mapped_column(LargeBinary))
    result: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, default="draft")
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("companies.id"))
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
