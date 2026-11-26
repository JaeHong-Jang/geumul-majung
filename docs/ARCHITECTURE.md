# 마대 장터 — 백엔드 설계 계약서 v0.9 (15절 > 14절 > 13절 > 12절 > 11절 > 10절 > 9절 > 8절 > 앞 절)

v0.1.2: Argon 판정(docs/orchestra/argon_verdict.md) 반영 — operator 가입, 정산 기준, 취소 P1, 묶음 후보 좌표, 경제성 문구 명시. 위험 재질 한글 별칭 추가.

모든 팀은 이 문서를 기준으로 작업한다. 바꿀 때는 이 문서를 먼저 고친다.
상위 설계: 노션 "백엔드 설계"(40bfdc5b…), `research_notes/29차 백엔드 설계/00_백엔드_설계.md`.

## 0. P0 범위
거래 한 바퀴: 회사 가입 → 운영자 허가 확인 → 마대 등록 → 등급(통과증) → 판매 게시 → 주문(가짜 결제 보류) → 운반 콜·수락 → 수거(마대별 무게) → 도착 → 도착 검사 → 확정·정산(가짜) → 인계서 3칸 → 인계서 번호 → 별점.
- 사진 대신 품목 입력(`items`). 결제는 가짜 PG. 위치 계산은 위경도 직선거리(haversine), PostGIS는 나중.
- DB는 SQLAlchemy 2. 개발·테스트 기본은 SQLite(`DATABASE_URL`, 기본 `sqlite:///./masdae.db`, 테스트는 메모리). **배포 DB는 Azure Database for PostgreSQL Flexible Server로 결정(2026-11-02, 학생 플랜)**. 드라이버 `postgresql+psycopg://`. 로컬 PostgreSQL 16(pgserver)에서 전체 테스트 통과 확인.
- 인증 대신 헤더 `X-Company-Id: <정수>`로 요청한 회사를 구분(P0 한정). 없거나 없는 회사면 401.
- P0 밖: 묶음 실제 성사, 검사 불합격 처리(조정·처리 전환·반송), 실제 PG, 푸시, 사진 AI, Claude 실제 호출 테스트.

## 1. 폴더와 담당
```
masdae-market/
├─ docs/ARCHITECTURE.md        지휘부(Opus)
├─ harness/                    harness.yaml(지휘부) · agents/*.md 카드(분석팀 B) · policies/(복사본)
├─ data/                       law_articles.json · prices.json · waste_codes.json · materials.json · sources.json (읽기 전용)
└─ backend/
   ├─ app/contracts.py         공통 타입 (지휘부, 수정 금지)
   ├─ app/main.py              FastAPI 앱 조립 (분석팀 A)
   ├─ app/core/                설정·인증(deps)·토큰·본문 제한 (A)
   ├─ app/db/                  SQLAlchemy 모델·세션 (A)
   ├─ app/features/<기능>/     거래 API를 기능별로: router.py(경로) · service.py(규칙) · schemas.py(입력) (A). 목록과 규칙은 docs/STRUCTURE.md
   │                           agent_runs/ = agent-runs·harness 라우트 (B). 예전 app/api, app/services는 없어졌다(2026-11-05)
   ├─ app/harness/             registry·runner·gates·trace (B)
   ├─ app/agents/              sorting/ trade/ review/ orchestrator.py (B)
   ├─ app/llm/                 base·ollama·claude·mock (B)
   ├─ app/tools/               데이터 읽기·계산 도구 (B)
   ├─ seed/                    구미 가상 시나리오 데이터 (A)
   └─ tests/                   test_trade_*.py (A) · test_harness_*.py (B) · acceptance/ (Sol, 이 문서만 보고 작성)
```
파이썬 실행: `backend/.venv/bin/python`, 테스트: `cd backend && .venv/bin/python -m pytest -q`.

## 2. A ↔ B 연결 (하네스 호출 지점)
B가 `app/harness/runner.py`에 아래 함수를 제공한다. A는 이 함수만 부른다.
```python
def run_flow(flow: str, ctx: dict) -> RunResult   # app.contracts.RunResult
```
| 호출 지점(A) | flow | ctx에 넣는 것 | A가 결과에서 쓰는 것 |
|---|---|---|---|
| `POST /v1/bags/{id}/grade` | `grade_bag` | `{"bag": {...bag 필드}}` | `results[grading].data["grade"]` (GradeResult dict) |
| `POST /v1/listings` 응답 | `listing_advice` | `{"listing": {...}, "bags": [...], "nearby_listings": [...], "factory": {...}}` | 응답에 `advice`(RunResult)로 그대로 첨부 |
| `POST /v1/orders` | `deal_check` | `{"order": {...}, "listing": {...}, "factory": {...}, "recycler": {...}}` | 응답에 `checklist`(RunResult) 첨부. 결과가 주문을 막지는 않음(허가 확인은 A 코드가 따로 함) |
| `POST /v1/companies` (factory) | `profile_company` | `{"company": {...}}` | 응답에 `guide`(RunResult) 첨부 |

- 등급 숫자(순도·등급)는 ③ grading의 코드 계산값만 쓴다. LLM이 등급을 바꾸지 못한다.
- `run_flow`는 LLM이 꺼져 있거나 실패해도 예외 없이 RunResult를 돌려준다(템플릿 요약, `llm.available=false`).
- 모든 RunResult는 `agent_runs` 표에 저장(A가 표를 만들고, B는 `app/harness/trace.py`의 `save_run(session, result)`를 A의 세션으로 호출). 조회: `GET /v1/agent-runs/{run_id}`(B 라우트).

## 3. API (P0, 모두 JSON, 접두사 `/v1`)
에러: 400 잘못된 입력, 401 회사 헤더 없음, 403 권한·역할·허가 없음, 404 없음, 409 상태 충돌(허용 안 되는 상태 변경, 이미 수락된 콜 등).
검사 순서(v0.1.1 지휘부 결정): 401 → 역할 403 → 404 → 당사자 403(배정 안 된 운반업체 포함) → 상태 409 → 입력 400. 예: 결제 보류 주문에 운반업체가 pickup → 아직 배정이 없으므로 403. 배정된 운반업체가 수거 전에 arrive → 409.

### 회사
| 메서드 경로 | 누가 | 요청 | 응답 |
|---|---|---|---|
| `POST /v1/companies` | 누구나(헤더 없음, **operator 공개 가입·즉시 verified는 P0 시연용 단순화. 실제 운영 전 시드·관리 토큰으로 제한**) | `{name, role, biz_no, lat, lon, permit_no?, permit_codes?: [폐기물코드], industry?}` | `201 {id, name, role, verified, permit_codes, guide?}` — factory·operator는 `verified=true`, recycler·hauler는 `false` |
| `POST /v1/admin/companies/{id}/verify` | operator | `{}` | `{id, verified: true}` |

### 마대·통과증
| `POST /v1/bags` | factory | `{waste_code, target_material, items: [{material, kg}], note?}` | `201 {id, factory_id, waste_code, target_material, items, total_kg, status:"registered"}` — total_kg = items 합 |
| `POST /v1/bags/{id}/grade` | 그 마대의 factory | `{}` | `{bag_id, grade: GradeResult, pass_id?, qr?, run_id}` — grade.grade가 null이면 pass 없음. 있으면 `pass_id`, `qr`="MDP-{pass_id}-{bag_id}" |

### 판매
| `POST /v1/listings` | factory | `{bag_ids: [..], mode: "now"|"bundle", price_krw_per_kg}` | `201 {id, status, waste_code, grade, total_kg, price_krw_per_kg, advice}` — 모든 마대가 같은 waste_code·같은 grade, 통과증 있음, 자기 마대, 다른 판매에 안 묶임. mode=bundle이면 status=`bundle_wait`, now면 `posted` |
| `GET /v1/listings?waste_code=` | 누구나 | — | `[{id, status, waste_code, grade, total_kg, price_krw_per_kg, factory_id}]` (posted만) |

### 주문·배차·검사
| `POST /v1/orders` | recycler (verified, permit_codes에 그 waste_code) | `{listing_id}` | `201 {id, status:"payment_held", goods_krw, listing_id, checklist}` — goods_krw = round(total_kg × price). 가짜 PG 보류. listing → sold |
| `GET /v1/calls` | hauler | — | 아직 수락 안 된 `payment_held` 주문 중 hauler의 permit_codes에 맞는 것 `[{order_id, waste_code, total_kg, pickup:{lat,lon}, dropoff:{lat,lon}}]` |
| `POST /v1/calls/{order_id}/accept` | hauler (verified, permit 맞음) | `{freight_krw}` | `{order_id, status:"dispatched", hauler_id}` — 먼저 수락한 1곳만, 나머지는 409 |
| `POST /v1/orders/{id}/pickup` | 배정된 hauler | `{bag_weights: [{bag_id, kg}]}` | `{status:"picked_up"}` — 주문의 모든 마대 무게 필요 |
| `POST /v1/orders/{id}/arrive` | 배정된 hauler | `{}` | `{status:"arrived"}` |
| `POST /v1/orders/{id}/inspect` | 주문한 recycler | `{bag_weights: [{bag_id, kg}], passed: bool, note?}` | 합격: `{status:"settled", settlement:{factory_krw, hauler_krw, platform_krw}}` (확정→정산 자동, platform 수수료 0 = 시범 무료). 불합격: `{status:"disputed"}` — **P0 정산은 주문 금액(goods_krw = 판매 total_kg × 단가) 기준. 검사 무게 차이에 따른 조정은 P1** |
| `GET /v1/orders/{id}` | 주문 당사자 3곳 | — | 주문 전체(상태 이력 포함 `history: [{from, to, by, at}]`) |

### 인계서 (3칸, 본인 칸만)
| `GET /v1/orders/{id}/handover` | 당사자 | — | `{emitter, carrier, processor, allbaro_no}` 각 칸은 `null` 또는 채워진 값 |
| `POST /v1/orders/{id}/handover/emitter` | 그 주문의 factory | `{}` | 칸 값: `{company_name, biz_no, waste_code, waste_name, bags: [{bag_id, kg}], carrier_name, prepared_at}` — 상태 picked_up 이후 |
| `POST /v1/orders/{id}/handover/carrier` | 배정 hauler | `{vehicle_no}` | `{company_name, vehicle_no, picked_up_at, total_kg, prepared_at}` — picked_up 이후 |
| `POST /v1/orders/{id}/handover/processor` | 주문 recycler | `{method}` | `{company_name, received_kg, method, prepared_at}` — confirmed/settled 이후 |
| `POST /v1/orders/{id}/handover/number` | 그 주문의 factory | `{allbaro_no}` | `{allbaro_no}` — 3칸 모두 채워진 뒤만(아니면 409) |
- 다른 회사 칸은 403. 값은 "올바로에 붙여넣을 값"이며 앱은 제출하지 않는다.
- waste_name은 `data/waste_codes.json`의 name.

### 별점
| `POST /v1/ratings` | 주문 당사자 | `{order_id, target: "factory"|"hauler"|"recycler", score: 1~5, comment?}` | `201 {id}` — allbaro_no가 있어야 함(없으면 409), 자기 자신 평가 403, 같은 평가자·대상 중복 409. factory와 recycler가 모두 1개 이상 남기면 주문 → `rated` |

### 기타
| `GET /v1/health` | `{ok:true, db:true, llm:{provider, model, available}}` |
| `GET /v1/agent-runs/{run_id}` | RunResult |
| `GET /v1/harness` | harness.yaml 내용 + 에이전트 카드 본문 |

## 4. 주문 상태
| 지금 | 갈 수 있는 곳 | 누가 |
|---|---|---|
| ordered | payment_held | 서버(주문 직후 가짜 PG 보류) |
| payment_held | dispatched, cancelled | hauler 수락 / recycler 취소 (**취소 API는 P1, P0에는 경로 없음**) |
| dispatched | picked_up | hauler |
| picked_up | arrived | hauler |
| arrived | confirmed, disputed | recycler 검사 |
| confirmed | settled | 서버(가짜 PG 정산) |
| settled | rated | 서버(양쪽 별점) |
- 이 표에 없는 변경은 409. 바뀔 때마다 `order_history`에 from·to·by(company_id)·at 저장.

## 5. 하네스 (분석팀 B)
- `harness/harness.yaml`이 팀·에이전트·flow·게이트·가정값의 단일 기준. 코드에 숫자 기준을 따로 적지 않는다.
- 에이전트 인터페이스: `run(ctx: dict, llm: LLMProvider | None) -> AgentResult`. 파일 1개 = 에이전트 1개.
- 실행: flow 순서대로 실행(앞 결과는 `ctx["results"][agent_id]`로 다음에 전달) → 게이트 3개 → 요약(orchestrator) → RunResult.
- 게이트: `evidence`, `wording`, `privacy` (`harness.yaml` 주석 참고). 막힌 주장은 `blocked=true`, `public_claims`에서 빠지고 `blocked_count`에 셈.
- 요약: LLM은 public_claims만 받아 요약, 주장에 없는 숫자가 있으면 게이트에서 막혀 1회 재요청 → 템플릿 요약.
- 에이전트별 P0 동작(LLM 없이도 동작해야 함):
  | 에이전트 | 코드(필수) | LLM(있으면) |
  |---|---|---|
  | ① profiling | 업종 문자열 키워드 → 나올 수 있는 부산물 후보 목록, level=`estimate`, "가입 때 고르기용 안내" | 안내 문장 |
  | ② vision | items 정규화(재질명 소문자, kg 합), 구성비 계산. note가 있으면 LLM이 재질 후보 추출 → level=`estimate`, 등급 계산에 안 씀 | note 읽기 |
  | ③ grading | 순도 = target_material kg / total kg, hazard 재질 있으면 grade=None, 기준은 assumptions.grade_thresholds | 없음 |
  | ④ bundling | nearby_listings(상태 posted·bundle_wait, 각 항목에 판매 공장 lat·lon 포함) 중 같은 waste_code·grade·반경 안 → 합계 kg, min_lot 충족 여부 | 설명 문장 |
  | ⑤ pricing | prices.json에서 target_material에 맞는 품목(예: pp → "PP 압축") 최근값, total_kg < min_lot이면 "모아서 팔기" 추천 | 설명 문장 |
  | ⑥ economics | 소각 위탁 시 드는 비용(INCIN-2026-09: 지자체 계약 전국평균, 소각재 처리 제외~포함) × 톤 = **아낄 수 있는 비용**, 판매 참고액(⑤ 잡색 압축품 매입가 × kg, VAT 포함·물류비 제외, 자투리 실제 매입가는 견적 확인 필요)을 따로 표시. level=`estimate`, `assumption` 근거 필수. '수입이 소각비보다 크다' 식 비교 문장 금지 | 설명 문장 |
  | ⑦ regulation | 체크리스트: recycler 허가(wma-25, wma-18-1), hauler 허가 확인 필요(wma-25), 인계서 각자 입력(wma-18-3) — law 근거 id 필수 | 조문 요약 문장 |
- LLM: `app/llm/base.py`의 `LLMProvider.chat(system, user, schema=None) -> LLMReply(text, data, model, ms)`. `ollama.py`(httpx, `/api/chat`, `format`=JSON 스키마, temperature 0), `claude.py`(공식 `anthropic` SDK, `messages.create`, 모델은 yaml, temperature 등 샘플링 파라미터 보내지 않음, 구조화 출력은 `output_config.format`), `mock.py`(테스트용), provider `off` → None.
- Claude SDK 사용법은 반드시 `/tmp/claude-1000/bundled-skills/2.1.310/61ee5df22b3d8c3ad4cec57e60406d6e/claude-api/python/claude-api/README.md`를 읽고 따른다(추측 금지). P0 테스트는 Claude를 실제로 부르지 않는다(키 없음).

## 6. 시드 (`backend/seed/gumi_demo.py`, 분석팀 A)
가상 회사만(실제 회사명 금지): 구미 가상 사출공장 3곳(가상사출A·B·C, 구미국가산단 근처 좌표), 재활용업체 1곳(가상리사이클, permit_codes ["51-03-01"]), 운반업체 1곳(가상운반, 같은 코드), 운영자 1곳. `python -m seed.gumi_demo`로 DB에 넣고 id 출력.

## 7. 완료 기준 (P0)
1. `pytest -q` 전부 통과 (LLM은 mock/off, Ollama 실호출 테스트는 Ollama 꺼져 있으면 skip).
2. 시나리오 테스트: 가입 → 허가 확인 → 마대 3개(PP 순도 0.97·0.92·0.85) 등록·등급(A·B·C 확인) + 기름 섞인 마대 1개(통과증 없음) → A 마대로 판매(now) → 주문 → 콜 수락(두 번째 수락 409) → 수거 → 도착 → 검사 합격 → 정산 → 인계서 3칸(남의 칸 403) → 번호 → 별점 → rated.
3. LLM_PROVIDER=off에서도 같은 시나리오 통과.
4. 금지 표현·근거 없는 숫자·전화번호가 들어간 주장은 public_claims에 없음(게이트 테스트).

