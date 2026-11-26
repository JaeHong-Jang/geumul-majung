"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.deps import get_or_404, need_role
from app.core.util import dec, iso, MAX_ID, won
from app.db.models import Bag, BagPass, Company, HandoverSection, Listing, Order, OrderDock, OrderHistory, OrderInvoice, OrderPhoto, OrderTerms
from app.features.companies.service import has_permit
from app.features.orders.schemas import OrderExtras, WeightsIn
from app.features.orders.state import change_status, held_goods, pg_authorize


def sections(session: Session, order_id: int) -> dict:
    """주문의 인계서 칸(인계서 기능이 쓰고, 주문 목록의 진행 표시에도 쓴다)."""
    rows = session.query(HandoverSection).filter_by(order_id=order_id).all()
    return {r.section: r.data for r in rows}


def without_hauler_line(order: Order, out: dict) -> dict:
    """운송기사가 없는 주문(판매자 운송, 직접 수거)의 정산에는 기사 줄이 없다. 예전에 저장된 정산 값에서도 뺀다(§20)."""
    if order.transport != "matched" and isinstance(out.get("settlement"), dict):
        out["settlement"] = {k: v for k, v in out["settlement"].items() if k != "hauler_krw"}
    return out


def listing_bags(session: Session, order: Order) -> list[Bag]:
    """주문의 마대. 주문 때 남긴 스냅샷을 쓴다(반송으로 마대가 판매에서 풀려도 주문 기록은 그대로)."""
    if order.bag_snapshot:
        return session.query(Bag).filter(Bag.id.in_(order.bag_snapshot)).order_by(Bag.id).all()
    return session.query(Bag).filter_by(listing_id=order.listing_id).order_by(Bag.id).all()


def order_unit_price(order: Order, listing: Listing) -> float:
    """정산·중재 단가는 주문 때의 단가. 스냅샷이 없는 옛 주문만 판매 단가를 쓴다."""
    return order.unit_price_krw_per_kg if order.unit_price_krw_per_kg is not None else listing.price_krw_per_kg


def check_weights(session: Session, order: Order, body: WeightsIn) -> list[dict]:
    """주문의 모든 마대 무게가 정확히 한 번씩 있어야 한다."""
    ids = sorted(w.bag_id for w in body.bag_weights)
    if ids != [b.id for b in listing_bags(session, order)]:
        raise HTTPException(400, "주문의 모든 물품 무게 입력 필요")
    return [w.model_dump() for w in body.bag_weights]


def free_bags(session: Session, listing: Listing) -> None:
    """반송: 판매는 withdrawn, 마대는 판매에서 풀고 통과증 삭제(registered). 다시 등급을 받아야 재판매."""
    ids = [b.id for b in session.query(Bag).filter_by(listing_id=listing.id)]
    session.execute(update(Listing).where(Listing.id == listing.id).values(status="withdrawn"),
                    execution_options={"synchronize_session": False})
    if ids:
        session.execute(delete(BagPass).where(BagPass.bag_id.in_(ids)), execution_options={"synchronize_session": False})
        session.execute(update(Bag).where(Bag.id.in_(ids))
                        .values(listing_id=None, status="registered", grade=None, purity=None),
                        execution_options={"synchronize_session": False})


def order_options(order: Order) -> dict:
    return {"transport": order.transport, "payment": order.payment, "delivery_address": order.delivery_address,
            "desired_date": order.desired_date.isoformat() if order.desired_date else None, "note": order.note,
            **({"legal_note": "운반 허가 확인 필요"} if order.transport == "self" else {})}


def order_party(session: Session, order_id: int, me: Company) -> tuple[Order, Listing]:
    order = get_or_404(session, Order, order_id)
    listing = session.get(Listing, order.listing_id)
    if me.role != "operator" and me.id not in (order.recycler_id, order.hauler_id, listing.factory_id):
        raise HTTPException(403, "이 주문의 당사자가 아님")
    return order, listing


