/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// Serve the CORS setup scripts at <app>/b2-cors.sh and <app>/b2-cors.ps1: the
// app shows commands that download them from the app itself.
const CORS_SCRIPTS = ["b2-cors.sh", "b2-cors.ps1"];
// Content-Security-Policy (meta tag; GitHub Pages cannot set headers). The page
// may only load its own code and only talk to itself, Backblaze B2 and the
// desktop app's IPC, so injected content cannot load scripts or send data
// (e.g. the stored B2 key) anywhere else.
function contentSecurityPolicy(): Plugin {
  const apiBase = process.env.VITE_API_BASE;
  return {
    name: "mathpad-csp",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const dev = Boolean(ctx.server);
        const csp = [
          "default-src 'self'",
          // Dev only: Vite's inline React refresh preamble.
          `script-src 'self'${dev ? " 'unsafe-inline'" : ""}`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "media-src 'self' data: blob:",
          "worker-src 'self' blob:",
          [
            "connect-src 'self' data: blob: https://*.backblazeb2.com ipc: http://ipc.localhost",
            apiBase ? new URL(apiBase).origin : "",
            dev ? "ws: wss:" : "",
          ]
            .filter(Boolean)
            .join(" "),
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; ");
        return html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        );
      },
    },
  };
}

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
    contentSecurityPolicy(),
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
