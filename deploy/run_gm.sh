#!/bin/bash
# 그물마중 시연 서버: API(8000) + 웹 화면(8765)을 한 번에 띄운다. 데이터는 SQLite 한 파일(GM_HOME, 기본 ~/.local/share/geumulmajung).
#   deploy/run_gm.sh           처음이면 시연 계정을 넣고 띄움
#   deploy/run_gm.sh --reset   DB를 지우고 처음부터
# 열 주소: http://127.0.0.1:8765/index.html (대시보드), http://127.0.0.1:8765/app/index.html (모바일)
# 서버가 꺼져 있으면 화면은 예전처럼 브라우저 저장소로 돈다. iOS 시뮬레이터에서도 http://127.0.0.1:8000 으로 붙는다.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${GM_HOME:-$HOME/.local/share/geumulmajung}"
PY="${GM_PYTHON:-$ROOT/backend/.venv/bin/python}"
mkdir -p "$HOME_DIR" && chmod 700 "$HOME_DIR"
[ "${1:-}" = "--reset" ] && rm -f "$HOME_DIR/gm.db"
ENV_FILE="$HOME_DIR/local.env"
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  "$PY" -c 'import secrets; print(f"JWT_SECRET={secrets.token_hex(32)}"); print(f"SEED_PASSWORD={secrets.token_urlsafe(14)}")' > "$ENV_FILE"
fi
set -a; . "$ENV_FILE"; set +a
export DATABASE_URL="sqlite:///$HOME_DIR/gm.db" DEMO_LOGIN=1 LLM_PROVIDER="${LLM_PROVIDER:-off}" PYTHONDONTWRITEBYTECODE=1
# 계량증명서 사진 읽기: 로컬 Ollama 사진 모델(먼저 `ollama pull qwen2.5vl:7b`). 끄려면 VISION_PROVIDER=off
export VISION_PROVIDER="${VISION_PROVIDER:-ollama}" VISION_MODEL="${VISION_MODEL:-qwen2.5vl:7b}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://127.0.0.1:8765,http://localhost:8765,null}"
unset AUTH_ALLOW_COMPANY_HEADER
cd "$ROOT/backend"
"$PY" -c "from app.db.models import Base; from app.db.session import engine; Base.metadata.create_all(engine)"
if [ "$("$PY" -c "from sqlalchemy import text; from app.db.session import engine; print(engine.connect().execute(text('SELECT count(*) FROM companies')).scalar())")" = "0" ]; then
  umask 077
  "$PY" -m seed.boryeong_demo > "$HOME_DIR/accounts.txt"
  echo "시연 계정을 넣음: $HOME_DIR/accounts.txt"
fi
( cd "$ROOT" && exec python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 ) &
WEB=$!
trap 'kill $WEB 2>/dev/null' EXIT
echo "대시보드 http://127.0.0.1:8765/index.html  모바일 http://127.0.0.1:8765/app/index.html  API http://127.0.0.1:${PORT:-8000}/docs"
"$PY" -m uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8000}"
