#!/usr/bin/env node
/**
 * Post-overlay step for `bun run build:android`.
 *
 * `eliza/packages/app-core/scripts/run-mobile-build.mjs:overlayAndroid()`
 * copies `eliza/packages/app-core/platforms/android/app/src/main/java/ai/elizaos/app/MainActivity.java`
 * into the parent's Capacitor android tree at
 * `apps/app/android/app/src/main/java/com/miladyai/milady/MainActivity.java`,
 * with package renames. The eliza source only reads `ro.elizaos.product`
 * and emits `ElizaOS/<tag>`. MiladyOS-the-AOSP-image only sets
 * `ro.miladyos.product` (`vendor/milady/milady_common.mk:62`) and the
 * web layer's `isMiladyOS()` (`apps/app/src/main.tsx`) sniffs for the
 * `MiladyOS/<tag>` UA suffix to gate Milady-specific behavior.
 *
 * This script rewrites `applyElizaOSUserAgentSuffix(...)` so that on
 * MiladyOS images it appends BOTH `MiladyOS/<tag>` (the brand-specific
 * marker the parent web app reads) and `ElizaOS/<tag>` (the framework
 * marker upstream eliza reads). On stock Android the system property
 * is absent and both markers are skipped, preserving the RuntimeGate
 * picker.
 *
 * Idempotent — re-running after a clean overlay reapplies the patch;
 * re-running on an already-patched file is a no-op.
 *
 * Eliza upstream MainActivity.java stays Milady-free (per the
 * "no milady words in eliza" rule); the brand-aware variant lives
 * here, in the parent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");

const TARGET = path.join(
  repoRoot,
  "apps",
  "app",
  "android",
  "app",
  "src",
  "main",
  "java",
  "com",
  "miladyai",
  "milady",
  "MainActivity.java",
);

const ELIZAOS_PROP_BLOCK_RE =
  /\/\/ Set by the AOSP product config[\s\S]*?private static final String ELIZAOS_PRODUCT_PROP = "ro\.elizaos\.product";/m;
const MILADYOS_PROP_BLOCK = `// Set by the AOSP product config (vendor/milady/milady_common.mk) on
    // every MiladyOS image; absent on stock Android. Reading it is the
    // signal that this APK is running as the system app on a Milady
    // device, vs. installed on a vanilla phone where Eliza Cloud / Remote
    // / Local must remain user-selectable in the RuntimeGate picker.
    private static final String MILADYOS_PRODUCT_PROP = "ro.miladyos.product";`;

const TAG_BEFORE =
  'private static final String TAG = "ElizaMainActivity";';
const TAG_AFTER =
  'private static final String TAG = "MiladyMainActivity";';

const APPLY_CALL_BEFORE = "applyElizaOSUserAgentSuffix(settings);";
const APPLY_CALL_AFTER = "applyMiladyOSUserAgentSuffix(settings);";

const ELIZA_METHOD_RE =
  /\/\*\*[\s\S]*?Append `ElizaOS\/<tag>`[\s\S]*?private void applyElizaOSUserAgentSuffix\(WebSettings settings\) \{[\s\S]*?\n {4}\}/m;

const MILADY_METHOD = `/**
     * Append both \`MiladyOS/<tag>\` and \`ElizaOS/<tag>\` to the WebView's
     * user-agent string when the AOSP-set system property
     * \`ro.miladyos.product\` is present.
     *
     * - \`MiladyOS/<tag>\` — Milady-specific brand marker. The parent web
     *   app sniffs this for Milady-only behaviors (registering Milady
     *   system apps, picking the MiladyOS-flavored splash, etc.).
     * - \`ElizaOS/<tag>\` — generic ElizaOS marker the upstream eliza
     *   framework looks for via \`isElizaOS()\`. Emitting it here lets
     *   eliza's startup-coordinator pick the longer cold-boot timeout
     *   policy without needing to know about Milady, since MiladyOS is
     *   semantically an ElizaOS-based fork (same on-device-agent layout,
     *   same boot timing, different brand label).
     *
     * On stock Android the system property is absent, both markers are
     * skipped, and the RuntimeGate's "Choose your setup" picker renders
     * normally.
     *
     * \`android.os.SystemProperties\` is hidden API but accessible via
     * reflection from the system app.
     */
    private void applyMiladyOSUserAgentSuffix(WebSettings settings) {
        String tag = readSystemProperty(MILADYOS_PRODUCT_PROP);
        if (tag == null || tag.isEmpty()) {
            return;
        }
        String miladyMarker = "MiladyOS/" + tag;
        String elizaMarker = "ElizaOS/" + tag;
        String currentUa = settings.getUserAgentString();
        StringBuilder newUa = new StringBuilder(
            currentUa == null ? "" : currentUa
        );
        if (currentUa == null || !currentUa.contains(miladyMarker)) {
            if (newUa.length() > 0) newUa.append(" ");
            newUa.append(miladyMarker);
        }
        if (currentUa == null || !currentUa.contains(elizaMarker)) {
            if (newUa.length() > 0) newUa.append(" ");
            newUa.append(elizaMarker);
        }
        settings.setUserAgentString(newUa.toString());
    }`;

function patch(text) {
  let nextText = text;
  let dirty = false;

  if (nextText.includes(APPLY_CALL_AFTER)) {
    // Already patched.
  } else if (nextText.includes(APPLY_CALL_BEFORE)) {
    nextText = nextText.replace(APPLY_CALL_BEFORE, APPLY_CALL_AFTER);
    dirty = true;
  } else {
    return {
      ok: false,
      reason: `expected applyElizaOSUserAgentSuffix(settings); call site not found`,
    };
  }

  if (nextText.includes("MILADYOS_PRODUCT_PROP")) {
    // Already patched.
  } else if (ELIZAOS_PROP_BLOCK_RE.test(nextText)) {
    nextText = nextText.replace(ELIZAOS_PROP_BLOCK_RE, MILADYOS_PROP_BLOCK);
    dirty = true;
  } else {
    return {
      ok: false,
      reason: `expected ELIZAOS_PRODUCT_PROP comment + declaration block not found`,
    };
  }

  if (nextText.includes(TAG_AFTER)) {
    // Already patched.
  } else if (nextText.includes(TAG_BEFORE)) {
    nextText = nextText.replace(TAG_BEFORE, TAG_AFTER);
    dirty = true;
  } else {
    return {
      ok: false,
      reason: `expected ElizaMainActivity TAG declaration not found`,
    };
  }

  if (nextText.includes("private void applyMiladyOSUserAgentSuffix(")) {
    // Method body already replaced.
  } else if (ELIZA_METHOD_RE.test(nextText)) {
    nextText = nextText.replace(ELIZA_METHOD_RE, MILADY_METHOD);
    dirty = true;
  } else {
    return {
      ok: false,
      reason: `expected applyElizaOSUserAgentSuffix method body not found`,
    };
  }

  return { ok: true, text: nextText, dirty };
}

if (!fs.existsSync(TARGET)) {
  console.log(
    `[patch-android-milady-mainactivity] target not present (${path.relative(
      repoRoot,
      TARGET,
    )}); skipping — run \`bun run build:android\` first`,
  );
  process.exit(0);
}

const original = fs.readFileSync(TARGET, "utf8");
const result = patch(original);

if (!result.ok) {
  console.error(
    `[patch-android-milady-mainactivity] FAILED: ${result.reason}\n  file: ${path.relative(repoRoot, TARGET)}`,
  );
  process.exit(1);
}

if (checkOnly) {
  console.log(
    `[patch-android-milady-mainactivity] check ok (${result.dirty ? "would patch" : "already patched"})`,
  );
  process.exit(0);
}

if (!result.dirty) {
  console.log("[patch-android-milady-mainactivity] already patched");
  process.exit(0);
}

fs.writeFileSync(TARGET, result.text);
console.log(
  "[patch-android-milady-mainactivity] patched MiladyOS UA marker into MainActivity.java",
);