## 8. v0.2 변경 (QA 반영, 2026-11-02) — 앞 절과 다르면 이 절이 우선
근거: docs/qa/10_종합.md (페르소나 6명). 사용자 결정 3개: 운임은 구매자 상한, 무게 차이 ±5% 안은 비례 정산, 불합격은 운영자 중재 후 3가지 중 선택.

### 8.1 입력 범위 (모두 400, 넘으면 DB에 아무것도 안 씀)
| 값 | 범위 |
|---|---|
| 마대 품목 kg | 0 초과 2,000 이하, 유한수. 품목 수 1~20. 마대 합계 2,000kg 이하 |
| 단가 price_krw_per_kg | 0 초과 100,000 이하 |
| 운임 freight_cap_krw, freight_krw | 1 이상 10,000,000 이하 정수 |
| 수거·검사 무게(마대별) | 0 초과 2,000 이하, 유한수 |
| lat / lon | -90~90 / -180~180, 유한수 |
| 경로 id, X-Company-Id, listing_id, bag_ids 원소 | 1 이상 2,147,483,647 이하 (넘으면 401/404처럼 '없음' 처리) |
| 문자열 | name·biz_no·vehicle_no 1~100자(공백만 불가), note·comment·method·inspect note 500자, allbaro_no 1~50자. NUL 문자 불가 |
| 배열 | bag_ids 1~50(중복 불가), permit_codes 0~30 |
| waste_code | data/waste_codes.json에 있는 코드만 (마대 등록·허가 코드 모두) |

### 8.2 회사·운영자
- `role: operator`는 공개 가입 불가(403). 운영자는 시드(`seed.gumi_demo`) 또는 환경변수 `OPERATOR_BOOTSTRAP_TOKEN`과 같은 값의 헤더 `X-Operator-Token`이 있을 때만 생성.
- recycler·hauler는 운영자 verify 전까지 verified=false(그대로). 운영자는 permit_codes가 비어 있는 업체를 verify할 수 없음(409).

### 8.3 운임 = 구매자가 정하는 상한
- `POST /v1/orders` 본문 `{listing_id, freight_cap_krw}`. 가짜 PG 보류 금액 = goods_krw + freight_cap_krw. 응답에 `freight_cap_krw`, `held_krw`.
- `GET /v1/calls` 항목: `{order_id, waste_code, waste_name, total_kg, bag_count, freight_cap_krw, distance_km, pickup:{lat,lon}, dropoff:{lat,lon}}` (distance_km = 직선거리, 소수 1자리).
- `POST /v1/calls/{order_id}/accept` `{freight_krw}`는 freight_cap_krw 이하만(넘으면 400).
- 정산 때 운반업체 = freight_krw, 남은 상한(cap − freight)은 구매자에게 돌려줌(`refund_krw`).

### 8.4 무게와 정산 (허용 오차 ±5%)
- `pickup`: 마대별 무게 저장. 합계가 판매 total_kg와 5% 넘게 다르면 응답에 `weight_warning: "등록 무게와 n% 차이"`(진행은 됨, history에 기록).
- `inspect` `{bag_weights, passed, note?}`:
  - passed=false → disputed.
  - passed=true이고 |검사 합계 − 판매 total_kg| / 판매 total_kg ≤ 0.05 → confirmed → settled. **factory_krw = round(검사 합계 kg × 단가)**, hauler_krw = freight_krw, platform_krw = 0, refund_krw = held_krw − factory_krw − hauler_krw.
  - passed=true여도 차이가 5% 초과 → disputed (`dispute_reason: "무게 차이 n%"`).
- 반올림은 원 단위 사사오입(ROUND_HALF_UP).

### 8.5 출구
| 경로 | 누가 | 언제 | 결과 |
|---|---|---|---|
| `POST /v1/orders/{id}/cancel` | 주문한 recycler | payment_held | cancelled, 보류 금액 전액 환불, 판매 → posted |
| `POST /v1/orders/{id}/release` | 배정 hauler 본인, 주문한 recycler, operator | dispatched(수거 전) | payment_held로 되돌림, 배정·운임 지움, 다시 콜 목록에 나옴 (기사 노쇼 대응) |
| `POST /v1/listings/{id}/withdraw` | 그 판매의 factory | posted, bundle_wait | withdrawn, 마대 풀림(다시 판매 가능) |
| `POST /v1/admin/orders/{id}/resolve` | operator | disputed | 본문 `{resolution, new_price_krw_per_kg?, treatment_fee_krw?, note}` |
- resolve 3가지:
  - `regrade` → settled. factory_krw = round(검사 합계 × new_price_krw_per_kg), 나머지 환불.
  - `treat` (재활용업체가 그 폐기물 처리 허가가 있다는 운영자 확인 전제) → settled. factory_krw = −treatment_fee_krw(공장이 처리비 냄, 가짜 PG), goods 전액 환불.
  - `return` → returned. goods 전액 환불, hauler_krw = freight_krw. 반송 운반 배차는 P1(문구로 안내).
- 반송·처리 전환의 적법성은 법률 자문 전(응답 `legal_note`에 "법률 자문 확인 필요" 고정 문구).

### 8.6 동시 요청
- 모든 주문 상태 변경은 `UPDATE … WHERE id=? AND status=<이전 상태>`의 영향 행 수로 판정, 0이면 409. (pickup·arrive·inspect·cancel·release·resolve 포함)
- 판매 생성 때 마대 선점은 `UPDATE bags SET listing_id=? WHERE id IN (…) AND listing_id IS NULL`, 영향 행 수가 마대 수와 다르면 전체 롤백 409.
- 인계서 칸·번호·별점: 인계서 번호 입력 후 3칸 잠김(409). UNIQUE 충돌은 409.
- 판매에 묶인(listing_id 있음) 마대는 재등급 409.

### 8.7 마대·등급 안전
- `harness.yaml` `assumptions.material_aliases`로 재질 이름을 표준 이름으로 바꾼 뒤 계산(예: 피피·폴리프로필렌·PP 자투리 → pp). 표에 없는 재질은 그대로 두고 reasons에 "인식 못 한 재질: X(확인 필요)".
- 위험어(hazard_materials)가 **note**에 있으면 통과증 보류: grade=None, reasons "메모에 위험 재질 언급(…)—품목에 넣거나 없음을 확인 후 다시 등급". 공장이 `POST /v1/bags/{id}/grade` `{confirm_no_hazard: true}`로 다시 요청하면 메모 위험어를 무시하고 계산(history에 확인자 기록). 품목(items)에 위험어가 있으면 확인으로도 못 풂.
- 위험어에 그리스·grease·solvent·용제·페인트·paint 추가.

### 8.8 화면용 조회 (모두 X-Company-Id 필요)
| 경로 | 누가 | 응답 |
|---|---|---|
| `GET /v1/me` | 모두 | `{id,name,role,verified,permit_codes,lat,lon}` |
| `GET /v1/me/bags` | factory | 내 마대 `[{id,waste_code,waste_name,target_material,total_kg,status,grade,purity,pass_id,qr,listing_id,created_at}]` |
| `GET /v1/bags/{id}` | 그 factory | 위 + items, reasons |
| `GET /v1/me/listings` | factory | 내 판매 전부(모든 상태) + bag_ids, order_id |
| `GET /v1/listings/{id}` | 누구나 | `{id,status,waste_code,waste_name,grade,target_material,purity_avg,composition:{재질:비율},total_kg,bag_count,price_krw_per_kg,factory_name,area:{lat,lon}(소수 2자리로 반올림)}` |
| `GET /v1/me/orders` | 모두(역할별 당사자 주문) | `[{id,status,role_in_order,waste_name,total_kg,goods_krw,freight_cap_krw,freight_krw,counterparty_names,updated_at}]` 최신순 |
| `GET /v1/listings` 항목에 waste_name·grade·bag_count·factory_name 추가 |
- 날짜는 모두 UTC ISO8601(+00:00 포함).

### 8.9 하네스(분석팀 B)
- Ollama `timeout_s: 15`. 한 실행(run) 안에서 LLM 호출이 한 번 실패하면 그 run의 나머지 LLM 호출은 건너뜀(템플릿). `/v1/health`의 `llm.available`은 실제 확인(Ollama `/api/tags` 1초, Claude는 키 존재 여부).
- **요약 뜻 검사(게이트 추가)**: (1) 요약·LLM 문장에 "[A-C] ?등급"이 있으면 grading 결과 등급과 같아야 함, 등급 없음이면 등급 글자 금지. (2) pricing data에 `relation: below|within|above`(입력 단가 vs 시세 범위)를 두고, 요약의 "범위 안/내·적정"·"낮"·"높" 표현이 relation과 어긋나면 차단. (3) 사용자가 쓴 문자열(회사 이름, 업종, 재질 이름, 메모)은 LLM 요약 입력에 원문으로 넣지 않음(코드가 만든 주장 문장만 넣고, 사용자 문자열은 "[입력값]"으로 가림). 업종 문자열이 공개 주장 문장에 그대로 들어가지 않게 profiling 문장도 고정 문구로.
- ② vision 후보는 메모에 실제로 나오는 단어(재질 별칭 포함)만, 최대 5개. 메모 위험어는 public 주장으로 "메모에 위험 재질 언급: …(사람 확인 필요)".
- 화면용 `summary`에서 `[agent:n]` 인용 꼬리표는 지움(검사는 지우기 전에 함).
- `/v1/harness`는 팀·에이전트·flow·카드만(LLM 주소·모델·assumptions 제외). `/v1/agent-runs/{id}`는 X-Company-Id 필요, 막힌 주장은 text를 "[차단됨]"으로 바꿔 반환.

### 8.10 v0.2 완료 기준
1. 위 각 항목에 회귀 테스트, `pytest -q` 전부 통과(SQLite) + 같은 테스트를 PostgreSQL(`DATABASE_URL=postgresql+psycopg://…`)에서도 통과.
2. QA 재현 사례(docs/qa/01~05의 '상' 항목)가 모두 막힘을 테스트로 확인.

## 9. v0.3 변경 (v0.2 재검사 반영, 2026-11-02) — 8절과 다르면 이 절이 우선
근거: docs/qa/20_v02_재검사.md(Sonnet, 수정 필요), docs/orchestra/sol_v02_review.md(Sol, 반려).

### 9.1 돈
- 금액 칸(goods·freight·held·factory·hauler·refund·fee 등)은 DB에서 BigInteger. 금액 상한은 판매 1건 100억 원(넘으면 판매 생성 400).
- kg은 소수 3자리(0.001kg), 단가는 소수 2자리로 입력 때 반올림해 저장. 합계·비율·금액 계산은 전부 `Decimal(str(값))`로(실수 덧셈 금지).
- **보류 금액 = round(goods × 1.05) + freight_cap**. 검사 무게가 +5%까지 늘어도 공장 몫을 깎지 않음(min으로 자르기 금지). refund = held − factory − hauler (항상 0 이상).
- regrade의 new_price는 원래 단가 이하만(초과 400). 
- treat 정산 칸: `factory_krw: 0`, `factory_charge_krw: 처리비`(공장이 따로 냄, 가짜 PG), `recycler_fee_krw: 처리비`(재활용업체가 받음), `hauler_krw`, `refund_krw = held − hauler`. 
- return: `factory_krw 0, hauler_krw, refund_krw = held − hauler`. 판매는 withdrawn, 마대는 listing_id 해제·통과증 삭제(status registered, 다시 등급 받아야 재판매).

### 9.2 동시 요청·순서
- 운반업체가 하는 변경(pickup·arrive·release)과 recycler·operator의 release는 `status=이전 AND hauler_id=<읽은 배정 업체>` 조건으로 UPDATE(재배차 뒤 이전 기사의 늦은 요청은 409).
- 판매 생성의 마대 선점 조건에 `pass_id IS NOT NULL AND grade=<판매 등급>` 추가(재등급과 경합 시 409).
- 인계서 칸 저장·번호 입력·별점(rated 전이)은 주문 행을 `SELECT … FOR UPDATE`로 잠근 뒤 처리(PostgreSQL). 양쪽 첫 별점이 동시에 와도 rated로 감.

### 9.3 AI 입력·출력
- **사용자 문자열은 주장(claim) 문장에 넣지 않음.** 회사 이름·업종·메모·재질 이름(별칭 표에 없는 것)은 `data`(기계용 칸)에만 두고, 문장에는 "[입력값]" 또는 표준 재질명만. reasons 문장도 같음. 그러면 LLM 입력은 자동으로 깨끗함.
- **등급·시세 판단 문장은 코드가 씀.** 요약 = 코드가 만든 사실 문장(등급, 가격이 시세보다 낮음/범위 안/높음) + LLM 문장. LLM 문장 중 등급(A/B/C·급·등급)이나 가격-시세 관계(범위·시세·적정·비싸·저렴·낮·높·초과·미만)를 말하는 문장은 통째로 뺌. 이 규칙은 LLM 설명 문장(public claims의 llm 주장)에도 같게.
- 확정처럼 말하는 표현 차단 목록 추가: "절약할 수 있", "아낄 수 있", "확실", "보장", "반드시" → 그 문장 뺌.
- 인용 꼬리표 지운 뒤 남는 ".,", ",,", "에 따라." 같은 찌꺼기 정리. 쉼표만 이어진 부분 제거.
- LLM 호출 1번에 전체 시간 상한 15초(응답이 조금씩 계속 와도 15초에 끊음).

### 9.4 접근
- `agent_runs`에 `company_ids`(요청 회사 + 그 거래 당사자들) 저장. `GET /v1/agent-runs/{id}`는 그 회사들과 operator만(아니면 404). 메모리 대체 조회는 operator만.
- `GET /v1/listings/{id}`: posted·bundle_wait는 로그인한 누구나, sold·withdrawn은 판매 공장·주문 당사자·operator만(아니면 404).
- `/v1/health`의 llm은 `{provider, available}`만(모델명 제외). `/v1/harness`는 operator가 아니면 팀·에이전트 이름·흐름만(카드 본문 제외).

### 9.5 완료 기준
- 9.1~9.4와 docs/qa/20_v02_재검사.md N1~N7, sol_v02_review.md 표의 각 행에 회귀 테스트. SQLite·PostgreSQL 모두 통과(동시성 테스트는 PostgreSQL).

## 10. v0.4 변경 (앱 연동·공개 배포 준비, 2026-11-04) — 앞 절과 다르면 이 절이 우선
0절의 'X-Company-Id 인증(P0 한정)'을 끝낸다. 공개 서버에서는 누구나 이 헤더로 다른 회사나 운영자 행세를 할 수 있기 때문이다.

### 10.1 가입·로그인
- `POST /v1/companies` 본문에 `login_id`(1~100자, 앞뒤 공백을 지우고 대소문자를 구분하지 않음), `password`(8~128자, 공백만·흔한 비밀번호 불가) 추가. 둘 중 하나만 있으면 400. 10.2의 개발 모드가 아니면 둘 다 필수(없으면 400). 같은 login_id는 409(회사도 만들어지지 않음). 응답에 비밀번호·해시 없음.
- `POST /v1/auth/login` `{login_id, password}` → `{access_token, token_type:"bearer", expires_in, company:{id,name,role,verified,permit_codes,lat,lon}}`. 없는 계정과 틀린 비밀번호는 같은 401.
- 비밀번호는 scrypt(N=2^14, r=8, p=5)로 해시해 `credentials` 표에 저장. 평문 저장·로그 금지.

### 10.2 요청 인증
- `Authorization: Bearer <토큰>`. 토큰은 HS256 JWT, 유효 12시간(재발급은 다시 로그인).
- `X-Company-Id`는 환경변수 `AUTH_ALLOW_COMPANY_HEADER=1`일 때만 인정(테스트·로컬 전용, **배포에서 켜지 않음**). 기본은 꺼짐.
- Authorization이 있으면 토큰만 본다. 토큰이 잘못되면 X-Company-Id가 있어도 401.
- `GET /v1/harness`의 운영자 판별도 같은 규칙(인증 실패면 401이 아니라 공개 범위만 반환).
- 서버는 `JWT_SECRET`(32자 이상)이 없으면 시작하지 않는다.

### 10.3 CORS
- 환경변수 `CORS_ORIGINS`(쉼표로 구분)에 있는 출처만 허용. 없으면 CORS 응답 없음. 웹 미리보기용이며 네이티브 앱은 필요 없음. 쿠키를 쓰지 않으므로 credentials는 끔.

### 10.4 시드
- `python -m seed.gumi_demo`는 사업자번호를 login_id로 쓰는 가상 계정을 만들고, 공통 비밀번호는 `SEED_PASSWORD`(16자 이상) 또는 임의 생성값을 한 번 출력. 운영자 비밀번호는 항상 따로 임의 생성해 한 번 출력. 데모 전용이며 DB마다 한 번만 실행.

