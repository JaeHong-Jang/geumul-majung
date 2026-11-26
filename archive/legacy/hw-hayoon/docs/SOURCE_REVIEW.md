# HW 하윤 원본 검토

검토일: 2026-11-05. 원격 저장소의 네 브랜치와 관련 화면·데이터·설계 계약을 읽고, 운송기사용 JavaScript 프로토타입의 범위를 정리했다. 아래 `브랜치:경로`는 해당 커밋의 파일을 뜻한다.

## 브랜치와 제품 이름

| 브랜치 | 검토 커밋 | 관련 내용 |
|---|---|---|
| `main` | `eac0bb01e632892543d9ab0311ab947a7e6137e4` | 마대 장터의 서버·설계·QA 기준선 |
| `develop` | `84a859fd8cc89f5ed24b69963b76b473a3ba0850` | 구매자·운송기사 Flutter 통합 앱, 로그인과 서버 연동 |
| `디벨롭_hy` | `c2b3262fd017be1192801159a38be3d8371198fd` | 순수 JavaScript 운송기사 A/B/C 시안과 React·TypeScript 전환본 |
| `디벨롭_jw` | `480bd0c2c2929907cbcd08a8b969055415578656` | 잔재미 구매자 화면과 B안 기반 운송기사 화면의 Flutter 통합 |

`hy`와 `jw`의 `carrier-app/`, `carrier-app-react/` 내용은 같다. `develop`의 현재 트리에는 두 디렉터리가 없으므로 원본을 확인할 때 해당 브랜치를 명시해야 한다.

저장소에서 확인되는 서비스 이름은 **잔재미**, 전체 사업 맥락은 **마대 장터**다. 관련 브랜치의 작성된 화면·문서에서 **HW 하윤**이라는 기존 제품 이름은 찾지 못했다. 이번 결과물의 이름 **HW 하윤**은 사용자의 새 지시를 따른다. 별도 HW 하윤 디자인 원본이 있다는 가정은 두지 않았다.

근거: 각 브랜치의 `README.md`, `hy:carrier-app/README.md`, `jw:janjaemi-app/README.md`.

## 기존 역할과 화면

사업 흐름은 공장이 부산물을 등록하고, 재활용업체가 구매하며, 허가 운반업체가 수거·운송하는 구조다. 앱에는 판매자·구매자·운송기사 역할이 나타나지만 `jw`와 `develop`에서 판매자 전용 화면은 아직 준비되지 않았다.

- **구매자:** 로그인·역할 선택 → 홈/탐색 → 통과증 매물 또는 AI 공동판매 묶음 → 장바구니/구매 요청 → 운송 매칭 또는 직접 수거 → 거래내역 → 입고 확인·후기. 시세와 마이페이지를 별도 제공한다.
- **운송기사:** 운행 상태 변경 → 요청 비교 → 상세·운임 확인 → 수락 → 상차지 이동 → 마대 확인 → 운송 → 하차·계량 → 인계서 처리 → 정산 상태 확인.

구매자 시안은 Figma `AI부트캠프` 파일의 `잔재미` 묶음을 구현한 것으로 README에 명시되어 있다. 구매자 원본에는 `[가격]`, `[무게]`, `[회사명]` 같은 자리 표시자가 남아 있다.

근거: `jw:janjaemi-app/lib/screens/`, `jw:janjaemi-app/lib/data/models.dart`, `develop:janjaemi-app/lib/screens/login_screen.dart`.

## A/B/C 운송기사 시안

| 안 | 원본 구성 | 원본이 제시한 적합 맥락 |
|---|---|---|
| A 지도 우선형 | 운임 핀, 지도 위 하단 시트, 선택 콜의 공차·적재 경로 | 단거리·지역 운행 |
| B 오더 보드형 | 검색 가능한 요청 목록, 운임/공차/km당 운임 정렬, 필터, 지도 전환 | 장거리·전업 운행 |
| C 단일 콜형 | 한 콜을 크게 표시, 수락 제한시간, 큰 행동 버튼, 어두운 화면 | 신규·야간 운행 |

B가 React 앱의 기본안이며 Flutter 운송기사 화면의 출발점이다. 세 안은 홈·운반 요청·상세·운행 중·정산·마이를 공유한다. 원본의 버전 선택 레일과 좌표 경로 계산 패널은 시안 검토 도구다.

근거: `hy:carrier-app-react/src/lib/data.ts`, `src/screens/versionA.tsx`, `versionB.tsx`, `versionC.tsx`, `src/App.tsx`, `hy:carrier-app/docs/board-{a,b,c}.png`.

## 데이터·자산과 이용 조건

