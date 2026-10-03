import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// The landing ships under a strict CSP (img-src/style-src 'self'): every asset must
// be a real file, never an inlined data: URI.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { assetsInlineLimit: 0, sourcemap: false, modulePreload: { polyfill: false } },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
