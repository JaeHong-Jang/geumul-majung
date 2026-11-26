"""주문 상태가 바뀔 때 당사자에게 알림을 만든다(ARCHITECTURE §12.6).
알림 실패가 거래를 막지 않게 SAVEPOINT 안에서 만든다. 실패하면 로그에 남기고 거래 트랜잭션은 그대로 둔다."""
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.db.models import Company, Listing, Notification, Order


log = logging.getLogger(__name__)


# 바뀐 상태 → (제목, 본문). confirmed는 곧바로 settled가 이어지므로 알리지 않는다.
# arrived는 구매자가 검사와 함께 기록하고 같은 요청에서 정산이나 중재 알림이 이어지므로 알리지 않는다.
# dispatched는 주문과 같은 요청에서 바로 이어지므로(판매자 운송 배정) 새 주문 알림 하나만 보낸다.
MESSAGES = {
    "payment_held": ("새 주문", "주문 #{id} {item} 접수, 대금 보류, 판매자 출고 준비 필요"),
    "picked_up": ("출고 완료", "주문 #{id} {item} 판매자 출고, 운송 중"),
    "disputed": ("검사 불일치", "주문 #{id} {item} 중재 대기, 운영자 확인 중"),
    "settled": ("정산 완료", "주문 #{id} {item} 정산"),
    "rated": ("후기 완료", "주문 #{id} {item} 후기 등록"),
    "cancelled": ("주문 취소", "주문 #{id} {item} 취소"),
    "returned": ("반송 처리", "주문 #{id} {item} 반송"),
}


def order_item(listing: Listing) -> str:
    """알림 본문의 품목: 폐기물 이름(괄호 설명 제외)과 무게. 제목과 같은 말만 반복되지 않게 한다."""
    name = waste_names().get(listing.waste_code, listing.waste_code).split("(")[0].strip()
    return f"{name} {float(listing.total_kg):,.0f} kg"


def notify_order(session: Session, order: Order, frm: str, to: str, by: int | None) -> None:
    message = MESSAGES.get(to)
    if message is None:
        return
    try:
        with session.begin_nested():
            listing = session.get(Listing, order.listing_id)
            skip = {None, by, *([order.recycler_id] if frm == "ordered" else [])}   # 주문한 본인에게는 알리지 않음
            targets = {listing.factory_id, order.recycler_id, order.hauler_id} - skip
            for company in session.query(Company).filter(Company.id.in_(targets)):
                if company.notify_orders:
                    session.add(Notification(company_id=company.id, title=message[0],
                                             body=message[1].format(id=order.id, item=order_item(listing)), order_id=order.id))
    except Exception:
        log.exception("알림 생성 실패(order=%s, to=%s). 거래는 계속 진행", order.id, to)


def notify_companies(session: Session, company_ids: set[int], title: str, body: str, order_id: int | None = None) -> None:
    """주문 상태 변경이 아닌 알림(메시지 등). 12.6 `orders` 설정을 따르고, 실패해도 호출한 쪽 트랜잭션은 그대로."""
    try:
        with session.begin_nested():
            for company in session.query(Company).filter(Company.id.in_(company_ids)):
                if company.notify_orders:
                    session.add(Notification(company_id=company.id, title=title, body=body, order_id=order_id))
    except Exception:
        log.exception("알림 생성 실패(%s)", title)


def unread_count(session: Session, me: Company) -> int:
    return session.query(func.count(Notification.id)).filter_by(company_id=me.id, read=False).scalar()
