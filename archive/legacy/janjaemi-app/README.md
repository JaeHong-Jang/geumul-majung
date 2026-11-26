# 잔재미 앱

구매자와 운송기사가 함께 쓰는 Flutter 앱입니다. iPhone 14 Pro(393×852)를 기준으로 만들었습니다.

- 구매자 화면: Figma `AI부트캠프` 파일의 `잔재미` 묶음
- 운송기사 화면: `carrier-app-react` B안(오더 보드형)

## 실행

```bash
cd janjaemi-app
flutter pub get
flutter run
```

안드로이드 스튜디오에서는 이 폴더를 열고 기기 목록에서 iPhone 14 Pro 시뮬레이터를 고르면 됩니다.
로그인 화면에서 **구매자** 또는 **운송기사**를 선택하면 다음 화면으로 넘어갑니다.

## 화면

- 공통: 로딩, 로그인·역할 선택
- 구매자: 홈, 탐색, 장바구니, 거래내역, 마이페이지, 매물 상세, AI 추천 묶음, 시세, 구매 요청, 구매 요청 완료, 입고 확인·후기
- 운송기사: 홈, 운반 요청(목록·지도), 요청 상세, 운행 중, 정산, 마이

## 현재 범위

- 서버와 연결되어 있지 않습니다. 장바구니는 앱 실행 중에만 유지됩니다.
- `[가격]`, `[회사명]` 같은 대괄호 값은 데이터 연결 전 자리 표시자입니다.
- 판매자 화면은 아직 없습니다.
- 운송기사의 운임·콜 조건·정산 내역은 `carrier-app`의 예시 데이터입니다.

## 폴더

- `lib/theme/app_theme.dart` 색상, 글자 스타일
- `lib/widgets/common.dart` 공통 위젯
- `lib/data/models.dart` 화면용 데이터, 장바구니 상태
- `lib/screens/` 화면
- `lib/carrier/` 운송기사 화면, 지도, 상태
- `assets/icons/` Figma에서 내려받은 SVG
- `assets/carrier/orders.json` 경로까지 계산한 콜 데이터
- `assets/map_tiles/` 내장 지도 타일 (© OpenStreetMap 기여자)
- `tool/build_carrier_data.mjs` `carrier-app/data`로 위 두 항목을 다시 만드는 스크립트
- `assets/fonts/` 폰트와 SIL OFL 라이선스

## 테스트

```bash
flutter analyze
flutter test
```
