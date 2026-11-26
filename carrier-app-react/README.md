# 운송 파트너 앱 React·TypeScript 버전 (A·B·C안, 구미 산업단지 기준)

`carrier-app`의 시안을 React, TypeScript, Vite로 옮긴 버전입니다. 처음 화면은 B안이고, 왼쪽에서 A안과 C안으로 바꿀 수 있습니다.

## 실행

Node.js 22.12 이상이 필요합니다.

```
cd carrier-app-react
npm install
npm run dev
```

http://localhost:5173/ 에서 열립니다.

| 명령 | 내용 |
|---|---|
| `npm run check` | 타입 검사, 린트, 테스트를 한 번에 실행 |
| `npm run test` | 단위 테스트 |
| `npm run build` | 타입 검사 후 배포용 빌드 |

## 원래 시안에서 더한 것

- **콜 필터:** 콜 종류, 지역, 공차 거리 상한, 공차 포함 km당 운임 하한, 저장한 콜만 보기.
- **콜 저장:** 요청 상세에서 저장합니다. 필터, 정렬, 저장한 콜은 브라우저에 남아 다음에 열어도 유지됩니다.
- **안전장치:** 시간이 끝난 콜은 수락되지 않고, 데이터를 못 읽으면 빈 화면 대신 이유를 보여 줍니다.
- **백엔드 연동 준비:** `src/api/masdae.ts`에 팀 백엔드 운반업체 API의 타입과 호출 함수를 넣었습니다. 아직 화면에는 연결하지 않았습니다.

## 구조

| 위치 | 내용 |
|---|---|
| `src/types.ts` | 공통 타입 |
| `src/state/appState.ts` | 앱 상태 변화와 브라우저 저장 |
| `src/lib/orders.ts` | 콜 계산, 필터, 정렬 |
| `src/lib/dijkstra.ts` | 다익스트라 경로 계산 |
| `src/lib/roadnet.ts` | 도로 데이터를 그래프로 변환 |
| `src/lib/data.ts` | 내장 데이터와 예시 값 |
| `src/screens/` | A·B·C안과 공통 화면 |
| `src/components/` | 공통 부품, 지도, 필터, 경로 계산 패널 |
| `src/api/masdae.ts` | 팀 백엔드 연동 |

## 백엔드 연동 전에 합의할 것

팀 백엔드 `GET /v1/calls`에는 운임과 장소명이 없습니다(`docs/qa/03_운반업체.md` 5번). 그래서 지금 화면의 운임순, km당 운임 필터를 실제 데이터로 쓰려면 콜 목록에 운임을 넣는 계약 변경이 먼저 필요합니다.

## 데이터

지도 타일, 도로망, 공장 좌표는 복사하지 않고 `../carrier-app/data`를 읽습니다. 그래서 `carrier-app` 폴더가 함께 있어야 합니다.

공장 좌표 원본에는 외부 공유 금지 조건이 있습니다. 자세한 내용은 `carrier-app/README.md`의 "데이터 출처와 제한"을 보세요. 운임, 품목, 콜 조건은 예시입니다.

## 버전 메모

TypeScript는 6.0을 씁니다. 최신 7.0은 이 저장소에서 쓰는 `typescript-eslint`가 아직 지원하지 않습니다(6.1 미만만 지원). ESLint는 `eslint-plugin-jsx-a11y`가 지원하는 9를 씁니다.
