# 이전 앱·웹 시안 보관함

2026-11-05 폴더 정리. 현재 제품은 저장소 루트의 `frontend/` React 웹 앱과 `backend/` 서버다. 이 폴더는 현재 빌드에 포함하지 않으며, 여기의 README·설계 지시는 과거 기록이다.

| 이전 경로 | 보관 경로 | 내용 |
|---|---|---|
| `janjaemi-app/` | `janjaemi-app/` | Flutter 구매자·운송기사 앱, 원본 자산 |
| `hw-hayoon/` | `hw-hayoon/` | 독립 JavaScript 운송기사 시안 |
| `DESIGN.md` | `HW_HAYOON_DESIGN.md` | 위 시안을 현재 제품으로 설명하던 디자인 문서 |
| `run-web.sh` | `run-web.sh` | 이전 Flutter Chrome 실행기 |
| `run-windows.ps1` | `run-windows.ps1` | 이전 Flutter Windows·Android 실행기 |
| `.github/workflows/windows-android.yml` | `windows-android.yml.disabled` | 이전 Flutter APK CI 기록. 자동 실행하지 않음 |
| `deploy/index.html` | `deploy-index.html` | 현재 Vite 빌드에서 참조하지 않는 세 앱 미리보기 옛 사본 |

## 보존과 복구

원본은 삭제하지 않고 이동했다. `preservation-manifest.json`은 이동 직전 각 파일의 원래 경로와 SHA-256이다. 앱 두 폴더의 내용은 그대로 보존했다. 두 실행기는 이동 후에도 현재 `backend/`와 보관된 Flutter 앱을 찾도록 경로만 수정했다. 기존 작업 중이던 변경도 이동 시점 내용으로 보존했다.

앱 폴더만 되돌리려면 저장소 루트에서 원하는 폴더를 원래 이름으로 이동하면 된다. 실행기까지 원위치로 복구할 경우 경로 계산도 원래 구조에 맞게 변경해야 한다. 비활성 CI는 원래 앱 경로와 실행기 경로에 의존하므로 그대로 활성화하지 않는다.

기존 문서 안의 `hw-hayoon/`, `janjaemi-app/` 경로는 당시 저장소 기준이다. 이 보관함 안의 상대 문서 링크와 개발 명령은 과거 맥락으로 읽는다. Flutter 데이터 생성 도구가 참조하는 `carrier-app/`는 정리 전부터 이 작업 폴더에 없었으므로 별도 원본이 필요하다.

현재 웹 진입점 `frontend/index.html`은 세 역할을 보여주는 실제 미리보기이므로 보관하지 않았다. `frontend/dist/`도 현재 서버가 제공할 수 있는 빌드 결과라 이동하지 않았다. 데이터베이스·로컬 설정·도구 상태는 이번 정리 대상이 아니다.

## 공개 저장소 안내

`janjaemi-app/assets/carrier/orders.json`과 `hw-hayoon/src/routes.json`은 카카오 좌표로 만든 공장 위치를 포함해 이 공개본에서 뺐다. 두 시안의 운송 경로 화면은 이 파일 없이 동작하지 않는다.
