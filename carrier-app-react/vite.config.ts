import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 지도·도로·공장 데이터는 carrier-app/data를 함께 쓴다
export default defineConfig({
  plugins: [react()],
  publicDir: "../carrier-app/data",
  server: { host: "localhost", port: 5173 },
  test: { environment: "jsdom", globals: true, setupFiles: ["src/test/setup.ts"], css: false },
});