### 10.5 아직 안 함
- 비밀번호 변경·찾기, 토큰 강제 만료.
- **공개 가입을 열기 전에 필수**(근거: 2026-11-04 보안 리뷰, 지금은 11.3으로 가입을 닫아 막음):
  1. 가입 시도 횟수 제한.
  2. 가입 때 LLM 호출 빼기. 지금은 공장 가입마다 LLM을 부른다(비용·스레드 점유).
  3. 공장 가입 즉시 verified 재검토. 지금은 남의 회사명·사업자번호로 가입해 바로 판매할 수 있다(사용자 결정 필요).
  4. `OPERATOR_BOOTSTRAP_TOKEN`: 길이 검사, 운영자가 생긴 뒤에는 재사용 금지.
  5. `advice`의 묶음 `matches`에서 거리·판매 id 빼기. 지금은 거리로 공장 정밀 위치를 역산할 수 있다.
- **공개 배포 전에 필수:** 대화 요청 횟수 제한(`POST /v1/assistant/chat`, 21.3). 질문마다 LLM을 부를 수 있어 비용·스레드 점유가 생긴다.
- **실제 데이터가 쌓이기 전에 필수:** DB 변경 관리(Alembic 등). `create_all`은 이미 있는 표에 칸을 추가하지 않아, 데이터가 쌓인 뒤 칸을 바꾸면 그 칸을 읽고 쓰는 요청이 실패한다(2026-11-04 테스트 DB에서 실제 발생).

### 10.6 앱 연결용 칸 추가 (기존 칸은 그대로)
- 회사: 선택 입력 `region`(표시용 지역명).
- `GET /v1/listings` 항목에 `region`, `target_material`. `GET /v1/listings/{id}`에 `region`.
- `GET /v1/calls` 항목에 `grade`, `pickup_name`, `pickup_region`, `dropoff_name`, `dropoff_region`.
- `GET /v1/me/orders` 항목에 `grade`, `bag_count`, `target_material`, `settlement`.
- `GET /v1/orders/{id}`: 배정된 기사에게만 콜 항목과 같은 모양의 `call` 추가.
- `seed/demo_listings.py`: 서버가 떠 있을 때 시연 매물을 API로 등록(가격은 시연용 임의값).

### 10.7 완료 기준
- 10.1~10.4에 회귀 테스트, `pytest -q` 전부 통과(SQLite·PostgreSQL). 실제 HTTP로 로그인 → 조회 → 위조 헤더 차단 확인.

## 11. v0.5 변경 (앱별 API·공개 배포, 2026-11-04)
DB와 거래 규칙은 하나다. 앱마다 달라지는 것은 첫 화면이 필요로 하는 묶음이므로 앱별 조회만 나눈다. 쓰기는 기존 경로를 그대로 쓴다(역할 검사가 이미 앱을 구분한다).

### 11.1 앱별 첫 화면
| 경로 | 역할 | 응답 |
|---|---|---|
| `GET /v1/buyer/home` | recycler | `{company, listings, prices, volumes, active_orders}` |
| `GET /v1/carrier/home` | hauler | `{company, calls, running, settled_total, settled_count}` |
| `GET /v1/seller/home` | factory | `{company, listings, orders, prices, volumes, bag_count}` |
`company`는 `GET /v1/me` 칸 + `region`. 다른 역할이면 403.

`company`에는 `biz_no`, `permit_no`도 포함.

### 11.1-2 화면용 칸 추가 (기존 칸은 그대로)
- `GET /v1/orders/{id}`: `factory_name`, `recycler_name`, `hauler_name`, `waste_name`, `grade`, `bags: [{id,total_kg,target_material,grade,purity}]`.
- `GET /v1/me/orders`: `handover: {emitter, carrier, processor (작성 여부 bool), allbaro_no}`.
- `GET /v1/listings`: `purity_avg`, `market`. `GET /v1/listings/{id}`: `bags: [{id,total_kg,grade,purity}]`, `market`.

### 11.2 시세
`GET /v1/market/prices?category=` (로그인 필요) → `data/prices.json`의 공개 시세에서 품목별 전국 최신값 `[{item, category, price, unit, date, change_pct, source_id}]`. `change_pct`는 같은 품목 직전 값 대비 %, 없으면 null. 지어낸 값 금지.

### 11.3 공개 배포 설정
| 환경변수 | 뜻 |
|---|---|
| `APP_ENV=production` | `/docs`·`/redoc`·`/openapi.json` 끔. `AUTH_ALLOW_COMPANY_HEADER=1`이면 시작 거부 |
| `ALLOW_SIGNUP=1` | 공개 가입 허용. 없으면 `POST /v1/companies`는 403(유효한 운영자 토큰이 있는 운영자 생성만 예외) |
| `STATIC_DIR` | 있으면 그 폴더를 `/`에 제공(앱 웹 빌드 `/buyer/`, `/carrier/`, `/seller/`). API와 같은 주소라 CORS가 필요 없음 |
| `OPERATOR_BOOTSTRAP_TOKEN` | 배포에서는 설정하지 않음 |
- 로그인: 같은 login_id로 5분 안에 5번 실패하면 429(서버 메모리 기준, 인스턴스 1대 전제). 성공하면 초기화.
- `/v1/health`의 `db`는 실제 `SELECT 1` 결과. 실패하면 503.
- 잘못된 `waste_code` 조회는 빈 목록.

### 11.4 실제 값과 시연 값
- **실제 공개 데이터:** 시세(`data/prices.json`), 폐기물 코드, 법 조문.
- **시연용 가상:** 회사·매물·거래. 실제 회사명 금지(6절 유지). 실제 공장 데이터(`data/60_서비스데이터셋`)는 외부 공유 조건과 카카오 좌표 제한 때문에 공개 서버 DB에 넣지 않는다(사용자 결정 전).

### 11.5 물량
`GET /v1/market/volumes` (로그인 필요, 역할 무관) → 지금 `posted` 매물을 `(waste_code, target_material)`로 묶은 합계. 물량(`total_kg`) 큰 순, 같으면 `waste_code`·재질 순. 주문되어 `sold`가 된 매물, `bundle_wait`, `withdrawn`은 제외.
- 항목: `{waste_code, waste_name, target_material, total_kg, listing_count, seller_count, bag_count, min_price, max_price, grades, market}`.
- `target_material`은 `harness.yaml`의 `material_aliases`로 표준화(`PP`·`pp`·`폴리프로필렌`은 한 묶음). 매물의 재질은 첫 마대 기준(`GET /v1/listings`와 같음).
- `grades`: 등급별 kg `{"A": kg, "B": kg}`. 물량이 없는 등급은 뺀다.
- `min_price`·`max_price`: 묶음 안 `price_krw_per_kg`의 최소·최대.
- `market`: `{item, price, unit, date}` 또는 null. 11.2의 공개 시세에서 아래 대응표로만 찾고, 표에 없으면 null(추정·보간 금지).

| 표준 재질 | 시세 품목 |
|---|---|
| pp / pe / pet | PP 압축 / PE 압축 / PET 압축 |
| 철 / 알루미늄 / 골판지 | 철스크랩 / 알루미늄캔 / 폐골판지 |

- 같은 모양의 `market`을 `GET /v1/listings` 각 항목과 `GET /v1/listings/{id}`에도 넣는다(시세 대비 표시용). 기존 칸은 그대로.
- `GET /v1/buyer/home`, `GET /v1/seller/home`에 `volumes`(이 목록)를 포함한다.

## 12. v0.6 변경 (앱 화면 전 기능 실제화, 2026-11-05)
이 절 작성 당시 기준 화면은 Flutter 시연 앱(현재 `archive/legacy/janjaemi-app/`, 구매자·운송기사)이었다. 현재 실행 UI는 `frontend/`의 React 웹 앱이다. 그 화면의 값과 버튼은 숨기지 않고 실제 기능으로 만든다. 기존 칸은 바꾸지 않고 더한다. 모두 로그인 필요, 달리 적지 않으면 자기 데이터만 접근(남의 것 404).
**지어내지 않는다.** 근거가 없는 값은 null로 주고 화면은 그 줄을 뺀다. 대상: 탄소 감축량(`carbon_kg`, 출처 있는 계수 없음), 주유 쿠폰(제도 없음, 만들지 않음).

### 12.1 회사 정보
`GET /v1/me/profile` → `{id,name,role,verified,biz_no,permit_no,permit_codes,region,address,lat,lon,vehicle_no,vehicle_type,capacity_ton,online}`. `PATCH /v1/me/profile {region?,address?,vehicle_no?,vehicle_type?,capacity_ton?}`(차량 칸은 hauler만, 아니면 403). `GET /v1/me` 칸은 그대로.

### 12.2 구매자 편의
| 경로 | 내용 |
|---|---|
| `GET·POST /v1/me/addresses`, `DELETE /v1/me/addresses/{id}`, `POST /v1/me/addresses/{id}/default` | 배송지 `{id,label,address,is_default}`. 첫 배송지는 자동 기본 |
| `GET·PUT /v1/me/interests` | `{waste_codes:[],min_grade:"A"|"B"|"C"|null}`. `GET /v1/buyer/home`에 조건 맞는 매물 `recommended` 추가 |
| `GET /v1/me/favorites`, `PUT·DELETE /v1/favorites/{listing_id}` | 찜. 목록 항목은 매물 칸 + 판매 상태 |
| `GET /v1/me/frequent-sellers` | 내 주문에서 집계 `[{factory_id,name,region,order_count,total_kg,avg_rating}]` |
| `GET /v1/me/impact` | settled·rated 기준 이번 달 `{month,role,kg,order_count,carbon_kg:null}` |

### 12.3 매물 칸 추가
`GET /v1/listings`, `/listings/{id}`에 `distance_km`(내 회사에서 판매 공장까지 직선거리, 소수 1자리, 로그인 없으면 null), `price_vs_market_pct`(시세가 있으면 (단가−시세)/시세×100, 소수 1자리), `favorite`(bool), `available_from`, `pickup_note`, `factory_rating`(평균 또는 null), `issued_at`(첫 통과증 발급 시각). `/listings/{id}`의 `bags` 항목에 `pass_id`,`qr`,`has_photo`.
`GET /v1/listings`에 선택 쿼리 `q`(재질·폐기물·회사·지역 검색), `grade`, `sort=price|distance|recent`. `POST /v1/listings`에 선택 `available_from`(날짜), `pickup_note`.
`GET /v1/market/prices/{item}/history` → 그 품목 전국 시세 `[{date,price}]` 오래된 순(실제 데이터).

국제 원자재 실시간 시세(참고 지표, 2026-11-05 추가, `app/features/market/live.py`). Yahoo Finance chart API(키 없음, 공식 계약 없음)를 서버에서 불러 1일·1주는 1분, 그 밖은 15분 캐시한다. 바깥 호출이 실패하면 직전 값에 `stale:true`, 직전 값도 없으면 503.
- `GET /v1/market/live` (로그인 필요) → `{fx:{krw_per_usd,stale}, quotes:[{symbol,item,unit,price,prev_close,change,change_pct,open,day_high,day_low,week52_high,week52_low,market_time,krw_per_kg,stale}], source}`. 품목: `ALI=F` 알루미늄(USD/톤), `HG=F` 구리(USD/파운드), `HRC=F` 미국 열연강판(USD/숏톤). `krw_per_kg`는 원/달러(`KRW=X`)로 환산한 값. 한 품목만 실패하면 그 칸에 `error`.
- `GET /v1/market/live/{symbol}?range=1d|5d|1mo|3mo|6mo|1y|5y` → 위 품목 값 + `{range, points:[{t,price}], range_change_pct}`. 1일 등락률은 전일 종가 기준. 없는 심볼 404, 틀린 기간 400.
- 국제 선물 가격이라 국내 재활용 원료 매입가(위 `market/prices`, 한국환경공단 월간)와 다르다. 화면에 출처와 함께 따로 표시한다.

### 12.4 주문 선택
`POST /v1/orders`에 선택 `transport:"matched"|"self"`(기본 matched), `payment:"escrow"|"invoice"`(기본 escrow), `delivery_address`, `desired_date`, `note`(500자). 응답·`GET /v1/orders/{id}`·`/me/orders`에 같은 칸 추가. 콜 항목에 `desired_date`, `note`, `available_from`, `pickup_note`, `factory_rating`.
- **self(직접 수거):** 구매 업체가 운반한다. `freight_cap_krw`는 0을 허용(그 외 기존 규칙). 콜에 나오지 않고 주문 즉시 dispatched, `hauler_id`=구매 업체, `freight_krw`=0. pickup·arrive를 그 구매 업체가 한다. 응답 `legal_note`에 "운반 허가 확인 필요". 인계서 운반자 칸도 구매 업체가 쓴다. 후기에서 hauler 대상 평가 불가.
- **invoice(세금계산서):** 앱이 대금을 보류하지 않는다. `held_krw`=운임 상한만, Payment 상태 `invoice`. 정산 칸에 `invoice:true`, `factory_krw`는 판매자가 받을 금액(직접 정산), `refund_krw`=상한−운임.
`POST /v1/orders/batch {listing_ids:[1~20개],freight_cap_krw_each,transport?,payment?,delivery_address?,desired_date?,note?}`: 한 트랜잭션. 하나라도 실패하면 전부 취소(409/400). 응답 `{orders:[...]}`.
`POST /v1/orders/preview {listing_ids,freight_cap_krw_each}` → `{goods_krw,held_krw,fee_krw:0,items:[...],pickup_groups:[{factory_ids,listing_ids,total_kg,radius_km}]}`. `pickup_groups`는 반경(`assumptions.bundle_radius_km`) 안에서 같이 실을 수 있는 묶음(절감액은 지어내지 않음).

### 12.5 공동 묶음
`GET /v1/buyer/bundles` → 같은 waste_code·grade이고 반경 안 판매자 2곳 이상인 posted 묶음 `[{id,waste_code,waste_name,target_material,grade,listing_ids,seller_count,total_kg,avg_distance_km,min_lot_kg,meets_min_lot,avg_price,market,reasons:[코드가 만든 사실 문장],listings:[...]}]`. 없으면 빈 목록. `GET /v1/buyer/home`에 `bundles` 추가. 구매는 `orders/batch`.

### 12.6 알림·고객센터
주문 상태가 바뀌면 당사자에게 알림 생성. `GET /v1/notifications` → `{unread,items:[{id,title,body,order_id,read,created_at}]}` 최신순 50개, `POST /v1/notifications/{id}/read`, `POST /v1/notifications/read-all`. 세 앱 home에 `unread` 추가. `GET·PUT /v1/me/notification-settings {orders:bool,market:bool}`(orders가 꺼지면 생성 안 함).
`GET /v1/support/faq`(고정 목록), `GET·POST /v1/support/tickets {subject,body}` → `{id,subject,body,status:"open",created_at}`.

### 12.7 운송기사
`PUT /v1/carrier/status {online}`(`/carrier/home`에 `online`). `online`은 표시용이고 콜 조회를 막지 않는다. `GET /v1/calls/saved`, `PUT·DELETE /v1/calls/{order_id}/save`, 콜 항목에 `saved`. `GET /v1/carrier/earnings` → `{settled_total,pending_total,items:[{order_id,name,date,amount,status:"정산 완료"|"정산 예정"}]}`. `/carrier/home`에 `vehicle` 칸(`vehicle_no,vehicle_type,capacity_ton`), `today:{income,completed,km}`(오늘 정산·완료, 거리는 직선거리 합).
QR: 배정 업체에게 `GET /v1/orders/{id}`의 `bags` 항목에 `qr`. `POST /v1/orders/{id}/scan {qr}` → 이 주문 마대면 `{bag_id,scanned,total}`, 아니면 400. 중복은 멱등. `GET /v1/orders/{id}`에 `scanned_bag_ids`. pickup은 스캔 없이도 가능하다(규칙 유지). ~~pickup 응답에 `scan_missing`~~ → **v0.6.1 정정:** 기존 테스트가 pickup 응답을 `{status}`로 고정하므로 pickup 응답은 그대로 두고, 스캔하지 않은 마대 수는 `GET /v1/orders/{id}`의 `scan_missing`으로 준다.

### 12.8 사진
`PUT /v1/bags/{id}/photo {content_type,data_base64}`(판매 공장, jpeg·png·webp, 2MB 이하, 넘으면 400). `GET /v1/bags/{id}/photo`(로그인한 누구나, 바이너리, 없으면 404). DB에 저장.

### 12.9 시드
`seed.gumi_demo`: 회사마다 주소, 기사에 차량, 구매자 배송지 1개를 가상 값으로. `seed.demo_listings`: 매물 외에 같은 지역 묶음이 생기게 공장을 늘리고, 정산까지 끝난 시연 거래 3건을 API로 만들어 거래내역·정산·물량·후기 화면이 비지 않게 한다. 회사는 가상, 시세만 실제.

### 12.10 완료 기준
각 절에 회귀 테스트, 남의 데이터 404·역할 403 테스트, SQLite·PostgreSQL 모두 통과. 돈 계산(self·invoice·batch 전부 실패 취소)은 금액까지 검사.

