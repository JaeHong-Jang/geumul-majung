# 그물마중 API 약속 (웹·iOS 공통)

2026-11-27 초안. 팀원 시제품(`model.js`, `ios/GeumulMajung/Model.swift`)을 서버에 붙이기 위한 약속이다.
배경 설계는 `docs/GEUMUL_BACKEND.md`, 수익 구조는 `대학창업대전/01_전략/그물마중 수익 구조.md`.

## 0. 원칙

1. **서버가 주는 반출 한 건의 모양은 지금 화면이 쓰는 `record`(웹)·`Shipment`(iOS)와 같다.** 화면은 저장소를 읽던 자리에서 API를 부르기만 하면 된다. 새 칸은 모두 선택 칸으로 더하므로 예전 화면은 무시해도 된다.
2. **계산과 검증은 서버가 한다.** `calculate`, `verify`, `allocateId`를 서버로 옮기고, `model.test.cjs`의 시나리오를 서버 테스트로 그대로 옮겨 같은 숫자가 나오는지 본다. 화면의 계산은 입력 중 미리보기로만 쓴다.
3. **서버가 꺼져 있으면 지금처럼 기기 저장소로 돈다.** 발표장 인터넷이 끊겨도 시연이 된다.
4. 경로 앞머리는 `/v1/gm`. 기존 잔재미 API와 섞이지 않는다.

## 1. 반출 한 건 (기존 칸)

```json
{
  "id": "SS-2611-006",
  "kind": "폐자망", "material": "나일론",
  "weight": 5, "bags": 12,
  "departure": "2026-11-27T08:30",
  "facility": "보령 지정 재활용업체 (가상)",
  "note": "…", "checks": ["부착 로프 분리"], "photo": null,
  "status": "registered | confirmed | settled",
  "quotes": [{"label": "", "condition": "", "expected": 3, "rate": 220000, "residualRate": 300000, "extra": 80000, "validUntil": "2026-11-27"}],
  "choice": 1,
  "actual": {"total": 5, "accepted": 4, "extra": 200000, "reference": "", "reason": "", "signer": ""},
  "baseRate": 300000, "feeRate": 40000, "directCost": 110000
}
```

서버가 덧붙여 주는 읽기 전용 칸: `totals`(서버가 계산한 `calculate` 결과), `updatedAt`, `version`(같이 고칠 때 충돌 확인용).

## 2. 새로 더하는 선택 칸

| 칸 | 뜻 | 쓰는 단계 |
|---|---|---|
| `packaging` | `더미·마대·톤백·암롤박스`. 더미면 `bags`는 0 가능, 없으면 마대로 본다 | 완료(11-28) |
| `route` | `{mode: 시 용역 바지선·도 운반선·육상 차량·미정, vessel, landingPort, contract, status: 예정·결항·연기·완료, reason, delayedFrom}` | 완료(11-28) |
| `site` | 집하장 이름(기본 "삽시도 집하장") | 1단계 |
| `history[]` | `{at, by, role, action, before, after}` 수정 이력 | 1단계 |
| `origin` | `쓰다가 배출·조업 중 인양·침적 수거·해안 수거·모름`. 건진 것은 재생 원료가 못 됨 | 1단계 |
| `intake` | `{text, photos[], fields{}, sources{}}` 사진·음성 입력이 채운 값과 출처(말·사진·직접 입력) | 2단계 |
| `scans[]` | `{id, kind, fields{}, checks[], status}` 계량증명서 등 문서 사진에서 읽은 초안 | 2단계 |
| `lots[]` | 반출분을 품목으로 나눈 것 `{kind, material, weight, direction}` | 3단계 |
| `quotes[].direction` | `pay`(처리비를 냄, 지금 방식) 또는 `sell`(값을 받음) | 3단계 |
| `quotes[].buyer` | 값을 내겠다는 회사 | 3단계 |

`direction`이 없으면 `pay`로 본다. 지금의 계산식은 `pay`일 때 그대로다. `sell`이면 그 품목의 `rate`가 고객이 받는 돈이 된다(계산식은 3단계에서 테스트와 함께 정한다).

## 3. 경로

