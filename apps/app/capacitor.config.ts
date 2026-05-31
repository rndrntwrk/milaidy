import type { CapacitorConfig } from "@capacitor/cli";
// Import directly from @elizaos/shared (the canonical owner of the
// allowed-hosts helper) so the import resolves identically in both
// MILADY_ELIZA_SOURCE=packages (npm-published @elizaos/*) and
// MILADY_ELIZA_SOURCE=local (workspace-linked eliza/packages/*) modes.
// @elizaos/app-core re-exports this subpath in published builds but not
// in the local source's package.json exports map, which would otherwise
// break `bun run build:android` under local mode.
import {
  parseAllowedHostEnv,
  toCapacitorAllowNavigation,
} from "@elizaos/shared/config/allowed-hosts";

type CapacitorAllowNavigation = NonNullable<
  NonNullable<CapacitorConfig["server"]>["allowNavigation"]
>;

const allowNavigation: CapacitorAllowNavigation = [
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
  ...toCapacitorAllowNavigation(
    parseAllowedHostEnv(
      process.env.ELIZA_ALLOWED_HOSTS ?? process.env.MILADY_ALLOWED_HOSTS,
    ),
  ),
];

const config: CapacitorConfig = {
  appId: "com.miladyai.milady",
  appName: "Milady",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    // Allow the webview to connect to the embedded API server and game servers
    allowNavigation: [
      "localhost",
      "127.0.0.1",
      "*.elizacloud.ai",
      "rs-sdk-demo.fly.dev",
      "*.fly.dev",
      "hyperscape.gg",
      "*.hyperscape.gg",
    ],
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#0a0a0a",
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
