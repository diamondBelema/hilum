import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4747",
      "/mcp": "http://127.0.0.1:4747",
    },
  },
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
  },
});
