#!/usr/bin/env bash
# Mac·Linux에서 서버를 켜고 Chrome에 잔재미 앱을 폰 크기로 띄운다.
# 실행: 저장소 맨 위 폴더에서  ./run-web.sh
# 필요: Python 3.12+, Flutter, Chrome
set -euo pipefail
legacy_root="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$legacy_root/../.." && pwd)"
backend="$root/backend"
py="$backend/.venv/bin/python"
demo_password='janjaemi-demo-password'   # 로컬 SQLite 데모 DB 전용. 실서버에 쓰지 말 것
api='http://127.0.0.1:8000'
web_port=5050
export PATH="$PATH:$HOME/development/flutter/bin"
command -v flutter >/dev/null || { echo 'flutter를 찾을 수 없어요: https://docs.flutter.dev/get-started/install'; exit 1; }

# 1. 백엔드 가상환경 (처음 한 번)
if [ ! -x "$py" ]; then
  echo '[1/3] 백엔드 가상환경 만드는 중...'
  python3 -c 'import sys; sys.exit(sys.version_info < (3, 12))' || { echo 'Python 3.12 이상이 필요해요'; exit 1; }
  python3 -m venv "$backend/.venv"
  "$py" -c "import tomllib;print('\n'.join(tomllib.load(open('$backend/pyproject.toml','rb'))['project']['dependencies']))" \
    | xargs "$py" -m pip install --quiet
fi

# 2. 서버 켜기 (이 스크립트가 끝나면 같이 꺼짐)
cd "$backend"
first_run=false; [ -f masdae.db ] || first_run=true
if $first_run; then
  echo '[2/3] 데모 회사 계정 만드는 중...'
  SEED_PASSWORD="$demo_password" "$py" -m seed.gumi_demo
fi
# Ollama(기본 LLM)가 꺼져 있어도 앱은 규칙 문장으로 동작한다. 환경변수 LLM_PROVIDER, OLLAMA_URL로 바꿀 수 있다
JWT_SECRET="$(openssl rand -hex 32)" LLM_PROVIDER="${LLM_PROVIDER:-ollama}" OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}" CORS_ORIGINS="http://localhost:$web_port" \
  "$py" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >"$backend/server.log" 2>&1 &
trap 'kill $! 2>/dev/null' EXIT
for _ in $(seq 30); do curl -sf "$api/v1/health" >/dev/null && break; sleep 1; done
curl -sf "$api/v1/health" >/dev/null || { echo '서버가 안 켜졌어요. backend/server.log를 확인하세요'; exit 1; }
$first_run && "$py" -m seed.demo_listings "$api" "$demo_password"

echo
echo "로그인 계정 (비밀번호는 모두 $demo_password)"
echo '  구매자(재활용업체): 000-00-00004'
echo '  운송기사(운반업체): 000-00-00005'
echo

# 3. Chrome에 앱 띄우기. 코드 고친 뒤 r 키 = 화면 새로고침
echo '[3/3] Chrome에 앱 띄우는 중 (처음은 1~2분 걸려요)...'
cd "$legacy_root/janjaemi-app"
flutter run -d chrome --web-port "$web_port" --dart-define=API_BASE="$api"
