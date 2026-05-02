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

const replacements = [
  {
    file: "eliza/packages/app-core/platforms/electrobun/src/startup-trace.ts",
    description: "restore MILADY startup trace env fallback",
    transform: restoreStartupTraceEnvFallback,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "export legacy appdata paths for later release steps",
    before: `if ($env:GITHUB_ENV) {
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "PGLITE_DATA_DIR=$pgliteDataDir"
}`,
    after: `if ($env:GITHUB_ENV) {
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "PGLITE_DATA_DIR=$pgliteDataDir"
}`,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "restore all known startup log locations",
    before: `# Milady writes its startup log to AppData\\Roaming\\Milady on Windows, but the
# release workflow still exports the legacy Eliza paths/env vars for contract
# compatibility.
$legacyStartupLog = Join-Path $env:APPDATA "Eliza\\\\eliza-startup.log"
$startupLog = Join-Path $env:APPDATA "Milady\\\\milady-startup.log"
$startupLogs = @($startupLog, $legacyStartupLog) | Select-Object -Unique`,
    after: `# Packaged builds can still use the default elizaOS brand config before Milady
# overrides are loaded, so include all known startup log locations.
$legacyStartupLog = Join-Path $env:APPDATA "Eliza\\\\eliza-startup.log"
$defaultStartupLog = Join-Path $env:APPDATA "elizaOS\\\\eliza-startup.log"
$miladyStartupLog = Join-Path $env:APPDATA "Milady\\\\eliza-startup.log"
$startupLog = Join-Path $env:APPDATA "Milady\\\\milady-startup.log"
$startupLogs = @($startupLog, $miladyStartupLog, $defaultStartupLog, $legacyStartupLog) | Select-Object -Unique`,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "propagate startup trace paths under both env prefixes",
    before: `$env:ELIZA_STARTUP_SESSION_ID = $startupSessionId
$env:MILADY_STARTUP_SESSION_ID = $startupSessionId
$env:MILADY_STARTUP_STATE_FILE = $startupStateFile
$env:MILADY_STARTUP_EVENTS_FILE = $startupEventsFile`,
    after: `$env:ELIZA_STARTUP_SESSION_ID = $startupSessionId
$env:MILADY_STARTUP_SESSION_ID = $startupSessionId
$env:ELIZA_STARTUP_STATE_FILE = $startupStateFile
$env:ELIZA_STARTUP_EVENTS_FILE = $startupEventsFile
$env:MILADY_STARTUP_STATE_FILE = $startupStateFile
$env:MILADY_STARTUP_EVENTS_FILE = $startupEventsFile`,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "accept legacy installer install dir env",
    before: `$installerRoot = if ($env:MILADY_TEST_WINDOWS_INSTALL_DIR) {
  $env:MILADY_TEST_WINDOWS_INSTALL_DIR
} else {
  Join-Path $tempRoot ("milady-windows-installed-" + [Guid]::NewGuid().ToString("N"))
}`,
    after: `$installerRoot = if ($env:MILADY_TEST_WINDOWS_INSTALL_DIR) {
  $env:MILADY_TEST_WINDOWS_INSTALL_DIR
} elseif ($env:ELIZA_TEST_WINDOWS_INSTALL_DIR) {
  $env:ELIZA_TEST_WINDOWS_INSTALL_DIR
} else {
  Join-Path $tempRoot ("milady-windows-installed-" + [Guid]::NewGuid().ToString("N"))
}`,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "dump startup logs on smoke failure",
    before: `  Write-Host "[4b/6] Startup trace events:"
  if (Test-Path $startupEventsFile) {
    Get-Content $startupEventsFile -Tail 200 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host "(startup events file not found)"
  }

  # 5. Firewall state for port`,
    after: `  Write-Host "[4b/6] Startup trace events:"
  if (Test-Path $startupEventsFile) {
    Get-Content $startupEventsFile -Tail 200 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host "(startup events file not found)"
  }

  Write-Host ""
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

  # 5. Firewall state for port`,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "dump diagnostics before fatal startup throw",
    before: `    if ($startupState -and $startupState.phase -eq "fatal") {
      Write-Host "Startup trace entered fatal phase:"
      $startupState | ConvertTo-Json -Depth 6 | Write-Host
      throw "Windows packaged app reported a fatal startup phase."
    }`,
    after: `    if ($startupState -and $startupState.phase -eq "fatal") {
      Write-Host "Startup trace entered fatal phase:"
      $startupState | ConvertTo-Json -Depth 6 | Write-Host
      Dump-FailureDiagnostics $BackendPort
      throw "Windows packaged app reported a fatal startup phase."
    }`,
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