### 12.11 구현 확정 사항 (v0.6.1, 12.1~12.10과 다르면 이 절이 우선)
**공통**
- 12절에서 새로 만든 경로는 남의 데이터(남의 배송지·알림·티켓·마대 사진 올리기)를 404로 숨긴다. 기존 경로(`/bags/{id}` 등)의 403은 그대로.
- '이번 달'(`/me/impact`)과 '오늘'(`carrier/home.today`)은 한국 시간(UTC+9) 기준. 정산 시각은 정산 상태로 바뀐 기록 시각.
- 알림은 주문 상태가 바뀌는 같은 트랜잭션(SAVEPOINT) 안에서 만든다. 알림 저장이 실패해도 거래는 계속되고 서버 로그에 예외를 남긴다. 주문한 본인과 행동한 본인에게는 알리지 않는다. `confirmed`는 곧바로 `settled`가 이어지므로 알리지 않는다. `notification-settings.market`은 저장만 하고 아직 쓰는 알림이 없다(시장 알림 미구현).
- 새 칸이 있는 DB는 `deploy/run_local.sh --reset`으로 다시 만든다(자동 마이그레이션 없음).

**12.1~12.2** 배송지·관심 조건·찜·자주 거래하는 판매자는 recycler만(다른 역할 403). `/me/impact`는 모든 역할(역할별 기준: recycler=구매, hauler=운송, factory=판매). 첫 배송지가 자동 기본이고, 기본 배송지를 지우면 남은 것 중 가장 오래된 것이 기본이 된다. 관심 조건이 모두 비면 `recommended`는 빈 목록. `min_grade`는 그 등급 이상. 찜은 보이는 매물만(보이지 않으면 404), PUT·DELETE는 멱등. 자주 거래하는 판매자는 취소·반송을 뺀 주문을 센다.

**12.3** `distance_km`는 호출한 회사 좌표 기준. `sort=distance`는 거리를 모르면 맨 뒤. `q`는 재질·폐기물 이름과 코드·회사·지역의 부분 일치(대소문자 무시). `sort`·`grade` 값이 틀리면 400.

**12.4**
- `freight_cap_krw`(batch는 `freight_cap_krw_each`)는 `matched`는 1원 이상, `self`만 0 허용(아니면 400).
- self: 주문 즉시 `dispatched`, `hauler_id`=구매 업체, `freight_krw`=0. 그 주문의 pickup·arrive·scan을 구매 업체가 한다(다른 구매 업체·기사는 403). 콜 목록·`calls/saved`에 나오지 않고 `/calls/{id}/accept`는 409, 콜 저장은 404. 구매 업체가 release하면 `payment_held`로 돌아가지만 콜이 되지는 않고 cancel(전액 환불)만 가능. 후기에서 `target=hauler`는 400.
- invoice: `held_krw`=운임 상한만, Payment 상태 `invoice`(검사·중재·취소로도 바뀌지 않음). 정산(검사 합격·중재 regrade/treat/return 모두) `refund_krw = held_krw − hauler_krw`(운임이 상한을 못 넘으므로 음수가 되지 않음), 정산 칸에 `invoice:true`. regrade의 `factory_krw`는 새 단가×무게로 직접 정산 금액.
- `POST /v1/orders/batch`는 `201 {orders:[...]}`(요청한 순서, 각 항목은 `POST /v1/orders` 응답에서 `checklist`만 뺀 모양). 매물을 id 순으로 선점하고 하나라도 실패하면 선점한 매물까지 전부 되돌린다. `listing_ids` 중복·0개·21개 이상은 400, 없는 매물 404, 허가 없음 403, 게시 중 아님 409. 하네스 점검(`deal_check`)은 batch에서 돌리지 않는다.
- `POST /v1/orders/preview`는 recycler(verified)만. `transport`·`payment`를 선택으로 받는다(기본 matched·escrow). `items:[{listing_id,factory_id,total_kg,goods_krw,freight_cap_krw,held_krw}]`. `pickup_groups`는 **서로 다른 판매자 2곳 이상**이 반경 안인 묶음만(`{factory_ids,listing_ids,total_kg,radius_km}`). 묶는 방법은 매물 id 순으로 보며 묶음의 첫 판매 공장에서 반경 안이면 넣는 방식.

**12.5** 묶음 `id`는 문자열 `"{waste_code}-{grade}-{첫 매물 id}"`. 같은 판매자 매물만 있으면 묶음이 아니다. 묶는 방법은 위와 같다. `avg_price`는 kg 가중 평균(소수 2자리), `avg_distance_km`는 호출한 구매 업체에서 각 매물 공장까지의 평균(소수 1자리), `min_lot_kg`는 `assumptions.min_lot_kg`. 정렬은 물량 큰 순.

**12.7** 스캔은 배정 업체가 `dispatched`일 때만(아니면 409), QR 형식이 틀리거나 이 주문 마대·통과증과 맞지 않으면 400. `GET /v1/orders/{id}`는 `scanned_bag_ids`, `scan_missing`을 모든 당사자에게 주고 `bags[].qr`은 배정 업체에게만 준다. 콜 저장은 아직 수락 안 된 일반 콜만(아니면 404). `carrier/earnings`의 `date`는 정산된 건은 정산 시각, 예정 건은 마지막 갱신 시각. 정산 예정은 `dispatched·picked_up·arrived·confirmed·disputed`의 운임.

**12.8** 올린 바이트의 앞부분이 `content_type`과 맞지 않으면(jpeg `FFD8FF`, png 시그니처, webp `RIFF….WEBP`) 400. base64 글자 수는 디코드 전에, 바이트 수는 디코드 뒤에 2MB(2,097,152바이트)로 검사한다. `GET`은 저장된 `content_type`으로만 응답하고 `X-Content-Type-Options: nosniff`를 붙인다. `has_photo`는 `GET /v1/me/bags`와 주문 `bags`에도 있다.

**12.9** `seed.gumi_demo`는 가상 공장 D·E(000-00-00007·8)를 더하고 주소·차량(가상)·구매자 배송지를 넣는다. `seed.demo_listings`는 공장 1·D·E의 pp A등급 매물로 공동 묶음을 만들고, 가상 거래 3건을 등록→주문→배차→수거→검사→인계서→후기까지 API로 끝낸다(인계서 번호는 `DEMO-000n` 표시용 가상 값, 운영자 작업 없음).

## 13. v0.7 변경 (판매자 앱 전 기능, 2026-11-05)
근거: `docs/seller_api_needs.md`(칸 상세는 그 문서가 기준, 아래가 다르면 아래가 우선). 판매자 앱은 이미 이 모양으로 호출한다. 권한은 달리 적지 않으면 factory, 남의 것 404, 다른 역할 403.

### 13.1 가입·승인
- `POST /v1/signup/factory {login_id,password,name,biz_no,address,address_detail?,phone,industry,emitter_report,region}`: `ALLOW_SIGNUP=1`일 때만, 아니면 403. `201 {id,status}`. 시도 횟수는 로그인과 같은 제한을 쓴다(같은 biz_no 5분 5회).
- **좌표:** 지오코더를 쓰지 않는다(카카오 좌표는 저장·공유 제한). `region`은 서버 목록에서 고르고 그 시·군 중심 좌표를 넣는다. `GET /v1/regions` → `[{name,lat,lon}]`(로그인 불필요). 거리는 '지역 기준 어림값'이다.
- **가입 공장은 `verified=false`로 시작**하고 마대·판매는 승인 뒤에만 된다(403). 시드와 운영자 생성은 기존대로. `AUTO_APPROVE_SIGNUP=1`이면 가입 즉시 승인(로컬 시연용, 배포 금지, `APP_ENV=production`이면 시작 거부).
- 가입 응답에서 `status`: `pending`|`approved`.
- `PUT·GET /v1/me/documents`(증빙. jpeg·png·webp·pdf 2MB, DB 저장), `GET /v1/me/approval`, `POST /v1/me/approval/resubmit`. 운영자가 보완을 요청하는 `POST /v1/admin/companies/{id}/request-fix {note,missing}` 추가.
- `PATCH /v1/me/profile`에 `name,phone,industry,address_detail,emitter_report`. `GET /v1/me/profile`에도 같은 칸.
- `POST /v1/auth/password-reset {login_id,biz_no}`: 일치 여부와 상관없이 같은 응답 `{ok:true}`(계정 유무 노출 금지). 일치하면 운영자용 고객센터 티켓을 만든다. 실제 비밀번호 변경은 운영자 처리(이번 범위 밖).

### 13.2 공동판매
`/v1/pools` 목록(`?waste_code=`, `?mine=1`), `POST`, `POST /{id}/join`, `PATCH /{id}`, `POST /{id}/deadline {action,new_deadline?}`. 모양은 needs 문서 B.
- **다른 공장 이름은 노출하지 않는다.** `members`는 `{name:"참여 공장 N"|내 회사명,kg,price_krw_per_kg,mine}`. 단가도 내 것 외에는 null.
- 참여 판매는 `bundle_wait`로 묶고 같은 waste_code·grade만, 반경은 `assumptions.bundle_radius_km`. `applied_price_krw_per_kg`=참여 단가 최저, `min_price_krw_per_kg`=같은 값.
- `current_kg`가 `target_kg` 이상이거나 `sell_now`면 참여 판매 전부 `posted`로, 단가는 `applied_price_krw_per_kg`로 바꾸고 pool은 `sold`. 구매자에게는 `buyer/bundles`로 묶여 보인다. `cancel`은 내 참여만 빼고 내 판매는 `withdrawn`이 아니라 `posted`로 되돌림. 참여자가 0이면 `cancelled`.

### 13.3 재활용업체
`GET /v1/recyclers?q=&waste_code=`, `/{id}`, `PUT·DELETE·GET /v1/me/favorite-recyclers`, 홈 `recommended_recyclers`(내 마대 폐기물 코드와 허가가 맞는 가까운 순 최대 2). `verified=true`만. `pickup_method`,`terms`는 회사 칸(선택, 없으면 null). 시드 재활용업체를 2곳 이상으로.

### 13.4 거래 대화
`GET·POST /v1/orders/{id}/messages {body}`, 주문 당사자 전원. 새 메시지는 상대 당사자에게 알림(12.6). 주문 전 대화는 만들지 않는다.

### 13.5 나머지
- `GET /v1/orders/{id}/photos?stage=pickup|inspect`, `GET /v1/orders/{id}/photos/{photo_id}`, `POST /v1/orders/{id}/photos {stage,content_type,data_base64}`(pickup은 배정 업체, inspect는 구매 업체, 2MB, 조회는 당사자).
- `POST /v1/support/tickets/{id}/attachments {content_type,data_base64}`(티켓 주인).
- `PATCH /v1/listings/{id} {price_krw_per_kg?,available_from?,pickup_note?}`: 그 공장, posted·bundle_wait만(아니면 409).
- `GET /v1/waste-codes`(로그인 불필요).
- `GET /v1/me/coupons` → `[]`(제도 미정, 값 만들지 않음. 12절과 같은 이유).
- 사진·증빙 응답은 저장된 content_type + `X-Content-Type-Options: nosniff`. PDF는 첨부로 내려준다.

### 13.6 완료 기준
각 절 회귀 테스트, 남의 데이터 404, 역할 403, 미승인 공장 마대·판매 403, 비밀번호 재설정이 계정 유무를 노출하지 않음, 공동판매 단가 통일과 이름 비노출, SQLite·PostgreSQL 통과. 판매자 앱을 `npm run build` 후 실제 브라우저로 12·13절 화면 확인.

## 14. v0.8 변경 (공통 가입·로그인, 2026-11-05) — 13.1과 다르면 이 절이 우선
회원가입과 로그인은 세 앱 공통 기능이다. 사용자 결정: 회원가입은 전 앱 적용, 카카오·구글 로그인 추가, 비밀번호 재설정은 이메일로.

### 14.1 가입
`POST /v1/signup {role:"factory"|"recycler"|"hauler",login_id?,email,password,name,biz_no,address,address_detail?,phone,industry?,region,lat?,lon?,permit_no?,permit_codes?,emitter_report?,vehicle_no?,vehicle_type?,capacity_ton?}` → `201 {id,status}`. `/v1/signup/factory`는 `role=factory`로 고정한 같은 처리(판매자 앱이 부름). 공통 규칙:
- `ALLOW_SIGNUP=1`일 때만, 시도 제한 적용. 운영자는 가입 불가. 세 역할 모두 `verified=false`로 시작하고 승인 전에는 거래 불가(`AUTO_APPROVE_SIGNUP=1`은 로컬 시연 전용).
- recycler·hauler는 `permit_no`, `permit_codes` 필수. 승인은 운영자의 허가 확인을 뜻한다.
- `email`은 전체에서 유일(같으면 409). `login_id`가 없으면 이메일을 쓴다. `lat`,`lon`이 있으면 쓰고 없으면 `region` 중심 좌표(좌표 방법은 조사 뒤 확정, 14.5).
- `GET /v1/me/profile`, 13.1의 증빙·승인 경로는 세 역할 공통으로 넓힌다.

### 14.2 로그인
`POST /v1/auth/login`의 `login_id`는 아이디 또는 이메일 모두 받는다(앞뒤 공백·대소문자 무시). 응답 모양은 그대로.

### 14.3 비밀번호 재설정 (13.1의 운영자 처리를 대체)
- `POST /v1/auth/password-reset {email}`: 계정 유무와 상관없이 같은 응답 `{ok:true}`, 응답 시간도 비슷하게. 시도 제한 적용. 계정이 있으면 일회용 토큰 메일 발송.
- `POST /v1/auth/password-reset/confirm {token,new_password}`: 성공 `{ok:true}`, 잘못되거나 만료·사용된 토큰은 400. 토큰은 무작위 32바이트 이상, DB에는 해시만 저장, 30분 유효, 한 번만 사용, 새 토큰이 나오면 이전 토큰 무효. 성공하면 로그인 실패 횟수 초기화. 새 비밀번호는 가입 규칙과 같음.
- 메일 발송은 `MAIL_MODE`: `log`(기본, 로컬. 본문을 `MAIL_OUTBOX_DIR` 파일에 쓰고 로그에는 토큰을 남기지 않음), `smtp`(`SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASSWORD,MAIL_FROM`). 재설정 링크 주소는 `PUBLIC_BASE_URL` + `/{앱}/#/reset?token=`. `APP_ENV=production`에서 `MAIL_MODE=log`이면 시작 거부.

### 14.4 카카오·구글 로그인
- `GET /v1/auth/providers` → 설정된 공급자 `["kakao","google"]`(키가 없으면 빈 목록, 앱은 버튼을 숨김).
  `DEMO_LOGIN=1`(로컬 시연, `deploy/run_local.sh`)이면 `"demo"`도 들어간다. 이때만 `POST /v1/auth/demo/{seller|buyer|carrier}` → 시드 체험 계정(`000-00-00001`·`04`·`05`)의 로그인 응답과 같은 모양. 꺼져 있거나 시드 계정이 없으면 404. 배포에서는 켜지 않는다.
- `GET /v1/auth/oauth/{provider}/start?role=&app=` → 공급자 인증 주소로 302. `state`(서명, 10분, 일회용)와 PKCE(구글) 사용.
- `GET /v1/auth/oauth/{provider}/callback`: 서버가 코드를 교환하고, 구글은 id_token을 공식 방식으로 검증. 연결된 계정이 있으면 토큰을 앱으로 전달, 없으면 가입 완료 화면용 일회용 `signup_token`을 전달. 토큰은 주소에 오래 남지 않게 `#` 조각으로 넘기고 앱이 바로 지운다.
- `POST /v1/signup/social {signup_token,role,...14.1 칸(password 제외)}`로 가입 완료. 이메일이 없으면(카카오 미동의) 가입 칸에서 직접 받는다.
- `social_accounts`(`provider,subject,company_id`, 유일). 공급자 이메일이 기존 회사와 같아도 자동으로 합치지 않는다(계정 탈취 방지).
- 환경변수 `KAKAO_CLIENT_ID,KAKAO_CLIENT_SECRET,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,OAUTH_REDIRECT_BASE`. 비밀값은 저장소에 넣지 않는다.