def order_dict(session: Session, order: Order, listing: Listing) -> dict:
    ids = [b.id for b in listing_bags(session, order)]
    hist = session.query(OrderHistory).filter_by(order_id=order.id).order_by(OrderHistory.id).all()
    return {"id": order.id, "status": order.status, "listing_id": order.listing_id, "goods_krw": order.goods_krw,
            "freight_cap_krw": order.freight_cap_krw, "held_krw": order.held_krw,
            "unit_price_krw_per_kg": order_unit_price(order, listing), "freight_krw": order.freight_krw, "factory_id": listing.factory_id, "recycler_id": order.recycler_id,
            "hauler_id": order.hauler_id, "waste_code": listing.waste_code, "total_kg": listing.total_kg,
            "bag_ids": ids, "pickup_weights": order.pickup_weights,
            "inspect_weights": order.inspect_weights, "settlement": order.settlement,
            "allbaro_no": order.allbaro_no, "weight_warning": order.weight_warning,
            "dispute_reason": order.dispute_reason, "created_at": iso(order.created_at),
            "updated_at": iso(order.updated_at), **order_options(order),
            "dock": dock_dict(session, order.id),
            "tax_invoice": invoice_dict(session, order.id),
            "freight_payer": freight_payer(session, order),
            "history": [{"from": h.from_status, "to": h.to_status, "by": h.by_company_id, "at": iso(h.at),
                         "note": h.note} for h in hist]}


def check_orderable(me: Company, listing: Listing) -> None:
    if not has_permit(me, listing.waste_code):
        raise HTTPException(403, "이 폐기물 코드의 허가 없음")


DOCK_FIELDS = ("unload", "load_ok", "max_vehicle", "hours", "note")


def dock_dict(session: Session, order_id: int) -> dict | None:
    d = session.query(OrderDock).filter_by(order_id=order_id).first()
    return {k: getattr(d, k) for k in DOCK_FIELDS} if d else None


def freight_payer(session: Session, order: Order) -> str:
    """판매자 운송은 운임 판매자 부담. 예전 주문만 저장된 부담 주체를 읽는다."""
    if order.transport == "seller":
        return "seller"
    t = session.query(OrderTerms).filter_by(order_id=order.id).first()
    return t.freight_payer if t else "buyer"


def invoice_dict(session: Session, order_id: int) -> dict | None:
    i = session.query(OrderInvoice).filter_by(order_id=order_id).first()
    return {"email": i.email} if i else None


def place_order(session: Session, me: Company, listing: Listing, opts: OrderExtras) -> Order:
    """매물을 선점(조건부 UPDATE)하고 주문·보류를 만든다. 커밋은 호출한 쪽이 한다(batch는 한 트랜잭션).
    운송기사 배차가 없으므로 결제 보류 직후 바로 배정한다: 판매자 운송은 판매 공장, 직접 수거는 구매 업체. 운임은 0원."""
    # 내가 읽은 단가까지 조건에 넣는다: 그 사이 판매자가 단가를 바꿨으면 선점이 안 되고 409(주문 금액과 단가가 어긋나지 않게)
    got = session.execute(update(Listing).where(Listing.id == listing.id, Listing.status == "posted",
                                                Listing.price_krw_per_kg == listing.price_krw_per_kg)
                          .values(status="sold"), execution_options={"synchronize_session": False})
    if got.rowcount == 0:
        now_row = session.execute(select(Listing.status, Listing.price_krw_per_kg).where(Listing.id == listing.id)).one()
        if now_row.status == "posted":
            raise HTTPException(409, "그 사이 판매 단가가 바뀜, 다시 확인 필요")
        raise HTTPException(409, "게시 중인 판매가 아님")
    goods = won(dec(listing.total_kg) * dec(listing.price_krw_per_kg))
    held = 0 if opts.payment == "invoice" else held_goods(listing.total_kg, listing.price_krw_per_kg)
    order = Order(listing_id=listing.id, recycler_id=me.id, goods_krw=goods, freight_cap_krw=0, held_krw=held,
                  transport=opts.transport, payment=opts.payment, delivery_address=opts.delivery_address,
                  desired_date=opts.desired_date, note=opts.note, unit_price_krw_per_kg=listing.price_krw_per_kg,
                  bag_snapshot=[b.id for b in session.query(Bag).filter_by(listing_id=listing.id).order_by(Bag.id)])
    session.add(order)
    session.flush()
    if opts.dock is not None:
        session.add(OrderDock(order_id=order.id, **opts.dock.model_dump()))
    if opts.tax_invoice is not None:
        session.add(OrderInvoice(order_id=order.id, email=opts.tax_invoice.email))
    pg_authorize(session, order)
    change_status(session, order, "payment_held", None)
    hauler = me.id if opts.transport == "self" else listing.factory_id
    change_status(session, order, "dispatched", me.id if opts.transport == "self" else None, hauler_id=hauler, freight_krw=0)
    return order


