"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_company, get_or_404, need_role
from app.core.util import dec, dsum
from app.db.models import Bag, Company, Pool, PoolMember
from app.db.session import get_session
from app.features.listings.service import wname
from app.features.pools.schemas import DeadlineIn, JoinIn, PoolIn, PoolPatch
from app.features.pools.service import (
    claim_listing,
    drop_member,
    effective_status,
    finish_sale,
    lock_pool,
    managed_pool,
    members_of,
    my_listing,
    pool_price_floor,
    pool_view,
    today,
)
from app.tools.calc import haversine_km
from app.tools.data import assumptions


router = APIRouter(prefix="/v1")


@router.get("/pools")
def list_pools(waste_code: str | None = None, mine: str | None = None, me: Company = Depends(current_company),
               session: Session = Depends(get_session)):
    need_role(me, "factory")
    joined = {m.pool_id for m in session.query(PoolMember).filter_by(company_id=me.id)}
    q = session.query(Pool).order_by(Pool.id.desc())
    if (mine or "").lower() in ("1", "true"):
        return [pool_view(session, p, me, True) for p in q if p.creator_id == me.id or p.id in joined]
    radius = assumptions()["bundle_radius_km"]
    out = []
    for p in q.filter(Pool.status == "open", Pool.deadline >= today()):
        if waste_code and p.waste_code != waste_code:
            continue
        creator = session.get(Company, p.creator_id)
        if p.creator_id == me.id or p.id in joined or haversine_km(me.lat, me.lon, creator.lat, creator.lon) > radius:
            continue
        out.append(pool_view(session, p, me, False))
    return out


@router.get("/pools/{pool_id}")
def get_pool(pool_id: int, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    """참여 화면용 상세. 내가 만들었거나 참여한 것은 members까지, 참여 전 공장은 반경 안 모집 중인 것만(없으면 404)."""
    need_role(me, "factory")
    pool = get_or_404(session, Pool, pool_id)
    member = session.query(PoolMember).filter_by(pool_id=pool.id, company_id=me.id).first() is not None
    if pool.creator_id == me.id or member:
        return pool_view(session, pool, me, True)
    creator = session.get(Company, pool.creator_id)
    if (pool.status != "open" or pool.deadline < today()
            or haversine_km(me.lat, me.lon, creator.lat, creator.lon) > assumptions()["bundle_radius_km"]):
        raise HTTPException(404, "공동판매를 찾을 수 없음")
    return pool_view(session, pool, me, False)


@router.post("/pools", status_code=201)
def create_pool(body: PoolIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory", verified=True)
    l = my_listing(session, body.listing_id, me)
    if body.deadline < today():
        raise HTTPException(400, "모집 기한은 오늘 이후만 가능")
    if body.target_kg <= l.total_kg:
        raise HTTPException(400, "목표 물량은 내 물량보다 커야 함")
    bag = session.query(Bag).filter_by(listing_id=l.id).order_by(Bag.id).first()
    material = bag.target_material if bag else None
    if not claim_listing(session, l.id):
        raise HTTPException(409, "게시 중이거나 묶음 대기 중인 판매만 공동판매에 쓸 수 있음")
    pool = Pool(creator_id=me.id, title=f"{wname(l.waste_code)} {material or ''} 공동판매".replace("  ", " ").strip(),
                waste_code=l.waste_code, grade=l.grade, target_material=material, target_kg=body.target_kg,
                deadline=body.deadline, status="open")
    session.add(pool)
    session.flush()
    session.add(PoolMember(pool_id=pool.id, company_id=me.id, listing_id=l.id, kg=l.total_kg, price_krw_per_kg=l.price_krw_per_kg))
    session.commit()
    return pool_view(session, pool, me, True)


@router.post("/pools/{pool_id}/join")
def join_pool(pool_id: int, body: JoinIn, me: Company = Depends(current_company), session: Session = Depends(get_session)):
    need_role(me, "factory", verified=True)
    get_or_404(session, Pool, pool_id)
    pool = lock_pool(session, pool_id)   # 동시에 참여해도 목표 도달 판정과 중복 검사가 한 줄로 이어진다
    if effective_status(pool) != "open":
        raise HTTPException(409, "모집 중인 공동판매가 아님")
    l = my_listing(session, body.listing_id, me)
    if session.query(PoolMember).filter_by(pool_id=pool.id, company_id=me.id).first():
        raise HTTPException(409, "이미 참여 중인 공동판매")
    if (l.waste_code, l.grade) != (pool.waste_code, pool.grade):
        raise HTTPException(400, "폐기물 코드와 등급이 같은 판매만 참여할 수 있음")
    creator = session.get(Company, pool.creator_id)
    floor = pool_price_floor(session, pool)
    if floor is not None and dec(l.price_krw_per_kg) < dec(floor):
        raise HTTPException(400, f"참여 단가는 {floor:g}원/kg 이상만 가능(공동판매 단가는 참여 단가 중 최저로 결정)")
    if haversine_km(me.lat, me.lon, creator.lat, creator.lon) > assumptions()["bundle_radius_km"]:
        raise HTTPException(400, "공동판매 반경 밖의 공장")
    if not claim_listing(session, l.id):
        raise HTTPException(409, "게시 중이거나 묶음 대기 중인 판매만 공동판매에 쓸 수 있음")
    session.add(PoolMember(pool_id=pool.id, company_id=me.id, listing_id=l.id, kg=l.total_kg, price_krw_per_kg=l.price_krw_per_kg))
    session.flush()
    if dsum(m.kg for m in members_of(session, pool.id)) >= dec(pool.target_kg):
        finish_sale(session, pool)
    session.commit()
    return pool_view(session, pool, me, True)


@router.patch("/pools/{pool_id}")
def patch_pool(pool_id: int, body: PoolPatch, me: Company = Depends(current_company),
               session: Session = Depends(get_session)):
    pool = managed_pool(session, pool_id, me)
    current = dsum(m.kg for m in members_of(session, pool.id))
    if body.target_kg is not None:
        if dec(body.target_kg) <= current:
            raise HTTPException(400, "목표 물량은 현재 물량보다 커야 함")
        pool.target_kg = body.target_kg
    if body.deadline is not None:
        if body.deadline < today():
            raise HTTPException(400, "모집 기한은 오늘 이후만 가능")
        pool.deadline = body.deadline
    session.commit()
    return pool_view(session, pool, me, True)


@router.post("/pools/{pool_id}/deadline")
def pool_deadline(pool_id: int, body: DeadlineIn, me: Company = Depends(current_company),
                  session: Session = Depends(get_session)):
    need_role(me, "factory")
    if body.action == "cancel":   # 참여 공장이면 누구나 자기 참여만 뺀다
        get_or_404(session, Pool, pool_id)
        pool = lock_pool(session, pool_id)
        member = session.query(PoolMember).filter_by(pool_id=pool.id, company_id=me.id).first()
        if member is None:
            raise HTTPException(404, "공동판매를 찾을 수 없음")
        if pool.status != "open":
            raise HTTPException(409, "이미 끝났거나 취소된 공동판매")
        drop_member(session, pool, member, relist=True)
    else:
        pool = managed_pool(session, pool_id, me)
        if body.action == "extend":
            if body.new_deadline is None:
                raise HTTPException(400, "기한 연장에는 새 기한 입력 필요")
            if body.new_deadline < today():
                raise HTTPException(400, "모집 기한은 오늘 이후만 가능")
            pool.deadline = body.new_deadline
        else:
            finish_sale(session, pool)   # 현재 물량으로 판매(참여자는 항상 1곳 이상)
    session.commit()
    return pool_view(session, pool, me, True)
