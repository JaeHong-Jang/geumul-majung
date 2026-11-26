"""규칙: 검사·계산·조회 도우미. 다른 기능은 이 파일만 부른다."""
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.core.deps import get_or_404, need_role
from app.core.util import dec, dsum, KST
from app.db.models import Company, Listing, Pool, PoolMember
from app.features.listings.service import wname
from app.features.market.service import market_for
from app.tools.data import assumptions


def today() -> date:
    return datetime.now(KST).date()


def effective_status(pool: Pool) -> str:
    """기한이 지난 open은 'closed'로 보인다(저장하지 않음). 이때도 연장·즉시 판매·취소는 할 수 있다."""
    return "closed" if pool.status == "open" and pool.deadline < today() else pool.status


def pool_view(session: Session, pool: Pool, me: Company, with_members: bool) -> dict:
    members = members_of(session, pool.id)
    prices = [m.price_krw_per_kg for m in members]
    applied = pool.applied_price if pool.status == "sold" else (min(prices) if prices else None)
    out = {"id": pool.id, "title": pool.title, "waste_code": pool.waste_code, "waste_name": wname(pool.waste_code),
           "grade": pool.grade, "target_material": pool.target_material, "status": effective_status(pool),
           "target_kg": pool.target_kg, "current_kg": float(dsum(m.kg for m in members)),
           "factory_count": len({m.company_id for m in members}), "deadline": pool.deadline.isoformat(),
           "applied_price_krw_per_kg": applied, "min_price_krw_per_kg": applied, "is_owner": pool.creator_id == me.id}
    joined = any(m.company_id == me.id for m in members)
    # 참여 화면용(§18): 내가 만들었거나 참여한 것을 구분하고, 참여 전 공장에게는 남은 물량·참여 단가 하한·낼 수 있는 내 판매를 준다.
    out.update({"joined": joined, "mine": joined or pool.creator_id == me.id,
                "remaining_kg": max(float(dec(pool.target_kg) - dsum(m.kg for m in members)), 0.0),
                "min_join_price_krw_per_kg": pool_price_floor(session, pool)})
    if not joined and pool.status == "open" and me.role == "factory":
        taken = {pm.listing_id for pm in session.query(PoolMember)}
        out["joinable_listings"] = [
            {"id": l.id, "total_kg": l.total_kg, "price_krw_per_kg": l.price_krw_per_kg}
            for l in session.query(Listing).filter(Listing.factory_id == me.id, Listing.status.in_(("posted", "bundle_wait")),
                                                   Listing.waste_code == pool.waste_code, Listing.grade == pool.grade).order_by(Listing.id)
            if l.id not in taken]
    if with_members:
        others = 0
        rows = []
        for m in members:
            mine = m.company_id == me.id
            if not mine:
                others += 1
            rows.append({"name": me.name if mine else f"참여 공장 {others}", "kg": m.kg,
                         "price_krw_per_kg": m.price_krw_per_kg if mine else None, "mine": mine})
        out["members"] = rows
    return out


def pool_price_floor(session: Session, pool: Pool) -> float | None:
    """참여 단가 하한 = 시세(없으면 만든 공장 단가) × pool_min_price_ratio. 비율은 harness.yaml의 가정(§17)."""
    ratio = dec(assumptions()["pool_min_price_ratio"])
    market = market_for(pool.target_material)
    if market and market["price"]:
        base = dec(market["price"])
    else:
        creator_member = session.query(PoolMember).filter_by(pool_id=pool.id, company_id=pool.creator_id).first()
        if creator_member is None:
            return None
        base = dec(creator_member.price_krw_per_kg)
    return float((base * ratio).quantize(dec("0.01")))


def my_listing(session: Session, listing_id: int, me: Company) -> Listing:
    l = get_or_404(session, Listing, listing_id)
    if l.factory_id != me.id:
        raise HTTPException(404, "판매를 찾을 수 없음")
    if l.status not in ("posted", "bundle_wait"):
        raise HTTPException(409, "게시 중이거나 묶음 대기 중인 판매만 공동판매에 쓸 수 있음")
    if session.query(PoolMember).filter_by(listing_id=l.id).first():
        raise HTTPException(409, "이미 공동판매에 참여 중인 판매")
    return l


def managed_pool(session: Session, pool_id: int, me: Company) -> Pool:
    """만든 공장만. 참여만 한 공장은 403, 관계없는 공장은 404."""
    need_role(me, "factory")
    get_or_404(session, Pool, pool_id)
    pool = lock_pool(session, pool_id)
    if pool.creator_id != me.id:
        if session.query(PoolMember).filter_by(pool_id=pool.id, company_id=me.id).first():
            raise HTTPException(403, "공동판매를 만든 공장만 할 수 있음")
        raise HTTPException(404, "공동판매를 찾을 수 없음")
    if pool.status != "open":
        raise HTTPException(409, "이미 끝났거나 취소된 공동판매")
    return pool


def lock_pool(session: Session, pool_id: int) -> Pool:
    return session.query(Pool).filter(Pool.id == pool_id).with_for_update().populate_existing().one()


def members_of(session: Session, pool_id: int) -> list[PoolMember]:
    return session.query(PoolMember).filter_by(pool_id=pool_id).order_by(PoolMember.id).all()


def claim_listing(session: Session, listing_id: int) -> bool:
    """내 판매를 bundle_wait로 묶는다. 이미 팔리거나 내려간 판매면 False."""
    got = session.execute(update(Listing).where(Listing.id == listing_id, Listing.status.in_(("posted", "bundle_wait")))
                          .values(status="bundle_wait"), execution_options={"synchronize_session": False})
    return got.rowcount == 1


def drop_member(session: Session, pool: Pool, member: PoolMember, relist: bool) -> None:
    """참여를 뺀다. relist면 판매를 posted로 되돌리고(withdrawn 아님), 참여자가 0이 되면 pool은 cancelled."""
    session.execute(delete(PoolMember).where(PoolMember.id == member.id), execution_options={"synchronize_session": False})
    if relist:
        session.execute(update(Listing).where(Listing.id == member.listing_id, Listing.status == "bundle_wait")
                        .values(status="posted"), execution_options={"synchronize_session": False})
    left = session.query(PoolMember).filter_by(pool_id=pool.id).count()
    if left == 0 and pool.status == "open":
        pool.status = "cancelled"


def drop_listing(session: Session, listing_id: int) -> None:
    """판매를 내릴 때(withdraw) 그 판매가 들어 있던 공동판매 참여도 뺀다."""
    member = session.query(PoolMember).filter_by(listing_id=listing_id).first()
    if member is not None:
        drop_member(session, lock_pool(session, member.pool_id), member, relist=False)


def finish_sale(session: Session, pool: Pool) -> None:
    """참여 판매 전부를 최저 단가로 통일해 posted로 올리고 pool을 sold로 닫는다."""
    members = members_of(session, pool.id)
    applied = min(m.price_krw_per_kg for m in members)
    for m in members:
        session.execute(update(Listing).where(Listing.id == m.listing_id, Listing.status == "bundle_wait")
                        .values(status="posted", price_krw_per_kg=applied), execution_options={"synchronize_session": False})
    pool.status, pool.applied_price = "sold", applied
