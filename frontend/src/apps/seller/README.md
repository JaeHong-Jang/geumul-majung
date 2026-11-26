# 판매자 앱

진입점은 `main.jsx`, 경로는 `/seller/`입니다. Figma 고유 화면은 `screens/`에 유지하며 로그인·가입·회사 정보·알림·고객센터·인계서·후기·대화·시세는 `src/shared/screens/`의 화면을 사용합니다.

공통 API는 `src/shared/api/client.ts`, JSX 호출 어댑터는 `src/shared/api/seller.js`입니다. 세션은 `sessionStorage["janjaemi:seller"]`에 `{access_token, company}`로 저장합니다. 공통 색은 `src/shared/theme.css`이며 `styles/tokens.css`는 기존 Figma 변수 이름을 연결합니다.

등록(07) → 확인(08) → 상세(09)의 초안은 `lib/draft.js`에서 보관합니다. 판매 조언만 AI 결과로 표시합니다. 개발용 화면 목록은 제거했습니다.
