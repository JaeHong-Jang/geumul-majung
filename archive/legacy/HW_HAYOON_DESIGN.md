# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-11-05
- Primary product surfaces: `hw-hayoon/` JavaScript 운송 파트너 앱 프로토타입.
- Evidence reviewed: `origin/디벨롭_hy:carrier-app/` A/B/C 화면과 보드 이미지, `carrier-app-react/` 상태·데이터·지도·운송 화면, `origin/디벨롭_jw:janjaemi-app/`, develop의 Flutter API 연동, `docs/ARCHITECTURE.md` 10 > 9 > 8절, `docs/qa/`, `backend/app/api/orders.py`, `harness/`.
- 사용자 지정 이름은 **HW 하윤**. 저장소에는 동일 이름이 없어 hy 운송 파트너 초안을 해당 작업의 출발점으로 해석했다.

## Brand
- Personality: 차분하고 정확한 운송 업무 도구. 잔재미 자원순환 서비스의 운송 파트너 표면.
- Trust signals: 운임 구성·공차·적재량·상차 조건을 수락 전에 공개. 예시 데이터와 예상 경로를 명시.
- Avoid: 법정 인증·실시간 교통·올바로 자동 제출·AI 안전 판정·확정 탄소 감축을 암시하는 표현.

## Product goals
- Goals: 콜을 비교하고 지도에서 이해하기, 차량에 맞는 조건 찾기, 수락부터 상차 확인·운송·검사 대기까지 체험하기, 정산 상태를 구별하기.
- Non-goals: 실제 결제·배차·전화·로그인·공공시스템 제출. 별도 요청 없는 외부 배포.
- Success signals: 검색·필터·정렬·즐겨찾기 동작, 중복 배차 차단, 5톤 초과 수락 차단, 마대 수에 맞는 확인, 새로고침 후 상태 유지, 모바일 탐색, 콘솔 오류 없음.

## Personas and jobs
- Primary personas: 구미 산업단지 중심으로 운행하는 5톤 윙바디 기사 하윤.
- User jobs: 빈 차로 이동하는 거리와 운임을 함께 비교하고 다음 상차 업무를 놓치지 않는다.
- Key contexts of use: 주차 중 모바일, 운행 준비 중 태블릿·데스크톱. 이동 중 조작 유도 없음.

## Information architecture
- Primary navigation: 콜 찾기 / 내 운송 / 정산 관리 / 저장한 콜 / 내 정보.
- Core routes/screens: `#calls`, `#trips`, `#earnings`, `#saved`, `#profile`; 콜 상세·수락 확인·필터·알림은 대화상자.
- Content hierarchy: 현재 지역·운행 상태 → 요약 → 검색·필터 → 콜 목록과 지도 → 상세 운임·조건 → 한 가지 다음 행동.
- A안의 지도 맥락 + B안의 비교 가능한 목록 + C안의 큰 다음 행동을 결합한다. 시안 선택용 스위치는 제품 표면에서 제거한다.

## Design principles
- 빠른 비교: 운임, 경로, 공차, 적재량, 상차 시간을 같은 위치에 배치한다.
- 작업의 연속성: 선택된 콜·지도·상세가 연결되고, 수락한 콜은 모집 목록에서 빠진다.
- Tradeoffs: 운송 파트너에 집중한다. 구매자와 공장의 권한을 운송기사에게 부여하지 않는다. 도착 후 구매자 검사 대기는 완료 정산과 구분한다.

