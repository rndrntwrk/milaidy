#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

if (process.platform === "win32") {
  console.log(
    "[patch-eliza-electrobun-macos-stage-entitlements] skipped on Windows",
  );
  process.exit(0);
}

const scriptPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "platforms",
  "electrobun",
  "scripts",
  "stage-macos-release-artifacts.sh",
);

const helperFunction = `write_config_entitlements_plist() {
  local output_path="$1"
  local config_path="$SCRIPT_DIR/../electrobun.config.ts"

  node --import tsx --input-type=module - "$output_path" "$config_path" <<'NODE'
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const [outputPath, configPath] = process.argv.slice(2);
const configModule = await import(pathToFileURL(configPath).href);
const config = configModule.default?.default ?? configModule.default;
const entitlements = config?.build?.mac?.entitlements;

if (
  !entitlements ||
  typeof entitlements !== "object" ||
  Array.isArray(entitlements) ||
  Object.keys(entitlements).length === 0
) {
  console.error(
    \`stage-macos-release-artifacts: no macOS entitlements configured in \${configPath}\`,
  );
  process.exit(1);
}

const encode = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const formatValue = (value) => {
  if (value === true) return "<true/>";
  if (value === false) return "<false/>";
  if (typeof value === "string") return \`<string>\${encode(value)}</string>\`;
  if (Number.isInteger(value)) return \`<integer>\${value}</integer>\`;
  throw new Error(
    \`Unsupported macOS entitlement value for plist generation: \${JSON.stringify(value)}\`,
  );
};

const entries = Object.entries(entitlements)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => \`\\t<key>\${encode(key)}</key>\\n\\t\${formatValue(value)}\`)
  .join("\\n");

fs.writeFileSync(
  outputPath,
  \`<?xml version="1.0" encoding="UTF-8"?>\\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">\\n<plist version="1.0">\\n<dict>\\n\${entries}\\n</dict>\\n</plist>\\n\`,
);
NODE
}`;

const helperAnchor = `\nTARBALL_PATH=`;

const oldEntitlementsBlock = `entitlement_args=()
if [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "\${ELECTROBUN_DEVELOPER_ID:-}" ]]; then
  TMP_ENTITLEMENTS_PATH="$TMP_ROOT/staged-entitlements.plist"
  if ! codesign -d --entitlements :- "$STAGED_APP_PATH" >"$TMP_ENTITLEMENTS_PATH" 2>/dev/null; then
    echo "stage-macos-release-artifacts: failed to extract entitlements from staged app bundle"
    exit 1
  fi
  if [[ ! -s "$TMP_ENTITLEMENTS_PATH" ]]; then
    echo "stage-macos-release-artifacts: extracted entitlements were empty"
    exit 1
  fi
  entitlement_args=(--entitlements "$TMP_ENTITLEMENTS_PATH")
fi`;

const patchedEntitlementsBlock = `if [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "\${ELECTROBUN_DEVELOPER_ID:-}" ]]; then
  TMP_ENTITLEMENTS_PATH="$TMP_ROOT/staged-entitlements.plist"
  if ! codesign -d --entitlements :- "$STAGED_APP_PATH" >"$TMP_ENTITLEMENTS_PATH" 2>/dev/null; then
    write_config_entitlements_plist "$TMP_ENTITLEMENTS_PATH"
  fi
  if [[ ! -s "$TMP_ENTITLEMENTS_PATH" ]]; then
    write_config_entitlements_plist "$TMP_ENTITLEMENTS_PATH"
  fi
  if [[ ! -s "$TMP_ENTITLEMENTS_PATH" ]]; then
    echo "stage-macos-release-artifacts: macOS entitlements plist is empty"
    exit 1
  fi
fi`;

if (!fs.existsSync(scriptPath)) {
  throw new Error(
    `patch-eliza-electrobun-macos-stage-entitlements: missing ${path.relative(repoRoot, scriptPath)}`,
  );
}

const originalText = fs.readFileSync(scriptPath, "utf8");
const notaryTimeout30 =
  'NOTARY_WAIT_TIMEOUT="$' + '{ELECTROBUN_NOTARY_WAIT_TIMEOUT:-30m}"';
const notaryTimeout60 =
  'NOTARY_WAIT_TIMEOUT="$' + '{ELECTROBUN_NOTARY_WAIT_TIMEOUT:-60m}"';
let nextText = originalText.replace(notaryTimeout30, notaryTimeout60);

if (!nextText.includes("write_config_entitlements_plist()")) {
  if (!nextText.includes(helperAnchor)) {
    throw new Error(
      "patch-eliza-electrobun-macos-stage-entitlements: could not find helper anchor",
    );
  }
  nextText = nextText.replace(
    helperAnchor,
    `\n${helperFunction}\n\nTARBALL_PATH=`,
  );
}

if (!nextText.includes(patchedEntitlementsBlock)) {
  if (nextText.includes(oldEntitlementsBlock)) {
    nextText = nextText.replace(oldEntitlementsBlock, patchedEntitlementsBlock);
  } else {
    const developerIdExpansion = "$" + "{ELECTROBUN_DEVELOPER_ID:-}";
    const blockStartWithArgs = nextText.indexOf(
      `entitlement_args=()\nif [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "${developerIdExpansion}" ]]; then`,
    );
    const blockStartWithoutArgs = nextText.indexOf(
      `if [[ "$SKIP_SIGNATURE_CHECK" != "1" && -n "${developerIdExpansion}" ]]; then\n  TMP_ENTITLEMENTS_PATH="$TMP_ROOT/staged-entitlements.plist"`,
    );
    const blockStart =
      blockStartWithArgs >= 0 ? blockStartWithArgs : blockStartWithoutArgs;
    const blockEndMarker = "\n\nTMP_LAUNCHER_PATH=";
    const blockEnd =
      blockStart >= 0 ? nextText.indexOf(blockEndMarker, blockStart) : -1;
    if (blockStart < 0 || blockEnd < 0) {
      throw new Error(
        "patch-eliza-electrobun-macos-stage-entitlements: could not find entitlements block",
      );
    }
    nextText =
      nextText.slice(0, blockStart) +
      patchedEntitlementsBlock +
      nextText.slice(blockEnd);
  }
  if (!nextText.includes(patchedEntitlementsBlock)) {
    throw new Error(
      "patch-eliza-electrobun-macos-stage-entitlements: could not find entitlements block",
    );
  }
}

if (nextText !== originalText) {
  fs.writeFileSync(scriptPath, nextText);
}

const mode = nextText === originalText ? "already patched" : "patched";
console.log(`[patch-eliza-electrobun-macos-stage-entitlements] ${mode}`);
