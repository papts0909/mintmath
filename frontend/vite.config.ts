/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// Serve the CORS setup scripts at <app>/b2-cors.sh and <app>/b2-cors.ps1: the
// app shows commands that download them from the app itself.
const CORS_SCRIPTS = ["b2-cors.sh", "b2-cors.ps1"];
function serveCorsScript(): Plugin {
  const src = (name: string) => new URL(`./scripts/${name}`, import.meta.url);
  return {
    name: "mathpad-b2-cors-script",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = CORS_SCRIPTS.find((n) => req.url?.split("?")[0] === `${server.config.base}${n}`);
        if (!name) return next();
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(readFileSync(src(name)));
      });
    },
    generateBundle() {
      for (const name of CORS_SCRIPTS)
        this.emitFile({ type: "asset", fileName: name, source: readFileSync(src(name)) });
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
