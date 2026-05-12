// Thin wrapper around `../app.config.ts` that surfaces the derived
// branding/log-prefix/namespace/url-scheme constants used by main.tsx.
//
// Upstream milady-ai/milady's apps/app/src/app-config.ts imports
// `resolveAppBranding` from `@elizaos/app-core` — that import path is
// stale for current eliza (commit 5a6f5f3370 moved branding into
// @elizaos/ui via the Wave A refactor; @elizaos/app-core no longer
// exports it). Alice uses the canonical post-refactor path
// `@elizaos/ui/config/app-config`, matching what
// eliza/packages/app/src/app-config.ts itself does.
import { resolveAppBranding } from "@elizaos/ui/config/app-config";

import appConfig from "../app.config";

export const APP_CONFIG = appConfig;
export const APP_BRANDING_BASE = resolveAppBranding(APP_CONFIG);
export const APP_LOG_PREFIX = `[${APP_CONFIG.appName}]`;
export const APP_NAMESPACE =
  APP_CONFIG.namespace?.trim() || APP_CONFIG.cliName.trim();
export const APP_URL_SCHEME =
  APP_CONFIG.desktop?.urlScheme?.trim() || APP_CONFIG.cliName.trim();
