#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");

function restoreStartupTraceEnvFallback(text) {
  let nextText = text;

  for (const block of [
    {
      constName: "sessionId",
      envSuffix: "SESSION_ID",
      bootstrapField: "session_id",
    },
    {
      constName: "stateFile",
      envSuffix: "STATE_FILE",
      bootstrapField: "state_file",
    },
    {
      constName: "eventsFile",
      envSuffix: "EVENTS_FILE",
      bootstrapField: "events_file",
    },
  ]) {
    const lineEnd = "\\r?\\n";
    const pattern = new RegExp(
      `  const ${block.constName} =${lineEnd}` +
        `(?:    trimEnv\\(env\\.(?:ELIZA|MILADY)_STARTUP_${block.envSuffix}\\) \\?\\?${lineEnd})+` +
        `    trimEnv\\(bootstrap\\?\\.${block.bootstrapField} \\?\\? undefined\\) \\?\\?${lineEnd}` +
        "    null;",
      "m",
    );
    const replacement = `  const ${block.constName} =
    trimEnv(env.ELIZA_STARTUP_${block.envSuffix}) ??
    trimEnv(env.MILADY_STARTUP_${block.envSuffix}) ??
    trimEnv(bootstrap?.${block.bootstrapField} ?? undefined) ??
    null;`;

    if (!pattern.test(nextText)) {
      return { matched: false, text };
    }

    nextText = nextText.replace(pattern, replacement);
  }

  return { matched: true, text: nextText };
}

function replaceRequiredBlock(text, pattern, replacement) {
  if (text.includes(replacement)) {
    return { matched: true, text };
  }
  if (!pattern.test(text)) {
    return { matched: false, text };
  }
  return { matched: true, text: text.replace(pattern, replacement) };
}

