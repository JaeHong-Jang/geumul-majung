#!/bin/bash
# 판매자, 구매자 앱을 frontend/dist 하나로 빌드한다: /buyer/, /seller/
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend" && npm run build
echo "완료: $ROOT/frontend/dist"
