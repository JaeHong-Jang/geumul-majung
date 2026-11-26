# 폴더 구조 (하네스 구조)

프론트와 백엔드를 나누고, 양쪽 모두 **기능 하나 = 폴더 하나**로 둔다. 어떤 기능을 고칠 때 그 폴더만 보면 되게 하려는 것이다. 앱 안 AI 팀은 `harness/`가 선언하고 코드는 그 선언을 따른다.

```
masdae-market/
├─ harness/                 앱 안 AI 팀 선언 (harness.yaml, agents/, policies/)
├─ docs/                    계약서 ARCHITECTURE.md, 이 문서, QA·판정 기록
├─ data/                    공개 데이터 사본 (시세, 폐기물 코드, 법 조문)
├─ deploy/                  실행·배포 (run_local.sh, requirements)
├─ backend/
│  ├─ app/
│  │  ├─ main.py            앱 조립: 기능별 라우터를 모으기만 한다
│  │  ├─ contracts.py       AI 팀과 거래 코드 사이의 공통 타입
│  │  ├─ core/              설정, 비밀번호·토큰, 요청 인증(deps.py), 본문 크기 제한(middleware.py), 시간·반올림(util.py)
│  │  ├─ db/                모델, 세션
│  │  ├─ features/          기능별 API. 폴더마다 router.py(경로) · service.py(규칙) · schemas.py(입력). 있는 것만 둔다
│  │  │  ├─ _shared/        여러 기능이 쓰는 것: 입력 타입(schemas), 사진·증빙 업로드(uploads), 하네스 호출(flows), 지역(regions), 묶음 계산(bundles)
│  │  │  ├─ auth/           가입, 로그인, 이메일 재설정, 카카오·구글(oauth), 주소→좌표(juso), 메일(mail)
│  │  │  ├─ companies/      회사, 프로필, 증빙·승인, 운영자 승인, 지역 목록
│  │  │  ├─ bags/           마대, 등급, 통과증, 사진
│  │  │  ├─ listings/       판매 게시·검색·수정·내리기
│  │  │  ├─ orders/         주문, 묶음 구매, 수거·도착·검사, 정산, 수거·검사 사진, 내 실적. state.py = 주문 상태 전이·가짜 PG·정산 계산
│  │  │  ├─ calls/          기사 콜, 수락, 저장, QR 스캔
│  │  │  ├─ handover/       인계서 3칸
│  │  │  ├─ ratings/        후기
│  │  │  ├─ messages/       주문 대화
│  │  │  ├─ inquiries/      주문 전 매물 문의, 연락처 가림(contact_mask)
│  │  │  ├─ market/         시세, 물량, 폐기물 코드
│  │  │  ├─ buyer/          구매자 첫 화면, 공동 묶음, 배송지, 관심 품목, 찜, 자주 거래 판매자
│  │  │  ├─ carrier/        기사 첫 화면, 운행 상태, 수익
│  │  │  ├─ seller/         판매자 첫 화면
│  │  │  ├─ pools/          공동판매
│  │  │  ├─ recyclers/      재활용업체 찾기, 관심 업체
│  │  │  ├─ notifications/  알림, 알림 설정
│  │  │  ├─ support/        고객센터(FAQ, 티켓, 첨부)
│  │  │  ├─ routing/        주문 도로 경로(다익스트라)와 안내 단계. data/gumi_roads.json.gz = OpenStreetMap 도로 그래프
│  │  │  └─ agent_runs/     AI 실행 기록·하네스 조회
│  │  ├─ agents/ harness/ llm/ tools/   앱 안 AI 팀 코드 (harness/ 선언을 따름)
│  ├─ scripts/              일회용 도구 (build_road_graph.py = 도로 그래프 다시 만들기)
│  ├─ seed/                 시연 데이터
│  └─ tests/                테스트. 파일 이름은 아직 기능 이름과 맞추지 않았다(계약 절·검토 단위로 나뉘어 있음)
├─ frontend/src/
│  ├─ shared/               세 앱 공통: API 호출, 색·글자, 공통 부품, 공통 화면(로그인, 가입, 재설정, 알림, 고객센터, 마이, 인계서, 문의)
│  └─ apps/
│     ├─ buyer/             home, explore, listing, cart, purchase, orders, inspect …
│     ├─ carrier/           home, calls, trip, earnings …
│     └─ seller/            판매자 앱 (팀원 Figma 27개 화면)
└─ archive/legacy/          이전 Flutter 앱·독립 JavaScript 시안·실행 자료 (현재 빌드 제외)
```

## 규칙
- 기능 폴더 안: 백엔드는 `router.py`(경로), `service.py`(규칙), `schemas.py`(입력). 프론트는 화면, 그 기능의 API 호출, CSS.
- 기능끼리는 서로의 `service`(와 `state`)만 부른다. 다른 기능의 `router`를 직접 부르지 않는다. 기능 사이 의존은 한 방향이다(순환 없음): 예를 들어 `calls`·`handover`·`messages`는 `orders`를 부르지만 `orders`는 그들을 부르지 않는다. 세 앱 첫 화면(buyer·carrier·seller)은 주문·판매·콜 service의 목록 함수(`list_my_orders`, `list_my_listings`, `list_open_calls`)를 쓴다.
- 파일은 있는 것만 둔다(내용이 없는 `schemas.py` 등은 만들지 않는다). 입력 형식(`BaseModel`)은 `schemas.py`, `@router` 함수는 `router.py`, 그 밖의 함수는 `service.py`.
- 여러 기능이 쓰는 코드만 `core/`, `db/`, `frontend/shared/`로 올린다.
- 구조를 옮겨도 API 경로와 응답은 바꾸지 않는다. 옮기기 전후 테스트 결과가 같아야 한다.

## 진행 상태
- 판매자 앱은 `frontend/src/apps/seller`로 옮겼다(기존 `seller-delivery-app`). 프론트 공통 화면은 `frontend/src/shared`.
- 백엔드는 `app/api/`, `app/services/`를 `app/features/<기능>/`으로 옮겼다(2026-11-05). 동작은 바꾸지 않았다(API 경로 집합, 응답, 테스트 결과 SQLite 466 passed·16 skipped, PostgreSQL 481 passed·1 skipped가 옮기기 전과 같다).
- 옮기며 한 일: 다른 기능의 라우터 함수를 부르던 곳(`apps.py`의 첫 화면)을 service 함수(`list_my_orders`, `list_my_listings`, `list_open_calls`)로 내렸다. 본문 크기 제한은 `core/middleware.py`, 운영 설정 검사는 `core/config.py`로 옮겼다. `to_kst`·`KST`는 `core/util.py`로 올렸다.
- 테스트 파일은 아직 기능 이름에 맞춰 나누지 않았다.
