#!/bin/bash
# 로컬 실행: 이 PC의 PostgreSQL + 서버 + 판매자, 구매자 앱을 http://localhost:8000 하나로 띄운다.
# 데이터는 ~/.local/share/masdae/ 에 남는다(MASDAE_HOME으로 다른 폴더, PORT로 다른 포트). 초기화: deploy/run_local.sh --reset
# 로컬 시연용으로 공개 가입(ALLOW_SIGNUP), 가입 즉시 승인(AUTO_APPROVE_SIGNUP), 체험 계정 원클릭 로그인(DEMO_LOGIN)을 켠다. 배포에서는 쓰지 않는다.
# 앱은 미리 빌드한다: cd frontend && npm run build
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${MASDAE_HOME:-$HOME/.local/share/masdae}"
PY="${MASDAE_PYTHON:-$ROOT/backend/.venv/bin/python}"
STATIC="${STATIC_DIR:-$ROOT/frontend/dist}"
mkdir -p "$HOME_DIR"
chmod 700 "$HOME_DIR"

"$PY" -c "import pgserver" 2>/dev/null || { echo "pgserver가 필요합니다: uv pip install --python $PY pgserver"; exit 1; }

URI="$("$PY" - "$HOME_DIR/pgdata" <<'E'
import sys
import pgserver
print(pgserver.get_server(sys.argv[1], cleanup_mode=None).get_uri())
E
)"
BASE_URL="${URI/postgresql:\/\//postgresql+psycopg://}"
DB_URL="$("$PY" - "$BASE_URL" "${1:-}" <<'E'
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
url, reset = make_url(sys.argv[1]), sys.argv[2] == "--reset"
with create_engine(url, isolation_level="AUTOCOMMIT").connect() as c:
    if reset:
        c.execute(text("DROP DATABASE IF EXISTS masdae WITH (FORCE)"))
    if not c.execute(text("SELECT 1 FROM pg_database WHERE datname='masdae'")).first():
        c.execute(text("CREATE DATABASE masdae"))
print(url.set(database="masdae").render_as_string(hide_password=False))
E
)"

# 비밀값은 저장소 밖에 한 번 만들어 계속 쓴다(재시작해도 로그인 유지).
ENV_FILE="$HOME_DIR/local.env"
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  "$PY" - > "$ENV_FILE" <<'E'
import secrets
print(f"JWT_SECRET={secrets.token_hex(32)}")
print(f"SEED_PASSWORD={secrets.token_urlsafe(14)}")
E
fi
set -a   # local.env의 값(좌표 키 등)을 서버에 모두 넘긴다
. "$ENV_FILE"
set +a
export DATABASE_URL="$DB_URL" LLM_PROVIDER="${LLM_PROVIDER:-ollama}" PYTHONDONTWRITEBYTECODE=1
unset AUTH_ALLOW_COMPANY_HEADER
export ALLOW_SIGNUP=1 AUTO_APPROVE_SIGNUP=1 DEMO_LOGIN=1
[ -d "$STATIC" ] && export STATIC_DIR="$STATIC" || unset STATIC_DIR

cd "$ROOT/backend" || exit 1

# 처음 한 번만 시연 회사를 넣는다. 기본은 보령 폐어구(그물마중), SEED_SET=gumi면 이전 구미 공장 시연.
if [ "${SEED_SET:-boryeong}" = "gumi" ]; then SEED_MODULE=seed.gumi_demo; LISTING_MODULE=seed.demo_listings; else SEED_MODULE=seed.boryeong_demo; LISTING_MODULE=seed.boryeong_demo; fi
SEEDED="$("$PY" - <<'E'
from sqlalchemy import inspect, text
from app.db.models import Base
from app.db.session import engine
Base.metadata.create_all(engine)
with engine.connect() as c:
    print(c.execute(text("SELECT count(*) FROM companies")).scalar())
E
)"
if [ "$SEEDED" = "0" ]; then
  umask 077
  "$PY" -m "$SEED_MODULE" > "$HOME_DIR/accounts.txt" 2>&1 || { cat "$HOME_DIR/accounts.txt"; exit 1; }
  NEED_LISTINGS=1
else
  NEED_LISTINGS=0
fi

"$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}" --log-level warning &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
for _ in $(seq 1 80); do
  "$PY" -c "import urllib.request,sys;urllib.request.urlopen('http://127.0.0.1:${PORT:-8000}/v1/health',timeout=1)" 2>/dev/null && break
  sleep 0.25
done
if [ "$NEED_LISTINGS" = "1" ]; then
  "$PY" -m "$LISTING_MODULE" "http://127.0.0.1:${PORT:-8000}" "$SEED_PASSWORD"
fi
echo "실행 중: http://localhost:${PORT:-8000}/  (계정: $HOME_DIR/accounts.txt)"
wait $SERVER
