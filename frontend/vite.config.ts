import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, path.resolve(import.meta.dirname, ".."), ""),
    ...process.env,
  };
  const backend = `http://${env.BACKEND_HOST === "0.0.0.0" ? "127.0.0.1" : env.BACKEND_HOST || "127.0.0.1"}:${env.BACKEND_PORT || "8106"}`;
  return {
    plugins: [react()],
    server: {
      host: env.FRONTEND_HOST || "0.0.0.0",
      port: Number(env.FRONTEND_PORT || 5176),
      strictPort: true,
      proxy: { "/api": { target: backend, ws: true } },
    },
    build: { chunkSizeWarningLimit: 1800 },
  };
});
