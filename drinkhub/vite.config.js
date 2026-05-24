import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  const gasApiUrl = env.VITE_GAS_API_URL || "";

  /** Dev: proxy /api/gas → Apps Script (tránh CORS từ localhost:5173) */
  let proxy = {};
  if (gasApiUrl.includes("script.google.com")) {
    try {
      const gasPath = new URL(gasApiUrl).pathname;
      proxy = {
        "/api/gas": {
          target: "https://script.google.com",
          changeOrigin: true,
          secure: true,
          rewrite: () => gasPath,
        },
      };
    } catch {
      console.warn("[vite] VITE_GAS_API_URL không hợp lệ — bỏ qua proxy GAS");
    }
  }

  return {
    base: "./",
    plugins: [react(), tailwindcss(), viteSingleFile()],
    server: {
      proxy,
    },
  };
});