| 단계 | 메서드·경로 | 누가 | 하는 일 |
|---|---|---|---|
| 1 | `POST /v1/gm/demo-login/{factory\|operator\|recycler}` | 모두 | 시연 역할 로그인(`DEMO_LOGIN=1`일 때만). 실제 계정은 기존 `POST /v1/auth/login`. 받은 토큰을 `Authorization: Bearer`로 보냄 |
| 1 | `GET /v1/gm/shipments` | 모두 | 목록(출항일 늦은 순). 업체별로 나눠 보이기는 아직 안 함 |
| 1 | `GET /v1/gm/shipments/{id}` | 모두 | 한 건 + `totals` |
| 1 | `POST /v1/gm/shipments` | 집하장 | 등록. 서버가 반출번호와 기본 조건 2개를 만듦 |
| 1 | `PUT /v1/gm/shipments/{id}/quotes` | 운영 | 조건 수정 |
| 1 | `POST /v1/gm/shipments/{id}/confirm` | 운영 | 조건 확정 `{choice}` |
| 1 | `POST /v1/gm/shipments/{id}/route` | 집하장·운영 | 운반 정보와 운항 상태. 연기면 `delayedTo`로 출항일을 옮기고, 확정 견적 유효일을 넘으면 재협의로 되돌림 |
| 1 | `POST /v1/gm/shipments/{id}/preview` | 운영·업체 | 정산 미리보기(저장 안 함) |
| 1 | `POST /v1/gm/shipments/{id}/settle` | 업체 | 계량값·증빙번호로 정산 |
| 1 | `GET /v1/gm/summary` | 모두 | 대시보드 숫자(전체 건수, 예정 중량, 누적 인수, 인수율, 고객 절감 합계) |
| 1 | `POST /v1/gm/demo/reset` | 운영 | 시연 데이터 초기화 |
| 2 | `POST /v1/gm/intake` | 집하장 | 사진(최대 5) + 녹음 또는 글 → 등록 칸 초안 |
| 2 | `POST /v1/gm/shipments/{id}/scans` | 업체·운영 | 계량증명서 사진 → `actual` 초안 |
| 2 | `POST /v1/gm/scans/{id}/confirm` | 업체·운영 | 사람이 확인한 값만 정산에 반영 |
| 2 | `POST /v1/gm/ask` | 모두 | 법령 질문(기존 57조문 검색 그대로) |
| 3 | `GET /v1/gm/shipments/{id}/buyers` | 운영 | 품목별로 사 갈 만한 회사와 이유 |
| 3 | `POST /v1/gm/shipments/{id}/offers` | 업체 | 품목별 값 제안 |

상태 이동은 지금 규칙 그대로다: `registered → confirmed → settled`. 확정은 유효기간이 출항일 이후인 조건만, 정산은 출항일이 지난 건만, 인수량은 계량 총중량 이하만 된다. 틀리면 400과 지금 화면과 같은 문구(`"인수 중량의 반출 중량 초과 불가"` 등)를 `detail`에 담아 돌려준다. 백엔드 문구 규칙 때문에 가운뎃점(·)만 쉼표로 바뀐다. 단계가 맞지 않으면 409, 역할이 맞지 않으면 403, 보낸 `version`이 낡았으면 409.

**1단계 구현 상태(2026-11-27)**: 위 표의 1단계 경로는 `backend/app/features/gm/`에 구현했고 `backend/tests/test_gm.py` 9개(시제품 테스트 5개 이식 + API 흐름 4개)가 통과한다. 2·3단계는 아직이다.

## 4. 단계와 끝 기준

| 단계 | 내용 | 끝 기준 |
|---|---|---|
| 1 | 저장, 역할, 이력, 서버 계산 | `model.test.cjs`와 같은 시나리오 서버 테스트 통과(5톤 중 2·3·4톤 → 절감 −4·4·12만 원, 공헌 −3·1·5만 원). 웹 `app/`이 서버 모드로 등록부터 정산까지 감 |
| 2 | 사진+음성 등록, 계량증명서 읽기 | 말과 사진이 다르면 되묻고, 사진에서 나온 숫자는 칸에 안 들어감. 확인 전 스캔 값은 정산에 안 들어감 |
| 3 | 품목 나누기와 구매자 제안 | 같은 반출분에서 `sell` 품목이 생기면 고객 절감이 그만큼 커지는 테스트 |

