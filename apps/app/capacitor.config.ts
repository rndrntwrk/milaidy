import type { CapacitorConfig } from "@capacitor/cli";
import appConfig from "./app.config";

const config: CapacitorConfig = {
  appId: appConfig.appId,
  appName: appConfig.appName,
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    // Self-hosters add their own domains via MILADY_ALLOWED_HOSTS
    // (build-time env, comma-separated). Listed entries are baseline.
    allowNavigation: [
      "localhost",
      "127.0.0.1",
      "*.elizacloud.ai",
      "app.milady.ai",
      "cloud.milady.ai",
      "*.milady.ai",
      "rs-sdk-demo.fly.dev",
      "*.fly.dev",
      "hyperscape.gg",
      "*.hyperscape.gg",
      ...(process.env.MILADY_ALLOWED_HOSTS ?? "")
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean),
    ],
  },
  plugins: {
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    backgroundColor: "#0a0a0a",
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
