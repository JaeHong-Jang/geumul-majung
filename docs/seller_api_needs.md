# 판매자 앱(seller-delivery-app) — 서버에 더 필요한 API

기준: `docs/ARCHITECTURE.md` 3·8·9·10·11·12절. 이 문서는 **계약서에 없는 기능**만 적는다.
판매자 앱은 아래 경로를 **이미 이 계약대로 호출하는 코드가 들어 있다.** 서버가 같은 모양으로 만들면 화면이 바로 동작한다. 서버에 없으면(404) 앱은 빈 상태 또는 "서버에 아직 이 기능이 없어요."를 보여 준다. 값을 지어내지 않는다.
모두 `Authorization: Bearer` 필요(가입만 예외), 응답은 JSON, 오류는 `{detail: 한국어 문장}`.
권한은 별말 없으면 `factory`(판매자). 남의 것은 404, 다른 역할은 403.

## A. 가입·승인 (화면 02, 03, 04, 01)

| 화면 | 필요한 것 | 메서드 경로 | 요청 | 응답 | 권한 |
|---|---|---|---|---|---|
| 02·03 가입 신청 | 공장 가입(계정+사업장). 주소를 서버가 좌표로 바꿈(앱에는 위경도 입력이 없음) | `POST /v1/signup/factory` | `{login_id, password, name, biz_no, address, address_detail?, phone, industry, emitter_report}` (`emitter_report`: 배출자 신고 대상 여부 문자열) | `201 {id, status:"pending"}` | 누구나(`ALLOW_SIGNUP`일 때) |
| 03 증빙 사진 추가 | 사업자등록증·배출자 신고 증빙 업로드 | `PUT /v1/me/documents` | `{kind:"business_license"\|"emitter_report", content_type, data_base64}` (jpeg·png·webp·pdf, 2MB 이하) | `{id, kind, created_at}` | factory |
| 03 | 올린 증빙 목록 | `GET /v1/me/documents` | — | `[{id, kind, created_at}]` | factory |
| 03 정보 저장 | 12.1 `PATCH /v1/me/profile`에 칸 추가 | `PATCH /v1/me/profile` | 기존 `address, region` + `name?, phone?, industry?, address_detail?, emitter_report?` | 12.1 `GET /v1/me/profile` 모양 + 위 칸 | factory |
| 04 승인·보완 | 승인 상태와 보완 요청 사유 | `GET /v1/me/approval` | — | `{status:"pending"\|"approved"\|"needs_fix", note:str\|null, missing:["business_license"...]}` | factory |
| 04 보완 자료 제출 | 보완 자료 제출(증빙 업로드 뒤 검토 요청) | `POST /v1/me/approval/resubmit` | `{note?}` | `{status:"pending"}` | factory |
| 01 비밀번호 재설정 | 10.5 "아직 안 함" 항목 | `POST /v1/auth/password-reset` | `{login_id, biz_no}` | `{ok:true}` (운영자 확인 뒤 임시 비밀번호) | 누구나 |

현재 앱: 04의 상태는 `GET /v1/me/profile`(없으면 `/v1/seller/home`의 `company.verified`)로 "승인 완료/승인 대기"만 보여 준다. 03은 로그인한 상태에서 주소만 `PATCH /v1/me/profile`로 저장한다.

## B. 공동판매 (화면 10, 11, 12, 13)

12.5의 `buyer/bundles`는 구매자용이다. 판매자가 공장끼리 물량을 모으는 기능은 계약에 없다.
공동판매 한 건 = `pool`. 모양:

```
{id, title, waste_code, waste_name, target_material, status:"open"|"closed"|"sold"|"cancelled",
 target_kg, current_kg, factory_count, deadline:"YYYY-MM-DD",
 applied_price_krw_per_kg, min_price_krw_per_kg,
 members:[{name, kg, price_krw_per_kg, mine:bool}]}   // 다른 공장 이름 노출 여부는 정책 결정 필요
```

| 화면 | 메서드 경로 | 요청 | 응답 | 비고 |
|---|---|---|---|---|
| 10 참여할 공동판매 목록 | `GET /v1/pools?waste_code=` | — | `[pool]`(members 제외) | 내 반경 안 `open`만 |
| 12·13 내 공동판매 | `GET /v1/pools?mine=1` | — | `[pool]`(members 포함) | 내가 만들었거나 참여한 것 |
| 11 새 공동판매 만들기 | `POST /v1/pools` | `{listing_id, target_kg, deadline}` | `201 pool` | 내 `bundle_wait`/`posted` 판매. 그 판매는 `bundle_wait`로 |
| 10 참여 | `POST /v1/pools/{id}/join` | `{listing_id}` | `pool` | 같은 waste_code·등급 |
| 12 조건 수정 | `PATCH /v1/pools/{id}` | `{target_kg?, deadline?}` | `pool` | 만든 공장만 |
| 13 마감 처리 | `POST /v1/pools/{id}/deadline` | `{action:"extend"\|"sell_now"\|"cancel", new_deadline?}` | `pool` | extend는 `new_deadline` 필수. sell_now는 현재 물량을 한 판매로 게시. cancel은 내 참여만 취소 |
| 12 | 단가 규칙 | — | — | 화면 문구 "참여 공장 중 최저 단가로 통일"을 서버가 계산해 `applied_price_krw_per_kg`로 줌 |

현재 앱: 모아서 팔기는 `POST /v1/listings` `mode:"bundle"`(`bundle_wait`)로 올린다. 10~13은 위 API가 없으면 빈 상태.
(판매 조언 `advice`의 묶음 문장은 09 화면에 그대로 보여 준다.)

