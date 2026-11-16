import type { CapacitorConfig } from "@capacitor/cli";

// Android app: the same web build, packaged with Capacitor.
const config: CapacitorConfig = {
  appId: "app.mathpad.editor",
  appName: "MathPad",
  webDir: "dist",
};

export default config;
