import { defineConfig, devices } from "@playwright/test";

// Drive E2E tests fake Google entirely; any client id switches the UI on.
process.env.VITE_GOOGLE_CLIENT_ID ??= "e2e-fake-client-id";

const backendCmd =
  process.env.MATHPAD_BACKEND_CMD ??
  "cd ../backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/mobile.spec.ts", "**/pwa.spec.ts"],
    },
    // Touch phone layout (Chromium with Pixel 7 metrics, touch and coarse pointer).
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: "**/mobile.spec.ts" },
    // Production build served by `vite preview`, with the service worker.
    {
      name: "pwa",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" },
      testMatch: "**/pwa.spec.ts",
    },
  ],
  webServer: [
    {
      command: backendCmd,
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npx vite --port 5173 --strictPort",
      env: { VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID },
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npx vite build --logLevel error && npx vite preview --port 4173 --strictPort",
      env: { VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID },
      url: "http://localhost:4173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
