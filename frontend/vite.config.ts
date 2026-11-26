import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 앱 2개를 한 코드로 빌드한다: /buyer/, /seller/. 첫 화면 / 는 두 폰을 나란히 보여 주는 페이지
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        buyer: "buyer/index.html",
        seller: "seller/index.html",
      },
    },
  },
  server: {
    host: "localhost",
    port: 5173,
    watch: { usePolling: true }, // /mnt/c에서는 파일 변경 알림이 오지 않는다
    proxy: { "/v1": process.env.API_PROXY || "http://127.0.0.1:8000" },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["src/test/setup.ts"], css: false },
});
