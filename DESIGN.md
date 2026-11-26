# 현재 웹 앱 디자인 안내

현재 UI는 `frontend/`의 React + TypeScript + Vite 구현이다. Flutter 레포나 독립 HW 하윤 시안을 현재 제품으로 간주하지 않는다.

## 수정 위치

- 세 앱 미리보기: `frontend/index.html`
- 공통 헤더·카드·탭: `frontend/src/shared/ui/shell/`
- 공통 테마: `frontend/src/shared/theme.css`
- 판매자: `frontend/src/apps/seller/`
- 구매자: `frontend/src/apps/buyer/`
- 운송기사: `frontend/src/apps/carrier/`
- 공통 화면: `frontend/src/shared/screens/`

상세 동작과 기존 이식 기록은 [docs/DESIGN.md](docs/DESIGN.md), 거래 규칙은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 확인한다.

현재 요청된 UI 검토 범위는 헤더·검색, 시세·물량, 추천 업체, 통과증 매물의 정보 배치와 간격이다. 이전 대화에서 제안한 치수는 검토안이며 이번 폴더 정리에서 UI를 변경한 것은 아니다.

이전 HW 하윤 디자인 문서는 [archive/legacy/HW_HAYOON_DESIGN.md](archive/legacy/HW_HAYOON_DESIGN.md)에 보존했다. 이전 Flutter·JavaScript 시안은 자료 참고용이며 현재 앱의 기술 선택이나 디자인 변경을 제한하지 않는다.