- 운송 예시 11건은 구미 차고지 기준이다. 독차·묶음·혼적·정기·소량·급송·장거리·야간·귀로·왕복·대형을 포함하고, 대구·창원·청주·포항·평택으로 이어진다. 운임은 65,000~485,000원, 적재량은 0.9~7.5톤이다. 기본 차량은 5톤 윙바디다.
- 원본의 공장 좌표는 20,580곳이며 **외부 공유·판매 금지 조건**이 README에 명시되어 있다. 전체 공장 좌표 자료를 새 프로토타입에 복사하지 않는다. 공개용 좌표는 이용 가능한 공공자료 등으로 교체할 필요가 있다.
- `carrier-app/data/`에는 예시 콜, 도로 그래프, 내장 지도 타일이 있다. 원본 경로는 다익스트라를 쓰며 일방통행·일부 높이/중량 제한을 반영하지만 회전 제한과 실시간 교통은 반영하지 않는다. 운임·품목·수입·운송 조건은 예시다.
- `janjaemi-app/assets/`에는 Figma SVG 아이콘, 앱 아이콘, Noto Sans KR·Black Han Sans 글꼴, 준비된 운송 JSON, OSM 타일이 있다. 실제 부산물 사진은 없고 매물 상세의 사진 영역은 자리 표시자다.
- 지도·도로는 **© OpenStreetMap 기여자 / ODbL**, Leaflet 1.9.4는 **BSD-2-Clause**, 글꼴은 함께 제공된 **SIL OFL** 문서를 따른다. 재사용 자산과 함께 출처·라이선스를 보존한다.

근거: `hy:carrier-app/README.md`, `hy:carrier-app/data/factories.js`, `jw:janjaemi-app/assets/`, `assets/fonts/OFL-*.txt`, `jw:janjaemi-app/lib/screens/listing_detail_screen.dart`.

기존 React 전환본은 React 19.3.1, Leaflet 1.9.4, TypeScript 6.0.3, Vite 8.3.5, Vitest 5.1.0을 선언한다. 원본 순수 JavaScript 시안은 설치·빌드 없이 열 수 있다. 새 결과물도 HTML/CSS/JavaScript ES 모듈로 구현하는 범위를 택했다.

근거: `hy:carrier-app-react/package.json`, `hy:carrier-app/README.md`.

## 최신 계약과 과거 QA의 구분

`docs/qa/03_운반업체.md`는 2026-11-02 검토 당시의 문제 기록이다. `hy:carrier-app-react/README.md`와 `src/api/masdae.ts`도 당시 콜 목록에 운임·회사명 등이 없으며 화면은 서버 미연동이라고 설명한다. 이를 최신 서버의 현행 상태로 단정하지 않는다.

`develop`의 Flutter 운송 데이터 변환은 `freight_cap_krw`, `distance_km`, 상·하차지 이름, `waste_name`, `bag_count`, `grade` 등의 확장된 콜 정보를 읽는다. 이 금액은 화면에서도 **운임 상한**으로 구별한다. 앱의 도착은 구매자 검사와 정산 완료를 의미하지 않는다. 최신 동작을 판단할 때는 현재 `docs/ARCHITECTURE.md`의 우선순위 **10절 > 9절 > 8절**, 현재 API 구현과 연동 코드를 기준으로 삼는다. README의 “서버 미연동” 문구 역시 현재 코드와 차이가 있다.

근거: `develop:janjaemi-app/lib/carrier/carrier_data.dart`, `develop:janjaemi-app/lib/api/api_client.dart`, `develop:docs/ARCHITECTURE.md`, `develop:backend/app/api/orders.py`.

## 이번 범위와 개선 방향

**HW 하윤은 운송기사에 집중한다.** 구매자·공장 화면은 원본 맥락으로 검토하고, 새 앱의 권한과 주요 흐름은 운송 업무에 한정한다. 실제 배차·결제·전화·로그인·공공시스템 제출은 수행하지 않는 로컬 예시 프로토타입이다.

| 원본에서 확인한 한계 | 이번 개선 기준 |
|---|---|
| A/B/C가 검토용 레일로 나뉨 | B의 비교 목록, A의 지도 맥락, C의 큰 다음 행동을 하나의 앱으로 결합 |
| `hy`의 QR 목표가 모든 주문에 18개로 고정됨 | 선택한 주문의 마대 수를 기준으로 확인·단계 진행 |
| 수락 후에도 원본 콜 목록이 그대로임 | 수락 콜 제거, 활성 운송 중 다른 배차 차단 |
| B 홈에서 오프라인 상태에도 콜이 보임 | 운행 상태를 명확히 표시하고 오프라인 수락 차단 |
| 5톤 필터에만 의존한 차량 적합성 | 5톤 초과 수락도 별도 검증 |
| KPI·정산 원장이 고정 예시임 | 운송 상태와 수입·정산 표시 연결, 검사 대기와 정산 완료 구별 |
| 원본은 주로 필터·정렬·저장만 보존 | 활성 운송과 핵심 상태도 새로고침 후 유지 |
| C에서 검색·필터가 제한됨 | 공통 검색·필터·정렬·저장, 빈 결과와 초기화 제공 |

`hy`의 고정 QR 목표는 `src/state/appState.ts`의 `BAGS_TO_SCAN = 18`, 고정 KPI는 `src/components/ui.tsx`, 원장은 `src/lib/data.ts`에서 확인된다. `develop`의 실제 콜은 마대 수 처리 등이 일부 개선되어 있으므로 이 표는 주로 **hy 원본 대비 새 프로토타입의 기준**이다. 구현 검증의 상세 기준은 [PLAN.md](PLAN.md), 시각·상호작용 기준은 [DESIGN.md](../../DESIGN.md)를 따른다.
