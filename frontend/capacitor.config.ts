import type { CapacitorConfig } from "@capacitor/cli";

// Android app: the same web build, packaged with Capacitor.
const config: CapacitorConfig = {
  appId: "app.mathpad.editor",
  appName: "MintMath",
  webDir: "dist",
  plugins: {
    // Route fetch through native HTTP so Backblaze B2 works without CORS.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
