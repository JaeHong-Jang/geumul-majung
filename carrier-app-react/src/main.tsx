import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import ErrorBoundary from "./components/ErrorBoundary";

/* App은 불러올 때 데이터를 읽으므로, 데이터가 없을 때의 오류도 ErrorBoundary가 받도록 지연 로드한다 */
const App = lazy(() => import("./App"));

const root = document.getElementById("root");
if (!root) throw new Error("#root 요소가 없습니다.");
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
