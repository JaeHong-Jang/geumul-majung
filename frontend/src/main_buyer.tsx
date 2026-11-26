import { createRoot } from "react-dom/client";
import App from "./App";
import { startApp } from "./shared/phoneFrame";
startApp(() => createRoot(document.getElementById("root")!).render(<App appRole="buyer" />), "잔재미 구매자");
