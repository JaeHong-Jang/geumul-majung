"""경로(라우터)만 둔다. 검사·계산·조회 규칙은 service.py."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import waste_names
from app.core.deps import current_company
from app.db.models import Company
from app.db.session import get_session
from app.features.market import live
from app.features.market.service import latest_prices, market_volumes, price_history


router = APIRouter(prefix="/v1")


@router.get("/waste-codes")
def waste_codes():
    return [{"code": code, "name": name} for code, name in waste_names().items()]


@router.get("/market/prices")
def market_prices(category: str | None = None, me: Company = Depends(current_company)):
    return [p for p in latest_prices() if not category or p["category"] == category]


def _round_price(x: float) -> int:
    step = 50 if x >= 1000 else 10
    return int(round(x / step) * step)


@router.get("/market/suggest")
def market_suggest(material: str, me: Company = Depends(current_company)):
    """주 재질의 최근 시세(원/kg, 환경공단 재활용 시세)와 지역별 범위로 추천 판매 단가를 낸다.
    시세 자료는 모두 원/kg 기준이라 추천도 원/kg. 대응하는 시세가 없으면 item=None."""
    from app.tools.calc import latest_price, price_item_for
    item = price_item_for(material)
    p = latest_price(item) if item else None
    if not p:
        return {"item": None, "material": material}
    low, high = _round_price(p["low"]), _round_price(p["high"])
    return {"item": p["item"], "material": material, "date": p["date"], "unit": p["unit"], "price": p["price"],
            "region_low": p["low"], "region_high": p["high"],
            "suggest_low": min(low, high), "suggest_high": max(low, high)}


@router.get("/market/prices/{item}/history")
def market_price_history(item: str, me: Company = Depends(current_company)):
    got = price_history(item)
    if not got:
        raise HTTPException(404, "해당 품목의 시세 없음")
    return got


@router.get("/market/live")
def market_live(me: Company = Depends(current_company)):
    try:
        return live.live_quotes()
    except live.LiveError as e:
        raise HTTPException(503, str(e))


@router.get("/market/live/{symbol}")
def market_live_chart(symbol: str, range: str = "1d", me: Company = Depends(current_company)):
    if symbol not in live.SYMBOLS:
        raise HTTPException(404, "실시간 시세가 없는 품목")
    if range not in live.RANGES:
        raise HTTPException(400, f"기간은 {', '.join(live.RANGES)} 중 하나만 가능")
    try:
        return live.live_chart(symbol, range)
    except live.LiveError as e:
        raise HTTPException(503, str(e))


@router.get("/market/volumes")
def market_volumes_route(me: Company = Depends(current_company), session: Session = Depends(get_session)):
    return market_volumes(session)
