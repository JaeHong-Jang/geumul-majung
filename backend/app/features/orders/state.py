"""주문 상태 전이(계약 §4, v0.2 §8.5·8.6) + 가짜 PG.
모든 상태 변경은 `UPDATE ... WHERE id=? AND status=<이전 상태>`의 영향 행 수로 판정한다(0이면 409)."""
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.util import dec, dsum, now, won
from app.db.models import Order, OrderHistory, Payment
from app.features.notifications.service import notify_order


TRANSITIONS = {
    "ordered": {"payment_held"},
    "payment_held": {"dispatched", "cancelled"},
    "dispatched": {"picked_up", "cancelled"},      # 출고 전에는 구매자가 취소할 수 있음
    "picked_up": {"arrived"},
    "arrived": {"confirmed", "disputed"},
    "confirmed": {"settled"},
    "disputed": {"settled", "returned"},           # 운영자 중재
    "settled": {"rated"},
}


# 사용자에게 보이는 상태 이름. 화면 문구에 영어 상태값(dispatched 등)을 넣지 않는다(§18).
STATE_KO = {"ordered": "주문 접수", "payment_held": "결제 보류", "dispatched": "출고 준비", "picked_up": "운송 중",
            "arrived": "입고지 도착", "confirmed": "검수 확정", "settled": "정산 완료", "rated": "후기 완료", "disputed": "중재 대기",
            "cancelled": "취소", "returned": "반송"}


def state_ko(status: str) -> str:
    return STATE_KO.get(status, "알 수 없음")


def lock_order(session: Session, order_id: int) -> Order:
    """주문 행을 SELECT … FOR UPDATE로 잠그고 최신값으로 다시 읽는다(PostgreSQL. SQLite는 무시)."""
    return session.query(Order).filter(Order.id == order_id).with_for_update().populate_existing().one()


def change_status(session: Session, order: Order, to: str, by: int | None, note: str | None = None, **values) -> None:
    """조건부 UPDATE로 전이. 표에 없는 전이·이미 바뀐 상태는 409. values는 같은 UPDATE에 함께 쓴다."""
    frm = order.status
    if to not in TRANSITIONS.get(frm, set()):
        raise HTTPException(409, f"현재 '{state_ko(frm)}' 상태에서는 '{state_ko(to)}'(으)로 바꿀 수 없음")
    got = session.execute(update(Order).where(Order.id == order.id, Order.status == frm)
                          .values(status=to, updated_at=now(), **values), execution_options={"synchronize_session": False})
    if got.rowcount == 0:
        raise HTTPException(409, "다른 요청이 먼저 처리됨, 화면 새로 고침 필요")
    session.add(OrderHistory(order_id=order.id, from_status=frm, to_status=to, by_company_id=by, at=now(), note=note))
    session.flush()
    session.refresh(order)
    notify_order(session, order, frm, to, by)


# ── 가짜 PG ──
def pg_authorize(session: Session, order: Order) -> None:
    session.add(Payment(order_id=order.id, amount_krw=order.held_krw,
                       status="invoice" if order.payment == "invoice" else "authorized"))


def pg_set(session: Session, order: Order, status: str) -> None:
    if order.payment == "invoice":   # 세금계산서 주문은 물건값을 보류하지 않으므로 Payment 상태를 바꾸지 않는다(§12.4)
        return
    pay = session.query(Payment).filter_by(order_id=order.id).one()
    pay.status = status


def kg_sum(weights: list[dict]):
    return dsum(w["kg"] for w in weights)


def held_goods(total_kg, price_krw_per_kg) -> int:
    """보류하는 물건값 = round(goods × 1.05). 검사 무게가 +5%까지 늘어도 공장 몫이 보류 안에 들어오도록
    반올림 전 정확한 곱(총kg × 단가 × 1.05)에서 한 번만 반올림한다."""
    return won(dec(total_kg) * dec(price_krw_per_kg) * Decimal("1.05"))


def settle(order: Order, factory_krw: int, goods_refunded: bool = False, **extra) -> dict:
    """정산 숫자. 공장 몫을 자르지 않는다(min 금지). 보류액에서 공장 몫을 뺀 나머지는 구매자에게 환불.
    운송은 판매자가 맡고 운임은 판매자 부담이라 기사 정산 줄이 없다.
    goods_refunded(처리·반송 중재): 물건값 전액 환불이므로 공장 몫은 환불 계산에서 뺀다.
    extra: treat의 factory_charge_krw·recycler_fee_krw 같은 추가 칸."""
    invoice = order.payment == "invoice"   # 세금계산서: 물건값은 앱 밖에서 직접 정산, 보류분 없음
    refund = order.held_krw if goods_refunded or invoice else order.held_krw - factory_krw
    if refund < 0:
        raise HTTPException(400, "정산액이 보류 금액을 넘어 처리할 수 없음, 운영자에게 문의 필요")
    return {"factory_krw": factory_krw, "platform_krw": 0, "refund_krw": refund,
            **({"invoice": True} if invoice else {}), **extra}


def goods_by_weight(weights: list[dict], price_krw_per_kg: float) -> int:
    return won(kg_sum(weights) * dec(price_krw_per_kg))
