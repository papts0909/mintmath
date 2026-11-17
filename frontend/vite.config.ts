/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// Serve the CORS setup script at <app>/b2-cors.mjs so people can download it
// from the app itself (the app shows the command).
function serveCorsScript(): Plugin {
  const src = new URL("./scripts/b2-cors.mjs", import.meta.url);
  return {
    name: "mathpad-b2-cors-script",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${server.config.base}b2-cors.mjs`) return next();
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.end(readFileSync(src));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "b2-cors.mjs", source: readFileSync(src) });
    },
  };
}

const backend = process.env.MATHPAD_BACKEND_URL ?? "http://localhost:8000";
// Sub-path when hosted under e.g. https://user.github.io/mintmath/
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    serveCorsScript(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // registered in src/pwa.ts
      manifest: {
        name: "MathPad – Trình bày bài giải toán",
        short_name: "MathPad",
        description: "Gõ bài giải toán theo từng dòng, xuất LaTeX, PDF, PNG.",
        lang: "vi",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1e6fd9",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,woff,ttf}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // Never cache export responses.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": { target: backend, changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { "/api": { target: backend, changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