### 14.5 회사 좌표 (근거: `docs/research/factory_coordinates.md`)
외부 지오코더 결과를 저장하지 않는다(브이월드·카카오·구글 약관). 흐름: 다음 우편번호 위젯으로 주소 입력 → 서버 변환 → 지도 핀 보정.
- `companies.coord_source`: `region`(시·군 중심), `juso`(행안부), `user`(사용자 핀), `seed`. `GET /v1/me/profile`에 포함. 가입·프로필 저장의 `lat`,`lon`은 `coord_source=user`로 기록.
- `POST /v1/geocode {road_address, adm_cd?, rn_mgt_sn?, udrt_yn?, buld_mnnm?, buld_slno?}`(로그인 또는 가입 진행 중, 회사별·접속 주소별 5분 30회): **좌표제공 키(`JUSO_COORD_KEY`)와 주소검색 키(`JUSO_SEARCH_KEY`)는 별개**다(API마다 승인이 따로이고, 좌표 키로 검색 API를 부르면 `E0001 승인되지 않은 KEY`). 그래서 프론트가 다음 우편번호 위젯 값으로 채워 보내는 행정 코드(`adm_cd`=bcode 10자리, `rn_mgt_sn`=sigunguCode+roadnameCode 12자리, `udrt_yn` 0|1, `buld_mnnm`·`buld_slno` 숫자)가 **모두 있으면 검색 없이 바로 좌표 API**를 부른다. 코드가 없으면 `JUSO_SEARCH_KEY`가 있을 때만 검색 뒤 좌표 API를 부르고, 둘 다 안 되면 `{lat:null,lon:null,source:null,region:null}`(`coord_source=region` 유지). 코드 형식이 하나라도 틀리면 400이 아니라 코드 전체를 무시하고 위 순서로 넘어간다. 성공하면 `{lat,lon,source:"juso",region}`이고 `region`은 입력 주소(검색을 거쳤으면 `siNm`·`sggNm` 포함)에서 가입 지역 목록과 맞는 시·군, 없으면 null. 응답의 `errorCode`가 `0`이 아니면 실패로 본다. 실패 로그에는 예외 종류·HTTP 상태·`errorCode`만 남기고 요청 주소(`confmKey` 포함)와 트레이스백은 남기지 않는다. 가입 저장 경로(`/signup`)는 주소 좌표를 계산하지 않고 프론트가 이 응답의 `lat`·`lon`을 가입 본문에 실어 보낸다(`coord_source=user`).
  - 확인된 사실(2026-11-05): 승인받은 좌표제공 키로 `addrCoordApi.do`가 정상 동작했고(양재동 코드 `1165010200`, `116504163008`, `0`, `6`, `0` → 37.469346, 127.040002), 검색 응답의 필드명 `siNm`·`sggNm`은 맞다. 좌표계는 `entX`·`entY`를 UTM-K(EPSG:5179)로 보고 변환하며, 결과가 한반도 밖이면 실패로 처리한다.
- `PATCH /v1/me/profile`에 `lat`,`lon`.
- 위치정보 요약DB 적재는 승인 뒤 별도 작업.

### 14.6 완료 기준
세 역할 가입과 승인 전 거래 403, 재설정 전체 흐름과 토큰 재사용·만료 거부, 계정 유무 비노출, OAuth는 공급자를 모의해 state 위조 거부·연결·신규 가입 검증, 이메일 중복 409. SQLite·PostgreSQL 통과.

## 15. v0.9 변경 (주문 전 매물 문의, 2026-11-05) — 13.4의 '주문 전 대화 안 만듦'을 대체
사용자 결정: 주문 전에는 매물별 문의만 허용한다.
- 문의 한 건 = (매물, 구매 업체) 쌍. 승인된 recycler만 먼저 시작하고(`POST /v1/listings/{id}/inquiries {body}` → 있으면 같은 건에 이어 씀), 판매 공장은 답만 한다. posted·bundle_wait 매물만 새로 시작(그 외 409).
- `GET /v1/inquiries`(내가 참여한 건, 구매 업체·공장 모두) → `[{id,listing_id,listing_name,other_name,last_message,unread,updated_at,reported}]` 최신순. `GET /v1/inquiries/{id}/messages`, `POST /v1/inquiries/{id}/messages {body}`(1~500자). 제3자 404. 읽음 처리 `POST /v1/inquiries/{id}/read`.
- **연락처 가림:** 저장 전에 서버가 전화번호, 계좌번호로 보이는 숫자열, 이메일을 `***`로 바꾸고 `masked:true`로 표시한다. 원문은 저장하지 않는다. 앱 밖 거래 방지가 목적.
- 신고: `POST /v1/inquiries/{id}/report {reason}` → 고객센터 티켓 생성, `reported:true`. 신고된 건도 기록은 지우지 않는다.
- 새 메시지는 상대에게 알림(12.6). 시도 제한: 회사당 1분 20건(넘으면 429).
- 주문이 생기면 그 매물·구매 업체의 문의 기록을 주문 대화로 잇는다. `GET /v1/orders/{id}/messages`가 문의 메시지를 앞에 붙여 시간순으로 주고 각 항목에 `from_inquiry:true`. 운반 업체에게는 문의 부분을 보이지 않는다.
- 완료 기준: 공장이 먼저 시작 불가, 제3자 404, 미승인 403, 연락처 가림(하이픈·공백 변형 포함)과 일반 숫자(예: 750kg, 380원) 비오탐, 주문 전환 후 이어짐, 운반 업체 비노출. SQLite·PostgreSQL 통과.

## 16. 구현 확정 사항 (13~15절, 2026-11-05) — 앞 절과 다르면 이 절이 우선
**13절 (판매자 앱)**
- 가입 `region`은 선택이다. 판매자 앱의 가입 화면에는 지역 칸이 없어서, 없으면 주소 글자에서 시·군 이름(예: 구미)으로 찾고 목록에 없으면 400. `GET /v1/regions`는 시·군청 소재지의 위경도를 소수 둘째 자리로 어림한 값이며 지오코더·카카오 값이 아니다(출처는 `features/_shared/regions.py` 주석).
- 증빙 `kind`는 `business_license`|`emitter_report`. 같은 종류를 다시 올리면 교체. 파일 확인: `GET /v1/documents/{id}`(올린 회사와 운영자만, 다른 회사 404, PDF는 첨부로 내려줌). 증빙·승인(`/me/documents`, `/me/approval`, `resubmit`)은 14절에 따라 factory·recycler·hauler 공통. 운영자가 승인(`verify`)하면 보완 요청 기록은 지워진다.
- 마대·판매 생성은 승인 전 403(`verified` 검사). 기존 `POST /v1/companies`의 factory 즉시 승인은 그대로.
- 공동판매: `status`는 저장값 `open|sold|cancelled`이고, 기한이 지난 `open`은 응답에서 `closed`로 보인다(연장·즉시 판매·취소 가능, 참여 불가). 목록 `GET /v1/pools`는 내가 만들지 않았고 참여하지 않은 모집 중(기한 안) pool을 만든 공장이 내 반경 안일 때만 준다(`members` 없음). 만들 때 `target_kg`는 내 물량보다 커야 한다. 참여 거부: 코드·등급 다름 400, 반경 밖 400, 이미 참여 409, 끝난 pool 409. `PATCH`·`extend`·`sell_now`는 만든 공장만(참여만 한 공장 403, 관계없는 공장 404). `cancel`은 참여한 공장이면 누구나 자기 참여만 뺀다. 공동판매 중인 판매의 단가는 `PATCH /listings/{id}`로 바꿀 수 없고(409), 판매를 내리면(`withdraw`) 참여도 빠진다. 응답에는 `grade`, `is_owner`가 더해졌고 다른 공장 단가는 `null`, 다만 `applied_price_krw_per_kg`(최저 단가)는 모두에게 보인다.
- 대화·사진·증빙·티켓 첨부: 당사자가 아니면 404. 수거 사진은 배정 업체(self면 구매 업체), 검사 사진은 구매 업체만(다른 당사자 403), 주문이 `dispatched` 이상일 때만 수거 사진, `arrived` 이상일 때만 검사 사진(아니면 409), 단계마다 10장. 티켓 첨부는 5개까지, `GET /v1/support/tickets/{id}/attachments/{aid}`로 확인.
- 재활용업체: recycler 소개 `pickup_method`·`terms`는 recycler가 `PATCH /v1/me/profile`로 쓴다. `recommended_recyclers`는 내 마대 폐기물 코드와 허가가 맞는 가까운 순 2곳(마대가 없으면 빈 목록).
- 빈 쿼리 값: `?q=&grade=&sort=distance`처럼 값이 빈 쿼리는 없는 것으로 처리한다(`listings`의 `q·grade·sort`, `market/prices?category=`, `pools?mine=`, `orders/{id}/photos?stage=`). 값이 있는데 틀리면 400.

**14절**
- 가입 `email`은 필수이고 전체에서 유일(소문자로 저장). 판매자 앱의 현재 가입 요청에는 `email`이 없어 14절대로 400이 난다(앱 쪽 수정 필요). `login_id`에 `@`가 있으면 `email`과 같아야 한다(남의 이메일을 아이디로 선점하는 것을 막음). 로그인은 아이디·이메일 모두 받고, 같은 계정을 아이디와 이메일로 번갈아 시도해도 한 계정으로 5회 제한.
- 승인 전 recycler는 주문 403, 승인 전 hauler는 콜 403(기존 규칙). 가입 시도 제한은 로그인 실패와 키를 따로 쓴다(`signup:{biz_no}` 5분 5회, `reset:{email}` 5분 5회).
- 재설정 메일은 응답을 보낸 뒤 백그라운드로 보낸다(응답 시간을 같게). 로그 모드 메일은 `MAIL_OUTBOX_DIR`(기본 `./mail_outbox`)에 0600 파일로 쓴다. `APP_ENV=production`에서 `MAIL_MODE`가 `log`이면 시작 거부. 재설정 확인 뒤 이미 발급된 로그인 토큰은 만료 전까지 유효하다(토큰 폐기는 이번 범위 밖).
- OAuth: `state`와 `signup_token`은 서명 대신 무작위 값의 해시를 DB(`oauth_tickets`)에 두고 한 번만 꺼낸다(state 10분, signup_token 15분). 앱으로 돌려보내는 주소는 `{PUBLIC_BASE_URL}/{buyer|carrier|seller}/#/oauth?access_token=…` 또는 `…?signup_token=…&email=…&name=…&role=…&provider=…`. `POST /signup/social`은 `email`을 직접 적으면 그 값, 없으면 공급자가 인증한 이메일을 쓰고(공급자 이메일이 이미 다른 회사 것이면 직접 적은 다른 이메일로 가입), 응답에 `access_token`·`company`가 더해진다. 소셜 가입 계정의 비밀번호는 아무도 모르는 무작위 값이고 이메일 재설정으로 정한다. 공급자 이메일은 인증된 것만 쓰며, 직접 적은 이메일은 인증하지 않는다(가입 시 이메일 확인 메일은 이번 범위 밖).
- 14.5: `coord_source`는 `region|juso|user|seed`(`POST /companies`는 user, 시드는 seed). 가입 `lat`·`lon`이 있으면 `user`. `POST /v1/geocode`는 로그인 없이도 쓰며 시도 제한(회사별 또는 접속 주소별 5분 30회; 프록시 뒤에서는 접속 주소가 프록시 주소일 수 있음). 행안부 좌표제공 API 호출(주소 검색으로 `admCd`·`rnMgtSn` 등을 얻은 뒤 좌표제공 호출, `entX/entY`를 UTM-K(EPSG:5179)로 보고 WGS84 변환)은 

**15절**
- 문의 목록의 `other_name`은 상대 회사 이름이다(주문 전 문의라 익명이 아님). 보낸 사람이 글을 쓰면 그때까지의 글을 읽은 것으로 본다. 주문 대화에 붙는 문의 글의 `id`는 문의 글 번호이므로 주문 글과 겹칠 수 있고 `from_inquiry`로 구분한다. 신고는 문의 하나에 대해 신고한 회사의 고객센터 티켓을 만든다. 연락처 가림의 판단 기준과 한계는 `features/inquiries/contact_mask.py` 주석. 시도 제한은 새 문의와 문의 글 모두 합쳐 회사당 1분 20건.

## 17. 독립 QA 반영 (2026-11-05) — 앞 절과 다르면 이 절이 우선
**돈**
- 주문에 `unit_price_krw_per_kg`(주문 시점 단가), `bag_snapshot`(주문 시점 마대 id)을 저장한다. 검사 정산과 운영자 중재(regrade 상한 포함)는 모두 주문 단가로 계산한다. 주문은 읽은 단가까지 조건에 넣은 조건부 UPDATE로 매물을 선점하므로, 그 사이 `PATCH /listings/{id}`로 단가가 바뀌었으면 409(단가가 바뀜). `GET /orders/{id}`에 `unit_price_krw_per_kg`.
- 반송(`returned`)도 운임이 지급되므로 `carrier/earnings`·`carrier/home`·`today`에 포함한다. `me/impact`·`frequent-sellers`는 반송을 계속 뺀다.
- 공동판매 목표 도달·`PATCH` 목표 검사는 Decimal 합. 참여 단가 하한: 시세(없으면 만든 공장 단가)의 `assumptions.pool_min_price_ratio`(0.7, 가정) 미만이면 400이고 문구에 하한이 있다. 하한은 참여할 때만 검사한다.
- 직접 수거 주문에서 `target=hauler` 평가는 상태와 상관없이 400(12.11).
- 반송 주문도 `bag_ids`·`bags`·`bag_count`·`target_material`을 `bag_snapshot`으로 준다(반송 뒤 마대의 등급·순도는 지워진 상태 그대로).

**보안·운영**
- `POST /v1/companies`: 운영자 토큰이 있을 때만 만든다. 그 밖의 공개 호출은 403이며, 옛 테스트가 쓰는 `LEGACY_COMPANY_CREATE=1`일 때만 열린다(운영 `APP_ENV`에서는 그 값과 상관없이 닫힘). 가입은 `POST /v1/signup`.
- `APP_ENV`는 앞뒤 공백·대소문자를 무시하고 `production`·`prod`를 운영으로 본다. 운영에서 다음이 하나라도 어긋나면 시작하지 않는다: `AUTH_ALLOW_COMPANY_HEADER=1`, `AUTO_APPROVE_SIGNUP=1`, `MAIL_MODE`(정규화 뒤)가 정확히 `smtp`가 아님, `PUBLIC_BASE_URL`이 `https://`가 아님, OAuth 키가 있는데 `OAUTH_REDIRECT_BASE`(없으면 `PUBLIC_BASE_URL`)가 `https://`가 아님.
- `/v1/*` 요청 본문은 8MB까지. `Content-Length`가 크거나 스트림을 읽다 넘으면 413.
- 로그인 제한은 (계정, IP) 5회와 IP 전체 50회(5분). 남이 다른 IP에서 내 계정을 잠그지 못한다. IP는 `request.client.host`이고, 프록시 뒤에서는 uvicorn의 `FORWARDED_ALLOW_IPS`로 신뢰할 프록시를 정해야 실제 접속자 주소가 된다. 가입은 사업자번호(숫자만) 5회와 IP 10회, 재설정은 이메일 5회와 IP 10회, OAuth 시작은 IP 30회(모두 5분). 만료된 제한 키는 키가 1000개를 넘을 때 정리한다.
- 비밀번호 재설정은 계정이 있든 없든 같은 쓰기(UPDATE·INSERT·DELETE 한 번씩)를 한다(없는 이메일은 쓸 수 없는 미끼 행을 남기고 이후 지움). 회사별 `token_version`을 로그인 토큰(`ver`)에 넣고 재설정이 성공하면 올려서 이전 토큰을 모두 무효로 한다.
- `login_id`에 `@`가 있으면 그 회사 이메일과 같아야 한다(모든 가입·생성 경로). 소셜 가입에서 공급자가 인증한 이메일은 본문이 바꿀 수 없다(다르면 400, 이미 쓰는 이메일이면 가입이 아니라 기존 계정으로 로그인). 새 가입 경로는 같은 사업자번호(숫자만 비교)가 이미 있으면 409(`POST /companies`는 그대로).
- OAuth: `start`가 `oauth_<state 앞 12자>` 쿠키(HttpOnly, SameSite=Lax, 10분, 운영에서 Secure)를 심고 콜백이 그 쿠키와 state에 묶인 값을 대조한다(다르거나 없으면 400, state는 소모). 카카오 `is_email_verified`가 `true`로 오지 않으면 이메일은 없는 것으로 본다.
- `bundle_wait` 매물은 소유 공장·그 매물 주문 당사자·운영자만 본다(`GET /listings/{id}`, 찜, 새 문의). 구매자 묶음과 목록은 `posted`만. `GET /listings/{id}`의 `bags[].qr`·`pass_id`는 소유 공장과 배정 업체에게만(그 외 `null`). `GET /bags/{id}/photo`는 그 공장·운영자·`posted` 매물의 마대·그 마대가 든 주문의 구매/배정 업체만, 그 외 404.
- 다른 회사까지의 `distance_km`(목록, 상세, `recyclers`, 묶음 평균, 콜)는 1km 단위로 반올림한다. 수락 전 `GET /calls`의 `pickup`·`dropoff`는 소수 둘째 자리(약 1km)로만 주고, 정밀 좌표는 배정된 업체의 `GET /orders/{id}`의 `call`에만 있다. `PATCH /me/profile`로 좌표를 바꾸는 것은 회사당 24시간에 3번(넘으면 429).
- 주문 메시지는 회사당 1분 20건, 고객센터 티켓은 회사당 1분 10건(넘으면 429). 티켓 첨부는 5개·합계 6MB까지(넘으면 400). `GET /listings`에 `limit`(기본 50, 최대 200, 그 이상은 200으로)·`offset`(기본 0). 빈 값은 기본값, 정수가 아니거나 `limit<1`·`offset<0`이면 400.
- 연락처 가림은 §15 판단 기준을 구분 문자(괄호·밑줄·슬래시·엔/엠대시·줄바꿈·탭·제로폭·ㆍ), 전각 문자, `(at)`·`[at]`·`at`/`dot` 이메일, 단위가 붙은 10자리 이상 숫자까지 넓혔다. 사업자번호 예외는 앞 세 자리가 전화 국번(01x~09x)이 아닌 3-2-5 모양만(`010-12-34567`은 가림). **주문 대화(`/orders/{id}/messages`)는 정책상 가리지 않는다**(수거 연락에 전화번호가 필요함). 문의 신규 시작은 `posted` 매물만(15절의 'bundle_wait도 가능'을 대체).
- 남의 주문의 `GET /orders/{id}`·`/handover`가 404가 아니라 403인 것은 의도된 3절 규칙이다(주문 번호는 순번이라 존재 여부는 이미 노출되고, 당사자 아님을 알려 주는 쪽이 앱이 오류를 구분하기 쉽다). 바꾸지 않는다.