## Visual language
- Color: ink `#182A2B`, pine `#116B55`, mint `#E8F4EE`, canvas `#F5F7F8`, amber `#AC6715`, white `#FFFFFF`.
- Typography: 기존 SIL OFL Noto Sans KR 재사용. 제목 28–32px, 본문 14px, 보조 12px, 핵심 운임 24px. 숫자는 tabular-nums.
- Spacing/layout rhythm: 4px 기반, 24–32px 화면 여백. 왼쪽 고정 내비게이션, 넓은 본문과 지도·목록 분할.
- Shape/radius/elevation: 주요 작업 패널 16–20px, 카드 12px, 칩 pill. 테두리 중심이며 그림자는 선택·부유 요소에 제한.
- Motion: 상태 변경에 짧은 전환만. prefers-reduced-motion 존중.
- Imagery/iconography: 로컬 OpenStreetMap 타일을 낮은 채도로 사용하고 지도 위 운임 표식으로 과업을 시각화. 기존 라이선스 보존. 새 아이콘은 일관된 1.7px 선형 SVG.

## Components
- Existing components to reuse: hy의 지도 타일·Leaflet·예시 콜·도로 경로; 기존 Noto Sans KR 글꼴. 제한이 있는 공장 좌표 전량은 복사하지 않는다.
- New/changed components: 앱 셸, 차량 상태, 비교 가능한 콜 카드, 지도 운임 핀, 운송 단계, 정산 표, 상세/필터 대화상자, 토스트.
- Variants and states: 선택/저장/급송/차량 부적합/대기/완료, 온라인/오프라인, 빈 결과, 확인 오류.
- Token/component ownership: `hw-hayoon/styles.css`의 CSS 변수와 공통 렌더 함수.

## Accessibility
- Target standard: WCAG 2.2 AA를 목표로 구현; 공식 인증이나 전면 감사를 의미하지 않음.
- Keyboard/focus behavior: 명확한 포커스, 실제 button/input, dialog 포커스 관리·Escape 닫기·원위치 복귀.
- Contrast/readability: 색만으로 상태를 표현하지 않음. 옅은 텍스트와 배경 간 가독성 확인.
- Screen-reader semantics: 한국어 문서, 내비게이션 레이블, 폼 레이블, aria-live 알림, 상태 텍스트.
- Reduced motion and sensory considerations: 애니메이션 최소화. 지도 대신 목록으로 모든 콜을 선택 가능.

## Responsive behavior
- Supported breakpoints/devices: 1440/1280 데스크톱, 768 태블릿, 390/375 모바일.
- Layout adaptations: 데스크톱 좌측 내비게이션과 분할 보기, 태블릿 축소 내비게이션, 모바일 하단 내비게이션·목록/지도 전환·전체 너비 상세.
- Touch/hover differences: 최소 44px 주요 터치 영역. hover에만 노출되는 필수 정보 없음.

## Interaction states
- Loading: 지도 준비 상태. 핵심 콜 목록은 로컬 데이터로 즉시 제공.
- Empty: 조건 초기화 행동, 저장한 콜이 없으면 콜 찾기 이동.
- Error: 운임 상한/차량 적재량/마대 확인 부족 등 구체적인 해결 행동.
- Success: 수락·저장·수거·도착 각각 명확한 결과 안내.
- Disabled: 배차가 진행 중인 다른 콜, 오프라인 수락, 확인 전 단계 진행.
- Offline/slow network: 서버 미연동 프로토타입. 운행 상태 오프라인에서는 새 콜 수락을 중단하고 기존 운송 정보는 유지. 지도·글꼴·데이터는 로컬 자산.

## Content voice
- Tone: 짧고 명확한 한국어. 사용자에게 기술 스택이나 목업 내부 상태를 설명하는 문구는 넣지 않는다.
- Terminology: 공차=상차지까지 빈 차 이동, 운임 상한/확정 운임 구분, 도착=구매자 검사 대기, 정산 예정/완료 구분.
- Microcopy rules: 시연 데이터임을 앱 셸에서 표시. A/B/C는 법정 인증이 아닌 프로젝트 등급. 경로는 예상이며 실시간 교통 미반영.