화면 쪽 할 일: 웹은 `app/app.js`·`dashboard.js`의 저장소 읽기·쓰기를 API 호출로 바꾸고 실패하면 저장소로 돌아간다. iOS는 같은 일을 `URLSession`으로 한다. 서버 주소는 설정 한 줄로 바꾼다.

## 5. 실행 (2026-11-27 웹 연결 완료)

```bash
deploy/run_gm.sh            # API 8000 + 웹 화면 8765. 처음이면 보령 시연 계정을 넣음
deploy/run_gm.sh --reset    # DB를 지우고 처음부터
```

- 파이썬은 `backend/.venv/bin/python`을 쓴다. 다른 곳이면 `GM_PYTHON=/경로/python`.
- 대시보드 `http://127.0.0.1:8765/index.html`, 모바일 웹 `http://127.0.0.1:8765/app/index.html`. 서버에 붙으면 "서버 저장 모드로 연결됨"이 뜬다.
- 다른 서버를 쓰려면 주소 뒤에 `?api=http://주소:8000`(기억됨), 서버 없이 보려면 `?api=off`(그 한 번만).
- 서버가 꺼져 있거나 응답이 없으면 화면은 예전처럼 브라우저 저장소로 돈다.

**웹 연결 방식**: 루트의 `gm-api.js`가 세 역할(집하장, 운영, 처리업체)로 시연 로그인을 하고, 화면이 기록을 바꾸면 이전 기록과 비교해 맞는 API(등록, 조건 수정, 확정, 정산)를 부른다. 화면은 바로 바뀌고 서버 저장이 뒤따르며, 서버가 거절하면 "서버 저장 실패, (이유)"를 띄우고 서버 기록으로 되돌린다. `app/app.js`와 `dashboard.js`는 저장·초기화·시작 부분만 고쳤다.

## 6. iOS 연결 (Mac 담당)

저장은 `ios/GeumulMajung/App.swift`의 `Store` 한 곳(`UserDefaults`)이다. 웹과 같은 방식으로 바꾸면 된다.

1. 시작할 때 `POST /v1/gm/demo-login/factory|operator|recycler`로 토큰 3개를 받고 `GET /v1/gm/shipments`로 목록을 받는다. 실패하면 지금처럼 `UserDefaults`.
2. `Store.save`에서 이전 기록과 비교해 부른다: 새 건 → `POST /shipments`(집하장 토큰), 등록 단계 조건 저장 → `PUT /shipments/{id}/quotes`, 확정 → 그 뒤 `POST /confirm {choice}`(운영 토큰), 정산 → `POST /settle {total, accepted, extra, reference, reason, signer}`(처리업체 토큰). 응답으로 온 기록으로 바꿔 끼운다. 요청 본문에 받은 `version`을 같이 보내면 낡은 화면의 덮어쓰기를 막는다.
3. 날짜는 문자열이다: `departure`는 `"2026-11-27T08:30"`, `validUntil`은 `"2026-11-27"`. 지금 `Shipment`는 `Date`로 들고 있으니 `JSONDecoder`의 날짜 해석을 두 모양에 맞추거나 문자열로 받아 바꾼다. 서버가 더 주는 칸(`totals`, `history`, `version`, `noticeBy`, `updatedAt`)은 무시해도 된다.
4. 시뮬레이터는 Mac의 `http://127.0.0.1:8000`에 붙는다. http라서 Info 설정에 `NSAppTransportSecurity > NSAllowsLocalNetworking = YES`가 필요하다(이 프로젝트는 `GENERATE_INFOPLIST_FILE`이라 빌드 설정의 Info 항목으로 넣는다). 실제 iPhone은 Mac의 내부망 주소로 바꾼다.
5. 확인: 웹에서 등록한 건이 iOS 목록에 보이고, iOS에서 정산한 건이 웹 대시보드 숫자에 반영되면 끝이다.