## 18. QA 3팀 화면 시험 반영 (2026-11-05) — 앞 절과 다르면 이 절이 우선
- **통과증 여부:** `GET /listings/{id}`의 `bags[]`에 `pass_issued`(bool)를 더했다. `pass_id`·`qr`은 17절대로 소유 공장과 배정 업체에게만 있다.
- **운반업체 공개 범위(최소 공개, 지휘부 기본값):** 배정된 운반업체(`role=hauler`)가 받는 `GET /orders/{id}`, `GET /me/orders`(와 기사 홈의 `running`)에는 `goods_krw`, `held_krw`, `unit_price_krw_per_kg`가 없고, `settlement`는 `{hauler_krw, resolution?, note?, legal_note?}`만 있다(판매자 몫 `factory_krw`, 환불 `refund_krw`, `platform_krw`, `invoice` 등 없음). 운임(`freight_krw`, `freight_cap_krw`)은 그대로. 판매자·구매자 응답과 직접 수거 주문의 구매자(기사 역할을 겸함) 응답은 그대로다.
- **상태 전이 409 문구:** 사용자 문구에 영어 상태값을 넣지 않는다. 수락 경쟁은 `다른 기사가 먼저 수락한 콜입니다.`, 그 밖에는 `현재 '<한국어 상태>' 상태에서는 '<한국어 상태>'(으)로 바꿀 수 없습니다.`, 수거·검사·중재·스캔·사진은 `현재 '<상태>' 상태에서는 ~할 수 없습니다.`. 상태 이름은 `orders/state.py`의 `STATE_KO`.
- **가입 지역:** 지역을 못 찾으면 `시·군을 목록에서 선택하십시오.`(400). `POST /v1/geocode` 응답에 `region`(가입 지역 목록의 이름 또는 null)을 더했다. 좌표 변환이 성공했을 때만, 행안부 검색 결과의 시·도·시군구 이름과 입력 주소에서 목록의 시·군 이름과 맞는 것이 있을 때 채우고 없으면 null. 변환 실패·키 없음이면 `{lat:null, lon:null, source:null, region:null}`.
- **문구 통일:** 사용자에게 가는 `HTTPException` detail, 알림 본문(`주문 #3 도착. 검사를 진행하십시오.`처럼 조사 없는 형식), 재설정 메일(제목 `잔재미 비밀번호 재설정`), FAQ 제목, AI 조언 문장을 `~합니다/~하십시오` 형식으로 바꿨다. 못 찾은 대상은 `~를 찾을 수 없습니다.`, 영어 모델 이름은 내보내지 않는다. 명사형 값(`dispute_reason`의 `검사 불합격`·`무게 차이 N%`, `weight_warning`, `legal_note`)은 바꾸지 않았다. 테스트가 `소스의 HTTPException 문구가 ~함/~됨/~음으로 끝나지 않는지`를 검사한다.
- **재질 인식:** `harness.yaml`의 별칭에 `철`(고철·철스크랩·철판·쇳조각·iron·steel), `알루미늄`(알미늄·알루미늄캔·aluminum), `골판지`(폐골판지·박스·종이박스·corrugated)를 더했다. 시세 품목 표(`tools/calc.MATERIAL_PRICE_ITEM`: pp·pe·pet→압축, 철→철스크랩, 알루미늄→알루미늄캔, 골판지→폐골판지)를 판매 화면의 `market`(11.5)과 AI 조언의 시세 비교(pricing)가 함께 쓴다(예전에는 달라서 `시세 품목을 찾지 못해`라는 조언이 시세가 있는 매물에도 나왔다). `인식 못 한 재질: [입력값](확인 필요)`는 `인식하지 못한 재질이 있습니다. 재질 이름을 확인하십시오.`로, 문장 속 모르는 재질은 `기타 재질`(마스킹 값 `[입력값]`은 회사 이름 같은 다른 사용자 문자열의 LLM 가림에만 남음), 판매 상세 `composition`의 모르는 재질 키는 `기타`.
- **연락처 가림:** 전화번호 뒤에 공백으로 이어진 숫자(`010-1234-5678 750kg`의 `750`)는 지우지 않는다. 전화번호는 마지막 묶음 4자리에서 끝나는 지점까지만 가린다.
- **콜 거리:** `distance_km`는 출발지→도착지 직선(운행 거리, `km당 운임` 기준)이고 그대로 둔다. 가까운 순 정렬용으로 `pickup_distance_km`(기사 차고지→출발지, 1km 단위)를 더했다. 차고지는 기사 회사 좌표를 사용자가 정했거나 시드인 경우(`coord_source`가 `region`이 아님)에만 있고, 지역 중심값뿐이면 `null`(정렬은 `distance_km`로).
- **공동판매 참여 조회:** `GET /pools`(참여할 모집 목록)와 새 `GET /pools/{id}`(상세)가 모든 pool 응답에 `joined`(내가 참여), `mine`(내가 만들었거나 참여), `remaining_kg`, `min_join_price_krw_per_kg`(참여 단가 하한)를 준다. 참여 전 공장에게는 `members` 대신 `joinable_listings`(내 판매 중 코드·등급이 맞고 다른 공동판매에 안 든 것: `{id,total_kg,price_krw_per_kg}`)를 주며 다른 공장 이름·단가는 숨긴다. 상세는 만들었거나 참여한 pool은 `members`까지, 아니면 반경 안 모집 중인 것만(없으면 404).
- **관심 업체 목록:** 이미 있다: `GET /v1/me/favorite-recyclers`(13.3). 새 경로 없음.