def order_summary(order: Order) -> dict:
    return {"id": order.id, "status": order.status, "goods_krw": order.goods_krw,
            "freight_cap_krw": order.freight_cap_krw, "held_krw": order.held_krw, "listing_id": order.listing_id,
            **order_options(order)}


def load_orderable(session: Session, me: Company, listing_ids: list[int]) -> list[Listing]:
    """묶음 주문·미리보기용 검사: 없으면 404, 허가 없으면 403, 게시 중이 아니면 409."""
    listings = [get_or_404(session, Listing, i) for i in listing_ids]
    for l in listings:
        check_orderable(me, l)
    for l in listings:
        if l.status != "posted":
            raise HTTPException(409, "게시 중이 아닌 판매가 포함됨")
    return listings


def my_order_as(session: Session, order_id: int, me: Company, role: str) -> Order:
    """운반 단계(hauler)는 배정된 회사(판매자 운송이면 판매 공장, 직접 수거면 구매 업체), 검사와 취소(recycler)는 주문한 구매 업체."""
    if role == "hauler":
        order = session.get(Order, order_id) if 1 <= order_id <= MAX_ID else None
        if order is None or order.hauler_id != me.id or order.transport not in ("seller", "self"):
            raise HTTPException(403, "이 역할로는 사용할 수 없음")
        return order
    need_role(me, role)
    order = get_or_404(session, Order, order_id)
    if me.id != order.recycler_id:
        raise HTTPException(403, "내 주문 아님")
    return order


def party_order(session: Session, order_id: int, me: Company) -> tuple[Order, Listing]:
    """당사자(판매·구매·배정 운반)만. 아니면 있는 주문이라도 404로 숨긴다."""
    order = get_or_404(session, Order, order_id)
    listing = session.get(Listing, order.listing_id)
    if me.id not in (listing.factory_id, order.recycler_id, order.hauler_id):
        raise HTTPException(404, "주문을 찾을 수 없음")
    return order, listing


def photo_dict(p: OrderPhoto) -> dict:
    return {"id": p.id, "stage": p.stage, "content_type": p.content_type, "created_at": iso(p.created_at)}


def list_my_orders(session: Session, me: Company) -> list[dict]:
    """내가 당사자인 주문 목록(주문 화면과 세 앱 첫 화면이 함께 쓴다)."""
    q = session.query(Order, Listing).join(Listing, Listing.id == Order.listing_id)
    if me.role != "operator":
        q = q.filter((Order.recycler_id == me.id) | (Order.hauler_id == me.id) | (Listing.factory_id == me.id))
    out = []
    for o, l in q.order_by(Order.updated_at.desc(), Order.id.desc()):
        parties = {"factory": l.factory_id, "recycler": o.recycler_id, "hauler": o.hauler_id}
        role = next((r for r, cid in parties.items() if cid == me.id), me.role)
        ids = dict.fromkeys(cid for cid in parties.values() if cid is not None and cid != me.id)   # 판매자 운송이면 판매 공장이 운반 회사이기도 하므로 한 번만
        names = [session.get(Company, cid).name for cid in ids]
        bags = listing_bags(session, o)
        out.append(without_hauler_line(o, {"id": o.id, "status": o.status, "role_in_order": role, "waste_name": waste_names().get(l.waste_code, l.waste_code),
                    "total_kg": l.total_kg, "goods_krw": o.goods_krw, "freight_cap_krw": o.freight_cap_krw,
                    "freight_krw": o.freight_krw, "counterparty_names": names, "updated_at": iso(o.updated_at), "grade": l.grade,
                    "bag_count": len(bags), "target_material": bags[0].target_material if bags else None,
                    "settlement": o.settlement, **order_options(o),
                    "handover": {**{k: k in sections(session, o.id) for k in ("emitter", "carrier", "processor")},
                                 "allbaro_no": o.allbaro_no}}))
    return out

