"""운송기사 역할을 없앤 뒤(계약 28절) 이미 있는 DB의 진행 중 주문을 판매자 운송으로 옮긴다. 한 번만 돌리면 되고 다시 돌려도 바뀌는 것이 없다.
실행: DATABASE_URL=... python scripts/migrate_no_carrier.py

- 예전 운송기사 배차 주문(transport=matched) 중 끝나지 않은 것: transport=seller, 운반 회사=판매 공장, 운임 0원.
- 아직 운송기사를 기다리던 주문(payment_held): 판매 공장 출고 준비(dispatched)로 넘기고 이력을 남긴다.
- 끝난 주문(정산, 후기, 취소, 반송)은 기록이므로 그대로 둔다. 예전 운송기사 계정 행도 지우지 않는다(로그인과 API는 서버가 막음).
"""
from sqlalchemy import select

from app.core.util import now
from app.db.models import Listing, Order, OrderHistory
from app.db.session import SessionLocal

OPEN = ("payment_held", "dispatched", "picked_up", "arrived", "confirmed", "disputed")


def main() -> None:
    with SessionLocal() as s:
        moved = 0
        for order in s.scalars(select(Order).where(Order.transport == "matched", Order.status.in_(OPEN))):
            factory_id = s.get(Listing, order.listing_id).factory_id
            order.transport, order.hauler_id, order.freight_krw = "seller", factory_id, 0
            if order.status == "payment_held":
                s.add(OrderHistory(order_id=order.id, from_status="payment_held", to_status="dispatched",
                                   by_company_id=None, at=now(), note="운송기사 없앰, 판매자 운송으로 전환"))
                order.status, order.updated_at = "dispatched", now()
            moved += 1
        s.commit()
        print(f"판매자 운송으로 옮긴 주문 {moved}건")


if __name__ == "__main__":
    main()