## 19. 도로 경로와 안내 (2026-11-05)
지도의 직선 점선을 실제 도로의 최단경로로 바꾼다. 외부 길찾기 API를 부르지 않고 서버 안에서 계산한다.
- **경로:** `GET /v1/orders/{id}/route` → `{source, distance_km, points:[[lat,lon],…], steps:[{type,road,distance_m,point_index,lat,lon}], approximate}`. 출발은 판매 공장, 도착은 구매 업체 좌표이며 임의 좌표를 받는 경로는 없다. 예상 소요 시간은 속도 근거가 없어 넣지 않는다.
- **볼 수 있는 사람:** 그 주문 상세를 볼 수 있는 사람(판매·구매 업체, 배정된 기사, 운영자; 그 밖은 403, 없는 주문은 404)과, 수락 전 콜을 볼 수 있는 기사(승인된 기사 중 허가 코드가 맞는 `payment_held` 일반 주문). 수락 전 기사에게는 콜 좌표와 같은 정밀도(소수 둘째 자리)로 계산한 대략 경로를 주며 `approximate:true`. 수락된 뒤 다른 기사는 403.
- **`source`:** `road` = 도로 그래프에서 다익스트라로 구한 경로. `straight` = 직선(출발 또는 도착의 1km 안에 도로 노드가 없음, 그래프 범위 밖, 도로가 이어지지 않음, 그래프 파일을 못 읽음). 이때 `points`는 출발·도착 두 점, `steps`는 `depart`·`arrive` 둘이며 `reason`에 이유(한국어)가 있다. 화면은 `straight`를 도로 경로로 그리면 안 된다.
- **거리:** `distance_km`는 `points`를 따라간 길이(출발점→가장 가까운 도로 노드→도로→도착 쪽 도로 노드→도착점, 연결선 포함)이고 `steps[].distance_m`의 합과 같다(0.1m 단위 반올림). 거리 최단이지 시간 최단이 아니다. 콜 `distance_km`(출발→도착 직선)와 `km당 운임` 계산은 바꾸지 않았다.
- **`steps`:** `type` = `depart`·`left`·`right`·`slight_left`·`slight_right`·`uturn`·`straight`·`arrive`. `road` = OSM `name`(없으면 `ref`), 모르면 null이며 지어내지 않는다. `distance_m` = 이 단계 지점에서 다음 단계 지점까지, 마지막 `arrive`는 0. `point_index` = `points` 안 위치(점을 줄여도 맞게 다시 매긴다). 판정은 **교차 노드(이웃 도로 노드 3개 이상)** 에서만 한다: 앞뒤 20m 구간의 방위각 차이가 20° 미만이면 직진, 45° 미만이면 slight, 150° 초과이면 uturn, 그 사이는 left/right. 같은 이름의 도로를 직진하거나 약간 꺾이며 이어 가면 단계를 만들지 않고, 직진이어도 이름이 바뀌면 `straight` 단계를 만든다(이름 한쪽이 없으면 만들지 않음). 곡선 도로의 굽음은 교차 노드가 아니면 안내하지 않는다. 로터리는 노드마다 교차로로 보아 단계가 여러 개 생길 수 있다.
- **점 줄이기:** `points`가 400개를 넘으면 단계 지점을 남기고 허용 오차를 키워 가며 모양을 지켜 줄인다.
- **계산:** 표준 라이브러리 `heapq` 다익스트라(도착 노드가 확정되면 멈춤), 가중치 = 도로 간선 길이(m, 하버사인). 일방통행을 지킨다. 출발·도착은 격자 색인으로 가장 가까운 도로 노드에 붙인다(최대 1km). 그래프는 첫 요청에 한 번 읽어 메모리에 두고, 같은 (출발 노드, 도착 노드)는 256개까지 캐시한다.
- **도로 데이터:** OpenStreetMap 도로를 Overpass API로 한 번 받아 `backend/app/features/routing/data/gumi_roads.json.gz`로 저장했다(구미시 행정구역 relation 7816731 안, 만든 날짜 2026-11-04, OSM 데이터 기준 시각 2026-11-04T19:22:32Z, 파일 0.28MB, 노드 60,096개·도로 9,450개·이름 731개). 쓰는 `highway`: motorway·trunk·primary·secondary·tertiary·unclassified·residential·service·living_street과 각 `_link`. 제외: footway·cycleway·steps·path·pedestrian·track 등 차가 다니지 않는 길, `motor_vehicle=no`, `motorcar=no`, `access=private|no`, `area=yes`. `oneway`(yes·true·1·-1)와 roundabout·motorway의 기본 일방통행을 지킨다. 노드 500개 미만의 고립된 덩어리는 길찾기에 쓸 수 없어 버렸다. 다시 만들려면 `backend/.venv/bin/python backend/scripts/build_road_graph.py`(Overpass 접속 필요, 실패하면 멈춘다).
- **출처 표시 의무(ODbL 1.0):** 도로 데이터는 © OpenStreetMap contributors, Open Database License(ODbL) 1.0이다. 지도·경로를 보여 주는 화면에 "© OpenStreetMap contributors"를 표시해야 하고(링크: https://www.openstreetmap.org/copyright), 이 그래프 파일을 고쳐 다시 배포하면 같은 ODbL로 공개해야 한다. 파일 `meta`에 출처·라이선스·만든 날짜가 들어 있다.
- **한계:** OSM의 회전 제한(금지 회전)·신호·실제 통행 시간은 반영하지 않는다. 도로 이름이 없는 도로는 `road:null`이다. 구미시 행정구역 밖으로 나가는 길은 그래프에 없다(경로가 구미시 안으로만 이어진다). 최단 거리라서 지름길이 사유지·좁은 길일 수 있다.

## 20. 화면 재시험 반영 (2026-11-05)
- **주문 QR:** `GET /orders/{id}`의 `bags[].qr`은 배정 기사에 더해 그 판매의 판매 공장에게도 준다(자기 마대 상세에서 이미 보는 값). 구매자·다른 공장에는 주지 않는다(다른 공장은 주문 자체가 403).
- **내린 판매 복구:** 내린(`withdrawn`) 판매를 **판매 공장 본인이** 볼 때 `GET /listings/{id}`와 `GET /me/listings`의 그 항목에 `former_bags: [{id, target_material, weight_kg, grade, available}]`이 있고 `target_material`도 그 마대 재질로 채운다(`bags`·`bag_ids`는 마대가 풀렸으므로 빈 채). `available`은 그 마대가 지금 다른 판매에 안 들어 있고 등급이 있어 다시 올릴 수 있는지. 다시 올리기는 기존 `POST /listings`의 `bag_ids`. `withdraw`가 마대 이력(`Bag.history`, 기존 JSON 칸)에 `{event:"withdrawn", listing_id, at}`을 남기고 이를 읽어 복원하므로 **DB 구조 변경은 없다**. 이 변경 전에 내린 판매는 이력이 없어 `former_bags`가 빈 목록이다.
- **직접 수거 release:** `transport=self` 주문의 `POST /orders/{id}/release`는 409 `직접 수거 주문은 배차를 해제할 수 없습니다.`. 화면이 분기할 `transport`는 `POST /orders` 응답, `GET /orders/{id}`, `GET /me/orders`, 콜 항목의 주문 정보에 이미 있다. 수거 전 취소는 아래 항목.
- **중복 스캔:** `POST /orders/{id}/scan`이 이미 스캔한 마대면 응답에 `duplicate: true`를 더한다(`scanned`·`total`은 그대로). 처음 스캔하면 이 칸이 없다.
- **검사 사진:** 이미 있다(13.5): 구매 업체가 `POST /orders/{id}/photos {stage:"inspect", content_type, data_base64}`(도착 이후 상태에서만), 당사자가 `GET /orders/{id}/photos?stage=inspect`로 목록, `GET /orders/{id}/photos/{photo_id}`로 파일. 수거 사진은 `stage=pickup`(배정 업체).
- **직접 수거 정산:** `transport=self` 주문의 `settlement`에는 `hauler_krw` 줄이 없다(새로 정산하는 것은 만들지 않고, 예전에 저장된 값도 응답에서 뺀다). 취소 응답은 원래 기사 줄이 없다.
- **직접 수거 수거 전 취소:** `transport=self` 주문은 수거 전(`dispatched`)에 **주문한 구매 업체가** 기존 `POST /orders/{id}/cancel`로 취소할 수 있다. 이 예외는 상태 전이표를 넓히지 않고 `change_status`에서 `transport=self`이고 `dispatched → cancelled`일 때만 허용한다(일반 주문은 배차 뒤 취소 409 그대로). 환불은 일반 주문의 수거 전 취소와 같은 계산(보류액 전액, 응답 `{status:"cancelled", refund_krw}`, `settlement={refund_krw}`, Payment `refunded`)이고, 매물은 다시 `posted`, 마대는 매물에 묶인 채 남는다. 판매자·제3자·운영자·기사는 403. 수거 후(`picked_up` 이후)는 409 `현재 '수거 완료' 상태에서는 '취소'(으)로 바꿀 수 없습니다.`. 같은 요청이 여러 번(동시에도) 와도 조건부 UPDATE라 한 요청만 성공하고 나머지는 409이므로 환불·매물 복원·판매자 알림(`주문 취소`, 취소한 본인 제외)은 한 번만 일어난다.

## 21. v0.10 변경 (AI 화면 연결, 2026-11-05) — 앞 절과 다르면 이 절이 우선
사용자 결정: 사진으로는 무게 등을 알 수 없으므로 **등급을 사진으로 판별하지 않는다.** 등급은 입력한 품목·무게로 계산하고, 사진은 구매자에게 보여 주는 자료로만 쓴다. 화면 문구도 이에 맞춘다.

### 21.1 판매자 홈
"추천 재활용업체" 칸을 따로 두지 않는다. `recommended_recyclers` 앞 2곳을 "AI 제안" 목록에 합친다. 재활용업체 전체 보기는 홈 검색창으로 간다.

### 21.2 주문 법 체크리스트 `GET /v1/orders/{id}/checklist`
- 볼 수 있는 쪽: 판매 공장, 구매 업체, 운영자. 그 밖은 있는 주문이라도 404.
- LLM을 부르지 않는다(`run_flow("deal_check", ctx, llm=None)`). 같은 주문은 언제 봐도 같은 규칙 문장이 나온다.
- 응답: `{"items": [{"item": "recycler_permit"|"hauler_permit"|"handover_entry", "ok": true|false|null, "text": str, "laws": [{"ref": str, "label": str}]}], "legal_note": str}`. `ok`는 맞음·안 맞음·사람 확인 필요. 게이트에 막힌 항목은 빠진다.
- 화면: 구매자의 요청 완료 화면, 구매자·판매자의 주문 상세. 운송기사 앱에는 보이지 않는다.

### 21.3 AI 대화 `POST /v1/assistant/chat`
- 입력: `{"message": str}`. 앞뒤 공백을 뺀 1~300자. 아니면 422. 로그인 필요. 대화 기록은 보내지 않는다(질문 한 번에 답 한 번).
- 응답: `{"answer": str, "source": "llm"|"template"|"none", "topics": [str], "facts": [{"text": str, "level": str, "evidence": [{"kind": str, "ref": str, "label": str}]}], "legal_note": str|null, "run_id": str|null}`. `legal_note`는 `law` 주제일 때만.
  - `facts`: 게이트를 통과한 근거 항목. 코드가 데이터에서 만든 문장이며 LLM 문장은 들어가지 않는다.
  - `source=llm`: `answer`는 `facts`만 근거로 LLM이 쓰고 게이트를 통과한 문장.
  - `source=template`: LLM이 꺼졌거나 실패했거나 게이트에 걸렸거나 코드 답으로 충분한 경우. `answer`는 "데이터에서 확인한 내용입니다."
  - `source=none`: 근거 항목이 없음. LLM을 요약에 부르지 않고 `answer`는 "시세, 등급, 법 조문, 내 거래, 앱 사용 방법을 물어봐 주세요. 그 밖의 내용은 근거가 없어 답하지 않습니다."
- 주제(`topics`): `price`, `order`, `law`, `grade`, `howto`. 먼저 낱말로 찾고, 못 찾으면 LLM이 이 목록(+`none`) 안에서만 고른다(스키마 enum).
- 근거 항목
  - `price`: `prices.json` 최근값. 재질·품목을 말했으면 그 품목, 아니면 대표 3개(PP 압축, 철스크랩, 폐골판지). 기준일과 그 품목의 조사 기준(`basis`)을 문장에 쓴다. 품목마다 기준이 달라 "압축품" 같은 단서를 모든 품목에 붙이지 않는다.
  - `order`: **요청한 회사 자신의** 주문 건수·상태별 수·최근 3건. 상대 회사 이름은 넣지 않는다.
  - `law`: `law_articles.json`에서 낱말이 많이 맞는 조문 최대 3개. 근거 kind는 `law`.
  - `grade`: `harness.yaml` 등급 기준(팀 가정이라고 쓴다)과 "사진은 등급 계산에 쓰지 않는다".
  - `howto`: 역할별 앱 사용 순서(실제 화면과 맞을 것).
- 안전
  - 대화 LLM 문장 중 글자쌍 절반 이상이 근거 항목에 없는 문장, 사진과 등급을 잇는 문장은 뺀다(지어낸 문장·질문 베끼기 차단. 같은 낱말로 뜻만 뒤집은 문장까지 잡지는 못한다). 남는 문장이 없으면 `template`.
  - 품목을 콕 집어 물었는데 시세표에 없으면(`구리 시세`) 대표 시세로 바꿔 답하지 않고 찾지 못했다고 답한다.
  - 답을 쓰는 LLM은 질문에서 찾은 주제가 `order`·`howto`뿐일 때만 부른다(근거 항목이 안 나온 주제도 센다). `price`·`grade`·`law`가 하나라도 있으면 코드 문장만 보여 준다. 시험에서 로컬 모델이 "지정폐기물이 아닌 … (PVC 제외)"를 "PVC는 지정폐기물"로, 무허가 영업 벌칙을 맡긴 공장 처벌로 뒤집어 썼고 숫자 게이트로는 잡히지 않았다(2026-11-05).
  - LLM 답은 요약과 같은 게이트를 통과해야 한다(근거에 없는 숫자, 금지 표현, 개인정보, 등급·시세 판단). 재요청 1회 후에도 걸리면 `template`.
  - 사용법(`howto`)은 앱 동작 낱말이 함께 있을 때만 낱말로 고른다. "어떻게" 하나로 고르지 않는다. 버리기·소각·재활용·보관·신고 질문은 `law`.
  - 질문은 자료로만 넘기고, LLM에 보내기 전에 전화번호·이메일·주민번호 모양을 가린다. 질문 원문은 `agent_runs`와 로그에 저장하지 않는다.
  - 대화에는 쓰기 기능이 없다. 다른 회사 자료는 근거 항목에 들어가지 않는다.
- 공개 배포 전 필수(10.5에 추가): 대화 요청 횟수 제한.

### 21.4 하네스
`harness.yaml`에 에이전트 `assistant`(지휘 팀, 번호 8)와 흐름 `assistant_chat: [assistant]`를 더한다. `vision`의 표시 이름은 "품목 구성 정리"로 바꾼다(id는 그대로).

### 21.5 로컬 실행
`deploy/run_local.sh`의 기본 `LLM_PROVIDER`는 `ollama`이고, `harness.yaml`의 주소(WSL에서 Windows의 Ollama)를 쓴다. `LLM_PROVIDER`·`OLLAMA_URL` 환경변수로 덮어쓸 수 있다. Ollama가 꺼져 있어도 앱은 규칙 문장으로 계속 동작한다.

### 21.6 완료 기준
테스트 통과. Ollama를 켠 실제 서버에서 세 앱을 브라우저로 열어 AI 대화(시세·법·내 거래·범위 밖 질문), 판매자 홈 AI 제안, 구매자 요청 완료·주문 상세 체크리스트를 눈으로 확인. Ollama를 끈 상태에서도 같은 화면이 깨지지 않음.

## 22. v0.11 변경 (알림 화면, 명사형 문구, 쉬운 법 답변, 2026-11-05) — 앞 절과 다르면 이 절이 우선
### 22.1 알림 화면
사용자 참고 화면 구조를 따른다. 색은 기존 브랜드 초록을 쓴다. 날짜 묶음 제목(오늘, 어제, 이번 주, 이전, KST 기준) 아래 카드 목록. 카드: 왼쪽 둥근 아이콘, 굵은 제목, 본문 최대 2줄, 오른쪽 위 시간(방금, N분 전, N시간 전, 어제, 요일, MM.DD). 읽지 않은 카드는 왼쪽 세로 띠와 옅은 브랜드 바탕으로 구분한다. "새 알림" 태그와 `›`는 없앤다. 서버 제목은 항상 보인다. 상단의 읽지 않은 수와 "모두 읽음", 눌렀을 때 읽음 처리 후 주문으로 이동은 그대로 둔다.

### 22.2 문구
화면 문구는 구어체 대신 명사형으로 끝낸다. 서버 알림 본문도 명사형으로 끝내고, 제목과 같은 말만 반복하지 않게 품목과 무게를 넣는다(예: 제목 `정산 완료`, 본문 `주문 #3 폐종이류 600 kg 정산`). 판매자 홈 문구: 제목 `부산물·마대 등록 후 바로 판매`, 설명 `품목·무게 입력 시 AI 통과증 등급 확인`.

### 22.3 쉬운 법 답변 (21.3의 `law` 항목을 대체)
`data/law_plain.json`: 조문 id마다 `headline`(한 줄 답), `body`(쉬운 설명), `keywords`(질문 찾기). 사람이 쓰고 원문과 대조한 고정 문구이고 LLM이 만들지 않는다. 조문 원문에 없는 내용은 넣지 않는다. 숫자는 원문 숫자만 쓴다.
- `POST /assistant/chat`의 법 근거 항목: `{"headline": str, "text": 쉬운 설명, "detail": 조문 원문, "level", "evidence"}`. 다른 항목에는 `headline`, `detail`이 없다.
- 조문은 최대 3개, 1등 점수의 절반 미만은 뺀다.
- 화면: `headline` 굵게 → `text` → 접힌 "조문 보기" 안에 `detail`. 표시 이름은 `법 쉬운 설명`.

### 22.4 주문 법 체크리스트
`GET /orders/{id}/checklist`의 항목에 `detail`(기존 규칙 문장)을 더하고, `text`는 쉬운 명사형 문구로 바꾼다. 화면: 상태 → `text` → 접힌 "조문 보기" 안에 `detail`과 법 근거 이름.

## 23. v0.12 변경 (문구 규칙, 2026-11-05) — 앞 절과 다르면 이 절이 우선
사용자 결정: 중간점은 AI 티로 보이므로 앱 전체에서 뺀다. 구어체도 뺀다.
### 23.1 문구 규칙 (화면에 보이는 모든 글자. 서버 오류 문구, 알림, 에이전트 문장, 데이터 표시, 시드 포함)
- **중간점 금지:** `·`, `･`, `・`, `‧`을 쓰지 않는다. 나열은 쉼표(`수집, 운반, 재활용`), 정보 구분도 쉼표(`경북 구미, 300 kg, 4 km`). 문장을 바꾸는 편이 자연스러우면 바꾼다(`부산물·마대 등록 후` → `부산물, 마대 등록 후`). 빈칸 표시 등에 쓴 `—`도 새로 늘리지 않는다.
- **구어체 금지:** `~습니다`, `~합니다`, `~입니다`, `~됩니다`, `~세요`, `~해요`, `~주세요`, `~십시오`, `~까요`로 끝내지 않는다. 명사형으로 끝낸다.
  - `도착한 알림이 없습니다.` → `도착한 알림 없음`
  - `다시 시도하십시오.` → `다시 시도 필요`
  - `필요한 업무를 선택하세요` → `필요한 업무 선택`
  - `무엇이든 물어보세요…` → `질문 입력`
  - `주문이 접수되었습니다.` → `주문 접수 완료`
  - `권한이 없습니다.` → `권한 없음`
  - 명사형 문장 끝의 마침표는 뺀다. 한 문구에 문장이 둘이면 쉼표나 줄바꿈으로 나눈다.
- **바꾸지 않는 것:** 코드 식별자, 주석, 정규식, 테스트 밖의 내부 키, `harness/policies`의 금지 표현 목록, 사용자가 입력한 값.
- **데이터 파일:** 원본(`data/*.json`)은 고치지 않는다. 읽는 자리(`tools/data.load_json`)에서 표시용 값의 중간점을 쉼표로 바꾼다. `law_plain.json`은 사람이 쓰는 문구라 파일 자체를 고친다.
### 23.2 AI 문장
대화 LLM 시스템 문장에 명사형 끝맺음과 중간점 금지를 넣는다. 그래도 남을 수 있으니 코드가 후처리한다: 중간점은 쉼표로, 확실한 끝맺음만 명사형으로(`입니다.` 삭제, `있습니다`→`있음`, `없습니다`→`없음`, `합니다`→제거, `됩니다`→`됨`). 후처리 후 뜻이 이상해지는 문장은 근거 항목 문장으로 대체한다.
### 23.3 가격 표시
가격과 단위는 줄이 나뉘지 않는 한 덩어리로 보여 준다(`340원/kg`).
### 23.4 구매자 홈 칩
판매자 칩과 같은 표기로 맞춘다. 값이 있으면 `N건`, 0이면 `진행 없음`(진행 거래), `없음`(장바구니, 확인할 일).
### 23.5 재발 방지
프론트와 서버에 각각 테스트를 둔다. 화면용 문자열에 중간점이나 구어체 끝맺음이 있으면 실패한다.

## 24. v0.13 변경 (매물 목록과 등록 물량 화면, 2026-11-05)
시안: `docs/design-previews/통과증-매물-A안-목록형-v2.png`, `docs/design-previews/시세-물량-시안-v2.png`(아래 "등록 물량" 부분만). 시안의 중간점은 23절에 따라 쉼표로 쓴다.
### 24.1 통과증 매물 (구매자 홈, 탐색, 추천 매물, 구매 요청)
흰 묶음 안의 줄 목록. 왼쪽 재질 그림(`mat_pp`, `mat_pe`, `mat_iron`, `mat_aluminum`), 이름과 `B등급` 초록 가로 배지, `경북 구미, 4 km`, `300 kg`, 오른쪽 위 큰 `340원/kg`, 그 아래 초록 테두리 `+ 담기`. 줄 사이는 구분선. 시안에 없는 재질은 기본 그림을 쓴다. 등급 표시를 지어내지 않고 서버 값만 쓴다.
### 24.2 판매자 홈 등록 물량
위쪽 시세 칸은 그대로 두고 제목만 `현재 시세`로 바꾼다. 그 아래 제목 `등록 물량`, 오른쪽 `N개 품목`. 줄 목록: 왼쪽 둥근 그림(`vol_plastic`, `vol_metal`, `vol_paper`), 제목(폐기물 이름, 재질), 괄호 설명은 둘째 줄(`폐염화비닐수지류 제외`), `1,500 kg, 판매자 3곳`, 오른쪽 큰 `340원/kg`(서버 `min_price`), 그 아래 `시세 377.6원/kg`(`market`이 있을 때만). 물량이 없으면 `등록 물량 없음`.

## 25. v0.14 변경 (마이 화면, 2026-11-05)
사용자 참고 화면 구조로 세 앱의 마이를 함께 바꾼다(`shared/screens/My.tsx` 하나).
- 화면 이름은 `내 정보`(사용자 결정). 상단: 왼쪽 `내 정보`, 오른쪽 글자 버튼 `로그아웃`.
- 프로필: 가운데 정렬. 둥근 회사 아이콘, 그 아래에 걸치는 작은 `수정` 버튼(회사 정보로 이동), 회사 이름, `사업자번호 000-00-00000`, 옅은 초록 알약 `판매자 인증 완료`(또는 `인증 대기`).
- 성과와 차량 정보는 없애지 않는다. 큰 초록 카드 대신 흰 카드로 작게 둔다.
- 메뉴: 제목 `메뉴`, 흰 묶음 안의 줄 목록. 둥근 옅은 바탕 아이콘, 글자, 오른쪽 `›`, 줄 사이 구분선. 메뉴 항목과 이동은 앱별로 그대로.
- 금색 알약은 쓰지 않는다. 사람 사진 대신 회사 아이콘을 쓴다(회사 사진 기능 없음).

## 26. v0.15 변경 (영수증 주문 확인 QR, 2026-11-05)
사용자 결정: 영수증의 줄무늬 그림을 실제 QR(`JJM-000004`, 주문 번호 6자리)로 바꾼다. 운송기사 앱의 마대 QR 검수에서 이 QR을 읽으면 맞는 주문인지 확인한다. 다른 주문이면 오류로 막는다. 마대별 QR 검수는 그대로 필수이고, 주문 QR로 마대를 검수 처리하지 않는다. 확인 결과는 화면에만 표시하고 서버에 저장하지 않으며 수거 제출 조건이 아니다. 판매 공장은 수거 예정(`dispatched`) 주문의 수거 화면에서도 이 QR을 보여 줄 수 있다.

## 27. v0.16 변경 (마대 등록 말로 입력과 재질 추천, 2026-11-07)
사용자 결정(교수 피드백 "서비스 쪽으로 치우쳐 AI Agent가 잘 안 보임" 반영): 마대 등록에 음성 입력(STT)을 넣고, 에이전트가 칸을 채우는 과정을 화면에 보인다. 음성 인식은 서버의 로컬 Whisper(외부 전송 없음). 범위는 등록 화면부터.

### 27.1 하네스
분류, 등급 팀에 에이전트 둘을 더한다. `intake`(9, 말 입력 정리, LLM 씀), `material`(10, 재질 추천, LLM 안 씀). 흐름 `bag_intake: [intake, material]`, `material_suggest: [material]`. 두 흐름은 요약 LLM을 부르지 않는다(`skip_llm_summary`). 팀 가정 `code_materials`(품목 → 재질), `material_codes`(재질 → 품목), `waste_keywords`(말 → 품목, 위에서부터 우선)를 `harness.yaml`에 둔다. 에이전트 카드는 `harness/agents/sorting/intake.md`, `material.md`.

### 27.2 `GET /v1/bags/intake/status`
판매 공장만. `{"stt": bool}`. 음성 인식을 쓸 수 있으면 모델을 뒤에서 미리 올린다(첫 녹음 지연 방지). 화면은 `false`면 말로 입력 버튼을 숨긴다.

### 27.3 `POST /v1/bags/intake`
- 판매 공장만. 입력은 `{"audio_base64", "content_type"}`(audio/webm, ogg, mp4, wav, mpeg, 2MB, 30초 이하) 또는 `{"text"}`(1~300자) 중 하나. 둘 다 있거나 둘 다 없으면 400.
- 음성 인식 불가 503, 읽을 수 없는 음성, 30초 초과, 인식된 말 없음은 400(문구 그대로 화면에).
- 응답: `{"transcript": str, "fields": {waste_code?, material?, weight_kg?, available_from?, pickup_note?, note?}, "sources": {칸: "rule"|"llm"}, "material": {"candidates": [{"material", "reasons": [str]}], "auto": str|null}, "steps": [{"id", "name", "ok", "used_llm", "lines": [str]}], "run_id"}`.
- `steps`는 녹음이면 `stt`(음성 인식) 다음에 에이전트 순서대로. `lines`는 게이트를 통과한 주장만.
- 마대를 만들지 않는다. 사람이 칸을 확인하고 기존 `POST /v1/bags`로 제출한다(자동 제출 없음).
- 음성과 말한 글 원문은 저장하지 않는다(`agent_runs`에는 칸 값과 주장만).

### 27.4 말 입력 정리 규칙 (`intake`)
- 규칙이 먼저: 재질 별칭(긴 말부터, `피이티`는 PET), 무게(kg, 킬로, 키로, 톤, 둘 이상이면 비움), 품목(`waste_keywords` → 재질의 품목), 날짜(오늘, 내일, 모레, 이번 주, 다음 주 요일, M월 D일, 오늘부터 90일 안).
- 품목에 맞지 않는 재질(합성수지에 섞인 박스 등)은 주 재질로 쓰지 않고 "다른 재질 언급"으로 알린다.
- LLM은 빈 칸만. 받은 값의 검산은 에이전트 카드 `intake.md`와 같다(아는 재질, 글에 있는 숫자, 이름 낱말이 글에 있는 품목, 글 그대로인 수거 안내와 메모). 통과하지 못한 값 수와 개인정보 제외를 주장으로 알린다.
- 잘못 들린 낱말 고치기(2026-11-08 사용자 결정): 음성 인식에 현장 낱말 목록(`stt.HINT`: 지게차, 마대, 창고, 섞임 등)을 미리 준다. 수거 안내와 메모만 LLM이 잘못 들린 낱말을 고쳐 채울 수 있다. 낱말마다 들은 말과 자모로 비교해 소리가 거의 같거나(0.8 이상) 현장 낱말(`FIX_WORDS`, 0.6 이상)일 때만 받는다. 숫자와 숫자 음절(일, 이, 두, 세 등)은 고치지 않는다. 정문/후문, 있음/없음, 앞/뒤처럼 뜻이 뒤집히는 낱말은 통과하지 못한다. 고쳐 채우면 `… 잘못 들린 낱말을 고쳐 채움, 들은 말과 비교 확인 필요` 주장을 보인다. 무게, 품목, 재질, 날짜는 지금처럼 엄격하게 둔다.

### 27.5 `GET /v1/bags/material-suggest?waste_code=`
판매 공장만. 알 수 없는 코드 422. 응답 `{"candidates", "auto", "steps", "run_id"}`. 근거: 내 지난 등록 횟수, 장터 등록 물량(`market_volumes`), 품목에 재질이 하나뿐인지. 근거가 있을 때만 `auto`. 사람이 쓴 재질은 덮지 않는다. 사진으로 재질을 맞히지 않는다.

### 27.6 화면 (판매자 마대 등록)
- 진행 단계 아래 `말로 입력` 버튼(누르면 녹음, 다시 누르면 끝, 30초면 자동 끝)과 예시 문장.
- 새로 들어온 등록 화면(작성 중 값 없음)은 음성 인식이 준비되면 바로 듣기 시작한다(2026-11-08 사용자 결정, 버튼을 한 번 더 누르지 않음). 말이 끝나고 1.5초 조용하면 자동으로 끝내고 에이전트가 칸을 채운다. 듣는 중에는 `직접 입력`으로 녹음을 버리고 손으로 쓴다. 내용 확인에서 돌아온 화면은 자동으로 듣지 않는다. 자동 제출은 없음.
- 결과는 `AI 작업` 카드: `들은 말`, 에이전트 단계(이름, LLM을 썼으면 `AI` 표시, 주장 문장), 아래 `AI 입력 칸은 확인 후 제출, 자동 제출 없음`.
- AI가 채운 칸 라벨에 `AI 입력` 표시. 사람이 고치면 표시를 뗀다.
- 품목을 직접 고르면 재질 추천을 부르고, 주 재질 아래 후보 칩과 `재질 추천 근거: …`.
- 사진은 판매자_hy 병합 뒤 판매 등록 화면의 여러 장 사진 칸(최대 장수, 촬영과 앨범)과 판매 등록서 사진 띠를 따른다.
- 폰 미리보기(`/`)의 판매자 iframe은 `allow="microphone"`.

### 27.7 설치
`pip install -e '.[stt]'`(faster-whisper). 기본 모델 `small`, CPU(int8). `STT_MODEL`, `STT_DEVICE` 환경변수로 바꿀 수 있다. 설치하지 않으면 버튼만 숨겨지고 나머지 등록은 그대로 동작한다.

## 28. v0.17 변경 (운송기사 역할 없앰, 판매자 운송, 2026-11-13) — 앞 절과 다르면 이 절이 우선
사용자 결정: 판매자_hy 병합으로 운송 방법(회사 차량, 화물차 따로 구하기)과 운임 판매자 부담이 판매 등록에 들어왔으므로 운송기사 역할을 아예 뺀다. 수거와 도착 단계는 판매자가 진행한다.

### 28.1 없앤 것
- 역할 `hauler`: 가입(`/v1/signup`, 소셜 가입), 회사 만들기에서 받지 않는다(400). 예전 운송기사 계정은 로그인과 모든 로그인 필요 API가 403 "운송기사 계정은 더 이상 쓸 수 없음". 체험 로그인은 `seller`, `buyer`만.
- API: `/v1/calls*`(콜 목록, 수락, 저장), `/v1/carrier/*`(첫 화면, 상태, 수입), `/v1/orders/{id}/scan`(QR 검수), `/v1/orders/{id}/release`(배차 해제), `/v1/orders/{id}/route`(도로 경로)와 도로 그래프.
- 주문 입력의 `freight_cap_krw`, `freight_cap_krw_each`, `freight_payer`(보내도 무시). 가입과 프로필의 차량 칸(`vehicle_no`, `vehicle_type`, `capacity_ton`), 회사 응답의 `online`. 별점 대상 `hauler`.
- 화면: 운송기사 앱(`/carrier/`), 폰 미리보기의 세 번째 폰, 내비와 경로 지도, QR 스캐너, 영수증의 주문 QR, 운송 평가, 배차 해제 버튼.

### 28.2 주문 흐름
- `transport`는 `seller`(기본, 판매자 운송) 또는 `self`(구매 업체 직접 수거). 예전 값 `matched`는 끝난 주문 기록에만 남는다.
- 주문하면 `payment_held` 다음 같은 요청에서 바로 `dispatched`. 운반 회사(`hauler_id`)는 판매자 운송이면 판매 공장, 직접 수거면 구매 업체. 운임 0원, `freight_cap_krw` 0, 보류액은 물건값 × 1.05(세금계산서면 0).
- 출고(`/pickup`, 물품별 무게)와 인계서 운반자 칸은 배정된 운반 회사만. 판매자 앱 `출고, 운송` 화면에서 한다. 입고지 도착은 물건을 받은 구매 업체가 입고 검사(`/inspect`)와 함께 한 번에 기록한다(운송 중에서 바로 검사, 이력에는 도착 단계가 그대로 남음). 판매자 도착 버튼과 `/arrive`는 없앴다.
- 구매자는 출고 전(`payment_held`, `dispatched`)에 취소할 수 있다. 전이표: `dispatched → picked_up | cancelled`.
- 정산: `{factory_krw, platform_krw: 0, refund_krw, [invoice]}`. 기사 정산 줄 없음. 환불 = 보류액 − 판매 공장 몫.
- 주문 응답의 `freight_payer`는 판매자 운송이면 `seller`. `scanned_bag_ids`, `scan_missing`, `call`은 없다.
- 상태 이름: 결제 보류, 출고 준비, 운송 중, 입고지 도착. 알림은 새 주문, 출고 완료(출고 준비는 주문과 같은 요청이라, 도착은 검사와 같은 요청이라 따로 알리지 않음).
- 주문 법 체크리스트 2번 항목 `seller_transport`: 판매자가 직접 운송, 인계서 운반자 칸도 판매자가 입력(법 제18조 제3항).

### 28.3 이미 있는 DB
`backend/scripts/migrate_no_carrier.py`: 끝나지 않은 `matched` 주문을 판매자 운송으로 옮긴다(운반 회사 = 판매 공장, 운임 0, `payment_held`는 `dispatched`로). 다시 돌려도 바뀌지 않는다.

## 29. v0.18 변경 (구매 희망 말로 입력과 희망가 추천, 2026-11-13)
사용자 결정: 판매 등록(27절)처럼 구매 희망 올리기에도 말로 입력을 넣어 칸 채우기를 자동화한다.

### 29.1 하네스
거래 팀에 에이전트 둘을 더한다. `want_intake`(11, 구매 희망 정리, LLM 씀)와 `want_price`(12, 희망가 추천, LLM 안 씀). 흐름 `want_intake: [want_intake, want_price]`, `want_price: [want_price]`. 재질 별칭에 `구리`(구리선, 동 스크랩, copper)와 `material_codes.구리 = 51-29-02`를 더한다.

### 29.2 경로 (구매 업체만)
- `GET /v1/buy-requests/intake/status` → `{"stt": bool}`. 가능하면 모델을 미리 올린다.
- `POST /v1/buy-requests/intake`: 입력은 27.3과 같다(녹음 또는 글). 응답 `{transcript, fields, sources, price: {auto, market, listings}, steps, run_id}`. 구매 희망은 올리지 않는다(사람이 확인 후 `POST /v1/buy-requests`).
- `GET /v1/buy-requests/price-suggest?material=` → `{auto, market, listings, steps, run_id}`. 화면에서 대표 품목을 고르면 부른다.
- 음성 인식과 'AI 작업' 단계 조각은 `app/features/_shared/voice.py`를 판매 등록과 함께 쓴다.

### 29.3 구매 희망 정리 규칙 (`want_intake`)
- `fields`: material, waste_code, item, qty_kg, price_min_krw_per_kg, price_max_krw_per_kg, price_unit(kg, ton), repeat(once, monthly), negotiable, need_by, note. 말하지 않은 칸은 넣지 않는다.
- 가격: 범위 말(300에서 350원, 300~350원, 30만에서 35만 원), 아니면 '원' 붙은 값 한두 개(하나면 하한과 상한이 같음). '톤당', 't에'가 있으면 톤 가격으로 보고 원/kg로 바꾼다. 셋 이상이면 비운다. 원/kg 10만 원 넘으면 버린다.
- 수량: 판매 등록과 같은 무게 규칙, 단 '톤당', '1kg에' 같은 가격 단위 말은 수량에서 뺀다. 둘 이상이면 비운다. 최대 1,000t.
- 구매 주기: 매달, 매월, 정기 → monthly. 한 번만 → once. 협상: 협상 가능, 네고 가능 → true. 협상 불가, 가격 고정 → false. 희망 시기는 1년 안.
- LLM은 빈 칸만. 재질은 아는 재질이면서 글에 있어야, 수량과 가격 숫자는 글에 그대로(또는 만, 천 단위로) 있어야, 품목 설명과 조건은 글에 있는 말이어야 하며 수량, 가격, 날짜, 개인정보가 없어야 한다. 아니면 버리고 버린 수를 주장으로 알린다.

### 29.4 희망가 추천 (`want_price`)
재질의 환경공단 시세(지역별 최저, 최고, 판매 화면 추천가와 같은 반올림)와 게시 중인 같은 재질 매물 최저 단가를 근거로 낸다. 말로 가격을 정했으면 `auto`는 null이고 시세 범위의 아래, 안, 위만 알린다. 시세가 없는 재질(구리 등)은 `auto` null.

### 29.5 화면
- 구매 희망 올리기 맨 위에 '말로 입력'과 'AI 작업' 카드. 판매 등록과 같이 '말로 입력'을 누를 때만 듣는다(자동으로 듣지 않음).
- AI가 채운 칸에 'AI 입력' 표시, 사람이 고치면 뗀다. 가격 아래에 '희망가 추천 근거'. 대표 품목을 고르면 희망가 추천이 빈 가격 칸(또는 AI가 채운 칸)만 채운다.
- 녹음과 상태 확인은 공용 훅 `src/shared/useVoiceIntake.ts`, 버튼 `src/shared/ui/VoiceInput.tsx`, 카드 `src/shared/ui/AgentSteps.tsx`를 판매 등록과 함께 쓴다.

## 30. v0.19 변경 (판매 가격 자동 입력, 2026-11-13)
사용자 결정: 판매 가격은 시세에 맞춰 자동으로 채운다.
- 말 입력 정리(`intake`)가 판매 가격을 읽는다. '원'이 붙은 한 값(kg당 350원, 1kg에 400원, 톤당 35만 원은 원/kg로 바꿈)이면 `fields.price_krw_per_kg`. 범위나 여러 값이면 비우고 "시세 기준으로 채움"을 알린다. kg당, 1kg에 같은 가격 단위 말은 무게로 세지 않는다. 가격 말 규칙은 구매 희망(29.3)과 같은 함수를 쓴다.
- 판매 등록 화면: 주 재질이 정해지면(직접 고르거나 말로) 가격 칸이 비었거나 시세로 채운 값일 때 `/market/suggest`의 전국 최근 시세(원 단위 반올림)로 채우고 'AI 입력'과 근거 문장을 보인다. 말한 가격이 있으면 그 값이 먼저이고, 사람이 쓰거나 낮게, 시세, 높게 버튼으로 고른 가격은 덮지 않는다. 시세가 없는 재질로 바뀌면 시세로 채웠던 가격만 비운다.

## 31. v0.20 변경 (사용 흐름 다듬기, 2026-11-13)
- 구매자 매물 목록(홈 '판매 중인 원료', 매물 찾기, 찜한 매물)은 최신 순이 기본. `/v1/buyer/home`의 `listings`도 최신 순.
- AI 제안 줄은 어디를 눌러도 실행(닫기 ×는 제외). 시세 상승 제안은 그 품목과 주 재질을 고른 채 판매 등록을 연다(`register?priceItem=`). 쓰던 판매 등록 내용이 있으면 그대로 둔다.
- 판매자 홈 AI 제안 맨 위에 '출고할 거래'(출고 준비 주문)를 띄워 출고 화면으로 바로 보낸다.
- 판매 상세와 거래 상세 아래에 판매자가 지금 할 일 버튼: 출고 준비 → 출고 처리, 운송 중 → 없음(구매자 도착 확인과 검사 대기), 도착 뒤 인계서 번호가 없으면 → 인계서 입력, 정산 뒤 → 정산 상세. 두 화면 모두 '홈으로' 버튼(판매 내리기 왼쪽, 홈으로 오른쪽).

## 32. v0.21 변경 (인계서 쉽게 쓰기, 2026-11-13)
사용자 확인: 판매자가 대개 자기 차로 운송한다.
- 출고 화면에 '운송 차량 번호'(필수). `POST /v1/orders/{id}/pickup`에 `vehicle_no`를 주면 출고와 함께 인계서 운반자 칸, 판매자 운송이면 배출자 칸도 서버가 쓴다. 응답 형식은 그대로 `{status}`. 주지 않으면 예전처럼 인계서 화면에서 쓴다.
- 운반자가 쓴 차량 번호는 회사(`companies.vehicle_no`, 예전 운송기사용 칸 재사용)에 기억한다. `GET /v1/orders/{id}/handover`에 `vehicle_hint`(운반자 본인에게만, 아니면 null)를 더해 다음 출고와 인계서 화면에서 미리 채운다.
- 인계서 화면: 위 카드에 '지금 할 일' 또는 '기다리는 중'과 네 단계(배출자, 운반자, 처리자, 올바로 번호)와 담당. 내 칸을 먼저 보이고, 내 차례가 아닌 칸은 입력칸 대신 이유(예: 구매자 입고 검사 확정 뒤 작성)를 보인다. 처리 방법은 재활용 (재생원료 생산), 파쇄 후 재활용, 선별 후 재활용, 직접 입력 중 고른다. 아래에 '홈으로'.

## 33. v0.22 변경 (구매 희망과 판매 매물 맞추기, 2026-11-13)
사용자 요청: 구매 희망을 말하거나 올리면 판매자가 올린 매물과 맞춰야 한다.
- 에이전트 ⑬ `want_match`(판매 매물 맞추기, 거래 팀, LLM 없음). 구매 희망의 재질, 수량, 상한가를 게시 중인 같은 재질 매물과 비교해 상한가 안, 수량 충분, 가까운 순, 싼 순으로 5건까지 낸다. 주장: 같은 재질 판매 중 건수, 가격과 수량이 모두 맞는 건수, 가장 맞는 매물.
- 흐름: `want_intake`는 `[want_intake, want_price, want_match]`, 새 흐름 `want_match: [want_match]`.
- `POST /v1/buy-requests/intake` 응답에 `match: {count, fit_all, matches: [{listing, price_fit, qty_fit, reasons}]}`. `GET /v1/buy-requests/match?material=&qty_kg=&price_max=`(구매 업체만)는 같은 모양에 `steps`, `run_id`.
- 에이전트에 넘기는 매물은 id, 판매 공장, 지역, 재질, 무게, 단가, 대략 거리만(좌표 없음). 화면용 매물 한 줄은 경로가 붙인다.
- 구매 희망 화면: 재질, 수량, 상한가가 바뀌면(멈춘 뒤 0.4초) 맞추기를 불러 '판매 중 맞는 매물' 목록을 보이고, 누르면 매물 상세에서 바로 구매 요청.
- 새 구매 희망을 올리면 같은 재질 매물을 판매 중인 공장(상한가 안이거나 협상 가능)에 알림 '구매 희망 맞음'.

