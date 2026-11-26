#!/bin/bash
# Azure App Service(Linux) 시작 스크립트. 시작 명령: bash deploy/azure_start.sh
# DB는 /home/data(재시작해도 남는 영역)의 SQLite 파일, 앱은 미리 빌드한 frontend/dist를 같은 서버로 제공한다.
# JWT_SECRET, SEED_PASSWORD(16자 이상)는 App Service의 앱 설정에 넣는다. 저장소에는 넣지 않는다.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${MASDAE_HOME:-/home/data}"
PORT="${PORT:-8000}"
mkdir -p "$DATA_DIR"
export DATABASE_URL="${DATABASE_URL:-sqlite:///$DATA_DIR/masdae.db}"
export LLM_PROVIDER="${LLM_PROVIDER:-off}" PYTHONDONTWRITEBYTECODE=1
export HF_HOME="${HF_HOME:-$DATA_DIR/hf}"   # Whisper 모델을 한 번만 내려받는다
[ -d "$ROOT/frontend/dist" ] && export STATIC_DIR="$ROOT/frontend/dist"

cd "$ROOT/backend" || exit 1

# 처음 한 번만 시연 회사를 넣는다.
SEEDED="$(python - <<'P'
from sqlalchemy import text
from app.db.models import Base
from app.db.session import engine
Base.metadata.create_all(engine)
with engine.connect() as c:
    print(c.execute(text("SELECT count(*) FROM companies")).scalar())
P
)"
NEED_LISTINGS=0
if [ "$SEEDED" = "0" ]; then
  umask 077
  python -m seed.gumi_demo > "$DATA_DIR/accounts.txt" 2>&1 || { echo "시드 실패"; exit 1; }
  NEED_LISTINGS=1
fi

if [ "$NEED_LISTINGS" = "1" ]; then
  (
    for _ in $(seq 1 240); do
      python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:$PORT/v1/health',timeout=1)" 2>/dev/null && break
      sleep 0.5
    done
    python -m seed.demo_listings "http://127.0.0.1:$PORT" "$SEED_PASSWORD" > "$DATA_DIR/seed_listings.log" 2>&1
  ) &
fi
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --log-level warning
