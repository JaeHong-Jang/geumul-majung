# 잔재미 · 산업자원 순환 AI Agent

공장이 산업 부산물을 등록하고, 재활용업체가 구매하며, 판매자가 출고와 운송을 담당하는 서비스다.

**현재 개발 대상은 `frontend/`의 React + TypeScript + Vite 웹 앱과 `backend/`의 FastAPI 서버다. Flutter는 현재 앱의 기술 스택이 아니다.**

## 현재 화면과 코드

| 화면 | URL 경로 | 소스 |
|---|---|---|
| 판매자, 구매자 앱 미리보기 | `/` | `frontend/index.html` |
| 판매자 | `/seller/` | `frontend/src/apps/seller/` |
| 구매자 | `/buyer/` | `frontend/src/apps/buyer/` |
| 공통 헤더·카드·하단 탭 | 각 앱 공통 | `frontend/src/shared/ui/shell/` |

## 로컬 실행 (Linux·WSL)

필요 환경: Node.js 22.12 이상, Python 3.12 이상, 설치된 프론트 의존성과 백엔드 가상환경. `deploy/run_local.sh`는 `pgserver`와 PostgreSQL 드라이버를 사용한다.

저장소 루트에서 빌드 후 실행한다. 이미 8030 서버가 실행 중이면 중복 실행하지 않는다.

```bash
cd frontend
npm ci
npm run build
cd ..
PORT=8030 bash deploy/run_local.sh
```

브라우저에서 `http://localhost:8030/`을 연다. 기본 포트는 8000이며 `PORT=8030`으로 변경한다. 서버는 `frontend/dist/`를 제공하고, 소스 수정은 다시 빌드해야 반영된다. `frontend/dist/`는 생성물이므로 직접 수정하지 않는다.

데이터·로컬 설정은 기본적으로 `~/.local/share/masdae/`에 저장한다. `MASDAE_HOME`, `MASDAE_PYTHON`, `STATIC_DIR`로 경로를 지정할 수 있다. 처음 생성한 계정 정보는 데이터 폴더의 `accounts.txt`에서 확인한다. 로컬 실행은 시연용 가입·자동 승인·체험 로그인을 활성화한다.

현재 실행 스크립트의 기본 LLM은 Ollama(`LLM_PROVIDER=ollama`)다. `LLM_PROVIDER`, `OLLAMA_URL` 환경변수로 바꿀 수 있으며 Ollama가 꺼져 있어도 규칙 문장으로 동작한다. WSL에서 Windows Ollama를 연결하는 기본 주소는 `harness/harness.yaml`을 확인한다.

화면을 개발 서버에서 바로 갱신하려면 `frontend/`에서 `npm run dev`를 실행한다. 기본 주소는 `http://localhost:5173/`, API 프록시 대상은 `http://127.0.0.1:8000`이다. API가 8030에서만 실행 중인 경우 현재 Vite 프록시 설정을 먼저 맞춰야 한다.

## 폴더

- `frontend/`: 판매자, 구매자 React 웹 앱과 공통 UI
- `backend/`: FastAPI 서버, 시연 데이터, 테스트
- `deploy/`: 현재 React 앱 빌드·로컬 실행 스크립트
- `harness/`: AI 팀 선언·에이전트 카드·근거 규칙
- `data/`: 법 조문·시세·폐기물 코드 등 데이터
- `docs/`: 설계 계약, 현재 디자인 안내, QA·검토 기록
- `archive/legacy/`: 이전 Flutter 앱·독립 JavaScript 시안·옛 실행 및 디자인 자료. 현재 실행·빌드 대상에서 제외

설계 계약: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · 구조: [docs/STRUCTURE.md](docs/STRUCTURE.md) · UI: [DESIGN.md](DESIGN.md) · 이전 자료: [archive/legacy/README.md](archive/legacy/README.md)

## 검증

```bash
cd frontend
npm run check
npm run build
```

백엔드 검증은 `backend/`에서 실행한다.

```bash
.venv/bin/python -m pytest -q
```

백엔드만 직접 실행하는 경우 JWT_SECRET을 설정하고 `python -m uvicorn app.main:app`을 사용한다. 데이터 초기화·재시드는 일반 실행이나 폴더 정리에 필요하지 않다.
