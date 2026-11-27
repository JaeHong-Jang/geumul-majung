"""FastAPI 앱 조립."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.core.config import check_production_settings, is_production, llm_info
from app.core.middleware import BodyLimit
from app.core.security import jwt_secret
from app.db.models import Base
from app.db.session import engine
from app.features.agent_runs.router import router as agent_runs
from app.features.assistant.router import router as assistant
from app.features.auth.router import router as auth
from app.features.bags.router import router as bags
from app.features.buyer.router import router as buyer
from app.features.buy_requests.router import router as buy_requests
from app.features.sellers.router import router as sellers
from app.features.companies.router import router as companies
from app.features.gm.ai import router as gm_ai
from app.features.gm.trade import router as gm_trade
from app.features.gm.router import router as gm
from app.features.handover.router import router as handover
from app.features.inquiries.router import router as inquiries
from app.features.listings.router import router as listings
from app.features.knowledge.router import router as knowledge
from app.features.market.router import router as market
from app.features.messages.router import router as messages
from app.features.notifications.router import router as notifications
from app.features.orders.router import router as orders
from app.features.pools.router import router as pools
from app.features.ratings.router import router as ratings
from app.features.recyclers.router import router as recyclers
from app.features.seller.router import router as seller
from app.features.support.router import router as support


# 이미 있는 표에 나중에 붙인 칸. create_all은 새 표만 만들므로 기존 DB에는 여기서 칸을 더한다.
LATE_COLUMNS = {"buy_requests": {"price_min_krw_per_kg": "FLOAT", "price_max_krw_per_kg": "FLOAT", "negotiable": "BOOLEAN"},
                "listing_terms": {"unload_forklift": "BOOLEAN", "unload_crane": "BOOLEAN"},
                "companies": {"byproducts": "JSON"}}


def add_late_columns() -> None:
    insp = inspect(engine)
    with engine.begin() as con:
        for table, cols in LATE_COLUMNS.items():
            if not insp.has_table(table):
                continue
            have = {c["name"] for c in insp.get_columns(table)}
            for name, kind in cols.items():
                if name not in have:
                    con.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {kind}"))


class AppFiles(StaticFiles):
    """앱 웹 빌드. 이름에 해시가 붙은 assets는 오래 두고, 나머지(html, 아이콘, 사진)는 매번 바뀌었는지 확인하게 해
    새로 빌드한 화면과 그림이 새로고침 한 번에 바로 보이게 한다."""
    async def get_response(self, path, scope):
        res = await super().get_response(path, scope)
        res.headers["Cache-Control"] = "public, max-age=31536000, immutable" if path.replace("\\", "/").startswith("assets/") else "no-cache"
        return res


@asynccontextmanager
async def lifespan(app: FastAPI):
    jwt_secret()   # 비밀값 없이 뜨지 않게 시작할 때 확인
    if is_production():
        check_production_settings()
    Base.metadata.create_all(engine)
    add_late_columns()
    yield


_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if is_production() else {}
app = FastAPI(title="잔재미 장터", lifespan=lifespan, **_docs)
app.add_middleware(BodyLimit)

_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:   # 웹 미리보기용(§10.3)
    app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def bad_request(request: Request, exc: RequestValidationError):
    # 계약: 잘못된 입력은 422가 아니라 400
    return JSONResponse(status_code=400, content={"detail": [f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()]})


@app.exception_handler(IntegrityError)
async def conflict(request: Request, exc: IntegrityError):
    # UNIQUE 충돌(동시 요청 등)은 500이 아니라 409
    return JSONResponse(status_code=409, content={"detail": "이미 처리된 요청(중복)"})


for router in (auth, companies, bags, listings, orders, handover, ratings, market, buyer, seller,
               notifications, support, pools, recyclers, inquiries, messages, agent_runs, assistant, knowledge,
               buy_requests, sellers, gm, gm_ai, gm_trade):
    app.include_router(router)


@app.get("/v1/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"ok": False, "db": False})
    import app.llm as llm_mod
    fn = getattr(llm_mod, "provider_health", None)   # B가 추가하는 실제 확인 함수
    try:
        llm = fn() if fn else llm_info()
    except Exception:
        llm = llm_info()
    return {"ok": True, "db": True, "llm": {"provider": llm.get("provider"), "available": llm.get("available")}}


# 앱 웹 빌드. API 경로를 먼저 등록해야 하므로 맨 뒤에 둔다(§11.3)
if os.environ.get("STATIC_DIR"):
    app.mount("/", AppFiles(directory=os.environ["STATIC_DIR"], html=True), name="apps")
