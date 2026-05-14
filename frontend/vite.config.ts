import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../src/price_getter/ui_dist",
    emptyOutDir: true,
    assetsDir: "assets",
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/config": "http://127.0.0.1:8000",
      "/run-now": "http://127.0.0.1:8000",
      "/font-assets": "http://127.0.0.1:8000",
    },
  },
});