function patchWindowsSmokeScript(text) {
  let nextText = text;

  for (const patch of [
    {
      pattern:
        /if \(\$env:GITHUB_ENV\) \{[\s\S]*? {2}Add-Content -Path \$env:GITHUB_ENV -Value "PGLITE_DATA_DIR=\$pgliteDataDir"\r?\n\}/,
      replacement: `if ($env:GITHUB_ENV) {
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "PGLITE_DATA_DIR=$pgliteDataDir"
}`,
    },
    {
      pattern:
        /(?:# .*\r?\n)*\$legacyStartupLog = Join-Path \$env:APPDATA "Eliza\\\\eliza-startup\.log"[\s\S]*?\$startupLogs = @\([^\r\n]+\) \| Select-Object -Unique/,
      replacement: `# Packaged builds can still use the default elizaOS brand config before Milady
# overrides are loaded, so include all known startup log locations.
$legacyStartupLog = Join-Path $env:APPDATA "Eliza\\\\eliza-startup.log"
$defaultStartupLog = Join-Path $env:APPDATA "elizaOS\\\\eliza-startup.log"
$miladyStartupLog = Join-Path $env:APPDATA "Milady\\\\eliza-startup.log"
$startupLog = Join-Path $env:APPDATA "Milady\\\\milady-startup.log"
$startupLogs = @($startupLog, $miladyStartupLog, $defaultStartupLog, $legacyStartupLog) | Select-Object -Unique`,
    },
    {
      pattern:
        /\$env:ELIZA_STARTUP_SESSION_ID = \$startupSessionId\r?\n(?:\$env:(?:ELIZA|MILADY)_STARTUP_SESSION_ID = \$startupSessionId\r?\n)*\$env:ELIZA_STARTUP_STATE_FILE = \$startupStateFile\r?\n(?:\$env:MILADY_STARTUP_STATE_FILE = \$startupStateFile\r?\n)?\$env:ELIZA_STARTUP_EVENTS_FILE = \$startupEventsFile\r?\n(?:\$env:MILADY_STARTUP_EVENTS_FILE = \$startupEventsFile\r?\n)?/,
      replacement: `$env:ELIZA_STARTUP_SESSION_ID = $startupSessionId
$env:MILADY_STARTUP_SESSION_ID = $startupSessionId
$env:ELIZA_STARTUP_STATE_FILE = $startupStateFile
$env:ELIZA_STARTUP_EVENTS_FILE = $startupEventsFile
$env:MILADY_STARTUP_STATE_FILE = $startupStateFile
$env:MILADY_STARTUP_EVENTS_FILE = $startupEventsFile
`,
    },
    {
      pattern:
        /\$installerRoot = if \(\$env:(?:MILADY|ELIZA)_TEST_WINDOWS_INSTALL_DIR\) \{\r?\n {2}\$env:(?:MILADY|ELIZA)_TEST_WINDOWS_INSTALL_DIR\r?\n\}(?: elseif \(\$env:ELIZA_TEST_WINDOWS_INSTALL_DIR\) \{\r?\n(?: {2}# .*\r?\n)* {2}\$env:ELIZA_TEST_WINDOWS_INSTALL_DIR\r?\n\})? else \{\r?\n {2}Join-Path \$tempRoot \("(?:milady(?:-windows)?|eliza-windows)-installed-" \+ \[Guid\]::NewGuid\(\)\.ToString\("N"\)(?:\.Substring\(0, 8\))?\)\r?\n\}/,
      replacement: `$installerRoot = if ($env:MILADY_TEST_WINDOWS_INSTALL_DIR) {
  $env:MILADY_TEST_WINDOWS_INSTALL_DIR
} elseif ($env:ELIZA_TEST_WINDOWS_INSTALL_DIR) {
  # The release workflow exports ELIZA_TEST_WINDOWS_INSTALL_DIR for legacy
  # contract compatibility; accept either prefix so a short, MAX_PATH-safe
  # install dir actually flows through to the Inno /DIR override on CI.
  $env:ELIZA_TEST_WINDOWS_INSTALL_DIR
} else {
  Join-Path $tempRoot ("milady-installed-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
}`,
    },
  ]) {
    const result = replaceRequiredBlock(
      nextText,
      patch.pattern,
      patch.replacement,
    );
    if (!result.matched) {
      return { matched: false, text };
    }
    nextText = result.text;
  }

  const startupLogsDiagnostics = `  Write-Host ""
  Write-Host "[4c/6] Startup logs:"
  foreach ($candidateLog in $startupLogs) {
    Write-Host "--- $candidateLog ---"
    if (Test-Path $candidateLog) {
      Get-Content $candidateLog -Tail 400 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    } else {
      Write-Host "(startup log not found)"
    }
    Write-Host "--- end $candidateLog ---"
  }

`;
  if (!nextText.includes('  Write-Host "[4c/6] Startup logs:"')) {
    const firewallMarker = "  # 5. Firewall state for port";
    if (!nextText.includes(firewallMarker)) {
      return { matched: false, text };
    }
    nextText = nextText.replace(
      firewallMarker,
      `${startupLogsDiagnostics}${firewallMarker}`,
    );
  }

  const fatalThrow =
    '      throw "Windows packaged app reported a fatal startup phase."';
  const fatalWithDiagnostics = `      Dump-FailureDiagnostics $BackendPort
${fatalThrow}`;
  if (!nextText.includes(fatalWithDiagnostics)) {
    if (!nextText.includes(fatalThrow)) {
      return { matched: false, text };
    }
    nextText = nextText.replace(fatalThrow, fatalWithDiagnostics);
  }

  return { matched: true, text: nextText };
}

function patchLazyStewardRuntimeImports(text) {
  const usesCrLf = text.includes("\r\n");
  const originalText = text;
  let nextText = text.replace(/\r\n/g, "\n");

  const eagerImports = `import { saveStewardCredentials } from "@elizaos/app-core/services/steward-credentials";
import {
  createDesktopStewardSidecar,
  type StewardSidecar,
  type StewardSidecarStatus,
} from "@elizaos/app-core/services/steward-sidecar";`;
  const lazyImports = `import type {
  StewardSidecar,
  StewardSidecarStatus,
} from "@elizaos/app-core/services/steward-sidecar";`;

  if (!nextText.includes(lazyImports)) {
    if (!nextText.includes(eagerImports)) {
      return { matched: false, text: originalText };
    }
    nextText = nextText.replace(eagerImports, lazyImports);
  }

  const moduleLoaderBlock = `// Lazy runtime imports
// ---------------------------------------------------------------------------

type StewardSidecarModule = typeof import(
  "@elizaos/app-core/services/steward-sidecar"
);
type StewardCredentialsModule = typeof import(
  "@elizaos/app-core/services/steward-credentials"
);

let stewardSidecarModulePromise: Promise<StewardSidecarModule> | null = null;
let stewardCredentialsModulePromise: Promise<StewardCredentialsModule> | null =
  null;

function loadStewardSidecarModule(): Promise<StewardSidecarModule> {
  stewardSidecarModulePromise ??= import(
    "@elizaos/app-core/services/steward-sidecar"
  );
  return stewardSidecarModulePromise;
}

function loadStewardCredentialsModule(): Promise<StewardCredentialsModule> {
  stewardCredentialsModulePromise ??= import(
    "@elizaos/app-core/services/steward-credentials"
  );
  return stewardCredentialsModulePromise;
}

`;
  if (!nextText.includes("function loadStewardSidecarModule()")) {
    const singletonMarker =
      "// Singleton\n// ---------------------------------------------------------------------------\n\n";
    if (!nextText.includes(singletonMarker)) {
      return { matched: false, text: originalText };
    }
    nextText = nextText.replace(
      singletonMarker,
      moduleLoaderBlock + singletonMarker,
    );
  }

  const getSidecarBefore = `export function getStewardSidecar(): StewardSidecar {
  if (!sidecar) {
    sidecar = createDesktopStewardSidecar({`;
  const getSidecarAfter = `export async function getStewardSidecar(): Promise<StewardSidecar> {
  if (!sidecar) {
    const { createDesktopStewardSidecar } = await loadStewardSidecarModule();
    sidecar = createDesktopStewardSidecar({`;
  if (!nextText.includes(getSidecarAfter)) {
    if (!nextText.includes(getSidecarBefore)) {
      return { matched: false, text: originalText };
    }
    nextText = nextText.replace(getSidecarBefore, getSidecarAfter);
  }

  nextText = nextText.replace(
    "function configureStewardEnvFromCredentials(): void {",
    "async function configureStewardEnvFromCredentials(): Promise<void> {",
  );

  const saveCredentialsBefore = `    try {
      saveStewardCredentials({`;
  const saveCredentialsAfter = `    try {
      const { saveStewardCredentials } = await loadStewardCredentialsModule();
      saveStewardCredentials({`;
  if (!nextText.includes(saveCredentialsAfter)) {
    if (!nextText.includes(saveCredentialsBefore)) {
      return { matched: false, text: originalText };
    }
    nextText = nextText.replace(saveCredentialsBefore, saveCredentialsAfter);
  }

  nextText = nextText.replace(
    "  const steward = getStewardSidecar();",
    "  const steward = await getStewardSidecar();",
  );
  nextText = nextText.replace(
    "    configureStewardEnvFromCredentials();",
    "    await configureStewardEnvFromCredentials();",
  );
  nextText = nextText.replace(
    "  configureStewardEnvFromCredentials();",
    "  await configureStewardEnvFromCredentials();",
  );

  if (
    nextText.includes(
      'import { saveStewardCredentials } from "@elizaos/app-core/services/steward-credentials";',
    ) ||
    nextText.includes("  createDesktopStewardSidecar,\n  type StewardSidecar")
  ) {
    return { matched: false, text: originalText };
  }

  return {
    matched: true,
    text: usesCrLf ? nextText.replace(/\n/g, "\r\n") : nextText,
  };
}

function patchTelegramSessionEsmImport(text) {
  let result = replaceRequiredBlock(
    text,
    /import \{ StringSession \} from "telegram\/sessions";/,
    'import { StringSession } from "telegram/sessions/index.js";',
  );
  if (!result.matched) {
    return result;
  }

  result = replaceRequiredBlock(
    result.text,
    /return (?:(?:\(client\.session as StringSession\))|(?:client\.session))\.save\(\);/,
    "return (client.session as unknown as StringSession).save();",
  );
  return result;
}

function patchMacosArtifactStager(text) {
  let result = replaceRequiredBlock(
    text,
    /TARBALL_PATH="\$\(find -L "\$ARTIFACTS_DIR" -maxdepth 1 -type f -name "\*-macos-\*\.app\.tar\.zst" \| sort \| head -1\)"/,
    `TARBALL_PATH=""
for tarball_pattern in "*-macos-*.app.tar.zst" "*-macos-*.app.tar.gz" "*-macos-*.tar.gz"; do
  TARBALL_PATH="$(find -L "$ARTIFACTS_DIR" -maxdepth 1 -type f -name "$tarball_pattern" | sort | head -1)"
  if [[ -n "$TARBALL_PATH" ]]; then
    break
  fi
done`,
  );
  if (!result.matched) {
    return result;
  }

  result = replaceRequiredBlock(
    result.text,
    /echo "Using updater tarball: \$TARBALL_PATH"\r?\ntar --zstd -xf "\$TARBALL_PATH" -C "\$EXTRACT_DIR"/,
    `echo "Using updater tarball: $TARBALL_PATH"
TARBALL_BASENAME="$(basename "$TARBALL_PATH")"
case "$TARBALL_BASENAME" in
  *.tar.zst)
    tar --zstd -xf "$TARBALL_PATH" -C "$EXTRACT_DIR"
    ;;
  *.tar.gz)
    tar -xzf "$TARBALL_PATH" -C "$EXTRACT_DIR"
    ;;
  *)
    echo "stage-macos-release-artifacts: unsupported macOS updater tarball: $TARBALL_BASENAME"
    exit 1
    ;;
esac`,
  );
  if (!result.matched) {
    return result;
  }

  result = replaceRequiredBlock(
    result.text,
    /FINAL_DMG_NAME="\$\(basename "\$\{TARBALL_PATH%\.app\.tar\.zst\}\.dmg"\)"/,
    `case "$TARBALL_BASENAME" in
  *.app.tar.zst)
    FINAL_DMG_NAME="\${TARBALL_BASENAME%.app.tar.zst}.dmg"
    ;;
  *.app.tar.gz)
    FINAL_DMG_NAME="\${TARBALL_BASENAME%.app.tar.gz}.dmg"
    ;;
  *.tar.gz)
    FINAL_DMG_NAME="\${TARBALL_BASENAME%.tar.gz}.dmg"
    ;;
  *)
    echo "stage-macos-release-artifacts: unsupported macOS updater tarball: $TARBALL_BASENAME"
    exit 1
    ;;
esac`,
  );
  return result;
}

const replacements = [
  {
    file: "eliza/packages/app-core/platforms/electrobun/src/startup-trace.ts",
    description: "restore MILADY startup trace env fallback",
    transform: restoreStartupTraceEnvFallback,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "restore Windows smoke release contract",
    transform: patchWindowsSmokeScript,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/src/native/steward.ts",
    description: "lazy-load Steward sidecar runtime imports",
    transform: patchLazyStewardRuntimeImports,
  },
  {
    file: "eliza/packages/agent/src/services/telegram-account-auth.ts",
    description: "use explicit Telegram sessions ESM import",
    transform: patchTelegramSessionEsmImport,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh",
    description: "support gzip macOS release tarball staging",
    transform: patchMacosArtifactStager,
  },
];

let changed = 0;
let verified = 0;

for (const replacement of replacements) {
  const absolutePath = path.join(repoRoot, replacement.file);
  let text = fs.readFileSync(absolutePath, "utf8");

  if (typeof replacement.transform === "function") {
    const result = replacement.transform(text);
    if (!result.matched) {
      throw new Error(
        `${replacement.description}: patch anchor not found in ${replacement.file}`,
      );
    }

    if (result.text === text || checkOnly) {
      verified += 1;
      continue;
    }

    fs.writeFileSync(absolutePath, result.text);
    changed += 1;
    continue;
  }

  if (text.includes(replacement.after)) {
    verified += 1;
    continue;
  }

  if (!text.includes(replacement.before)) {
    throw new Error(
      `${replacement.description}: patch anchor not found in ${replacement.file}`,
    );
  }

  if (checkOnly) {
    verified += 1;
    continue;
  }

  text = text.replace(replacement.before, replacement.after);
  fs.writeFileSync(absolutePath, text);
  changed += 1;
}

const mode = checkOnly ? "check" : "patch";
console.log(
  `[patch-eliza-electrobun-windows-smoke-startup] ${mode} ok; ${changed} changed, ${verified} verified`,
);