## C. 재활용업체 찾기 (화면 15, 16, 05 홈)

| 화면 | 메서드 경로 | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| 15 목록·검색 | `GET /v1/recyclers?q=&waste_code=` | 쿼리 | `[{id, name, region, materials:str, distance_km, favorite:bool}]` | factory. `verified=true`이고 허가 코드가 맞는 recycler만. 가까운 순 |
| 16 상세 | `GET /v1/recyclers/{id}` | — | 위 + `{pickup_method, terms, permit_codes}` | factory |
| 16 관심 저장 | `PUT /v1/me/favorite-recyclers/{id}`, `DELETE …/{id}` | `{}` | `{favorite:bool}` | factory |
| 15 관심 업체 | `GET /v1/me/favorite-recyclers` | — | `[recycler]` | factory |
| 05 홈 추천 | `GET /v1/seller/home`에 `recommended_recyclers: [recycler]` (최대 2) | — | — | 11.1 홈 응답 확장 |

사진(취급 품목 사진)은 지금 없다. 홈의 "우리 공장에 맞는 재활용업체" 카드는 사진 칸 없이 이름·품목·거리만 쓴다.

## D. 거래 대화 (화면 24, 16의 "채팅으로 문의")

| 메서드 경로 | 요청 | 응답 | 권한 |
|---|---|---|---|
| `GET /v1/orders/{id}/messages` | — | `[{id, sender_id, sender_name, body, created_at}]` 오래된 순 | 주문 당사자 |
| `POST /v1/orders/{id}/messages` | `{body}`(1~500자) | `201 {id,…}` | 주문 당사자 |

주문 없이 업체에 문의하는 대화(16)는 정책 결정이 필요하다(주문 전 대화 허용 여부). 지금 앱은 주문별 대화만 호출한다.

## E. 쿠폰 (화면 26, 05 홈 배너)

12절에 "주유 쿠폰은 제도가 없어 만들지 않는다"고 되어 있다. 판매자용 쿠폰도 같은 이유로 **지금 값이 없다.** 앱은 빈 목록을 보여 주고 홈의 쿠폰 배너("첫 운반비 5,000원 할인")는 뺐다.
제도를 정하면: `GET /v1/me/coupons → [{id, title, description, expires_at, used:bool}]`, `POST /v1/me/coupons/{id}/claim`.

## F. 사진·첨부

| 화면 | 필요한 것 | 메서드 경로 | 비고 |
|---|---|---|---|
| 19 수거 사진 확인 | 수거 기록 사진 | `GET /v1/orders/{id}/photos?stage=pickup` → `[{id, content_type}]`, `GET /v1/orders/{id}/photos/{photo_id}` 바이너리 | 운반업체가 pickup 때 올림 |
| 21 검사 사진 확인 | 검사 기록 사진 | `stage=inspect` | 재활용업체가 inspect 때 올림 |
| 23 문의 사진 추가 | 문의 첨부 | `POST /v1/support/tickets/{id}/attachments` `{content_type, data_base64}` | 12.6 티켓에 첨부 |
| 07 마대 사진 | 12.8 `PUT /v1/bags/{id}/photo` | (계약에 있음, 서버 미구현이면 앱은 사진만 건너뜀) | 마대 상세(09)에서 보려면 `GET /v1/bags/{id}/photo`도 필요 |

19·21의 "사진 확인" 줄은 값이 없어 화면에서 뺐다.

## G. 판매 수정 (화면 09 "판매 정보 수정")

`PATCH /v1/listings/{id}` `{price_krw_per_kg?, available_from?, pickup_note?}` — 그 판매의 factory, `posted`/`bundle_wait`만(아니면 409). 마대 구성은 못 바꿈. 지금은 "판매를 내린 뒤 다시 등록"만 가능하다(`POST /v1/listings/{id}/withdraw`).

## H. 폐기물 코드 목록 (화면 07)

`GET /v1/waste-codes → [{code, name}]` (로그인 불필요). 지금 앱은 `data/waste_codes.json`의 코드·이름을 `src/lib/wasteCodes.js`에 복사해 쓴다. 서버 목록으로 바꾸면 복사본을 지운다.

## I. 기존 API로 해결해서 표에서 뺀 것

| 화면 | 해결 |
|---|---|
| 23 분쟁 | 주문의 `status:"disputed"`, `dispute_reason`(`GET /v1/orders/{id}`), 문의 접수는 `POST /v1/support/tickets`(12.6) |
| 14 장바구니 | 판매자는 구매하지 않는다. 지금 화면은 "장바구니가 비어 있어요" 그대로(피그마 원본). 의미를 다시 정하지 않으면 하단 탭에서 빼는 것을 권장 |
| 05 시세·물량 | `GET /v1/seller/home`의 `prices`, `volumes`(11.5) |
| 25 알림 | 12.6 `GET /v1/notifications`, `POST …/{id}/read`, `read-all` |
| 22 후기 | `POST /v1/ratings` |

## J. 이 앱이 쓰는데 서버에 아직 없던 12절 경로 (2026-11-05 확인 시점)

`GET·PATCH /v1/me/profile`, `GET /v1/notifications`·`read`·`read-all`, `GET /v1/support/faq`·`GET·POST /v1/support/tickets`, `PUT /v1/bags/{id}/photo`, 판매 `available_from`·`pickup_note`(요청에는 보내고, 서버가 무시해도 판매는 만들어짐), `GET /v1/orders/{id}`의 `waste_name`·`factory_name`·`recycler_name`·`hauler_name`·`bags`(구현 중인 것으로 보임).