## Implementation constraints
- Framework/styling system: JavaScript ES modules, HTML, CSS. 기존 순수 JS 초안을 바탕으로 별도 빌드 의존성 없이 구현.
- Design-token constraints: CSS 변수 단일 소스. 사용자 지정 브랜드명 보존.
- Performance constraints: 선택 지역의 로컬 지도만 추출, 제한 있는 공장 좌표 전체 배포 금지, 외부 네트워크 없이 핵심 기능 동작.
- Compatibility constraints: 현대 Chromium/Safari, Node 22+ 로컬 서버. 프로토타입 데이터만 localStorage에 저장.
- Test/screenshot expectations: Node 내장 테스트로 도메인 경계 검증. 브라우저에서 콜 찾기→상세→수락→상차 확인→도착→정산 대기 및 모바일 화면 확인. 각 시각 검토는 `.omx/state/hw-hayoon/ralph-progress.json`에 기록.

## Open questions
- [ ] HW 하윤의 별도 외부 디자인 자료는 제공되지 않음. 사용자 지정 이름과 hy 소스 기준으로 제작.
- [ ] 실제 운송회사·배차·지도 공급자와 인증은 실서비스 단계에서 결정. 현재 프로토타입에는 영향 없음.

## Global reference UX · 2026-11-05
- Evidence: Cyrkl의 판매/구매 수요와 구조화된 자원 조건, Recykal의 원료 거래·물류·기록 연결, Excess Materials Exchange의 자원 재고·거래 문맥, Rheaply의 상태·수량·수령 조건, Madaster의 소재 정보 출처, Uber Freight의 공차·거리당 운임 비교, 커버링의 수락 전 조건 안내. 공식 출처·검증 범위는 `hw-hayoon/docs/GLOBAL_REFERENCES.md`.
- Scope: 운송기사 앱의 기존 5개 메뉴를 유지한다. 구매자 시장·사진 AI·실제 결제·외부 법정 제출까지 확장하지 않는다.
- Decision: 비교 대상을 최대 3건 선택하고 운임 상한, 공차 포함 이동 거리, 거리당 운임, 직접 설정한 주행비를 같은 순서로 비교한다. 선택·비용 가정은 브라우저에 보존한다.
- Cost semantics: 450원/km는 수정 가능한 시연 가정이다. `주행비 차감 참고액 = 운임 상한 - (공차 + 적재 거리) × 원/km`. 실제 수익·최종 운임을 뜻하지 않는다. 인건비·세금·차량 고정비·대기비 등 미포함 비용을 함께 안내한다. 음수도 그대로 표시한다.
- Resource context: 자원 운송 정보에는 출발 공장·인수 업체, 재질, 프로젝트 등급, 마대 수, 등록·실측 중량을 연결한다. 발생 공정·오염도처럼 없는 데이터는 미등록으로 표시한다. 법정 인증이나 검수 통과로 표현하지 않는다.
- Readiness: 적재 한도, 등록 상차 지원, 확인이 필요한 허가 범위를 수락 전에 요약한다. 단순 용량 비교가 허가 적합성을 승인하지 않는다. 매 콜에 체크박스 여러 개를 요구하는 추가 마찰은 넣지 않는다.
- Records: 수락·상차지 도착·운송 시작·하차지 도착 시각을 실제 조작 때 기록한다. 이전 저장값에 없는 시각을 만들지 않는다. 운송 기록 JSON 내려받기는 로컬 시연 자료이며 인계서가 아니다. 구매자 검사 대기는 기사 행동으로 해제하지 않는다.
- Layout: 기존 첫 화면은 늘리지 않는다. 목록 카드 하단의 비교 선택과 목록 상단의 비교 버튼을 사용한다. 자원 정보·준비 조건·운송 기록은 관련 상세/수락/운송 화면에서 제공한다. 375px에서 대화상자와 필수 행동이 잘리지 않아야 한다.
- Deferred: 구매 수요 기반 공동판매, 다음 운송 추천, 계근표·사진 업로드, 구매자 검수 화면은 실제 수요·시간·권한·보관 정책을 확인한 뒤 구현한다. 이번에 작동하는 것처럼 표시하지 않는다.
