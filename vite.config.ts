import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 前端：web/ → public/（Workers Static Assets 目录）
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    // 本地前端开发：API / 登录 / 直链仍由 wrangler dev（8787）提供
    proxy: { "/api": "http://localhost:8787", "/auth": "http://localhost:8787", "/i/": "http://localhost:8787" },
  },
});
