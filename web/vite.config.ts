import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: { port: 5180, proxy: { "/api": { target: "http://localhost:4100", changeOrigin: false } } },
  build: { outDir: "../dist", emptyOutDir: true },
});
