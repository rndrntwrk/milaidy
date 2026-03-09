import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = process.env.FIVE55_BASE_URL || "http://127.0.0.1:3100";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_OUT_DIR = path.resolve(__dirname, "..", "output", "playwright");
const LOCAL_GAMES_CONFIG_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "555-mono",
  "apps",
  "web",
  "lib",
  "games-config.ts",
);
const LOCAL_ARCADE_MASTERY_REGISTRY_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "arcade-plugin",
  "dist",
  "mastery",
  "registry.js",
);

const TARGETS = [
  { canonical: "knighthood", catalogId: "knighthood" },
  { canonical: "sector-13", catalogId: "sector-13" },
  { canonical: "ninja", catalogId: "ninja-evilcorp" },
  { canonical: "clawstrike", catalogId: "clawstrike" },
  { canonical: "555drive", catalogId: "drive" },
  { canonical: "chesspursuit", catalogId: "chesspursuit" },
  { canonical: "wolf-and-sheep", catalogId: "wolf-and-sheep" },
  { canonical: "leftandright", catalogId: "leftandright" },
  { canonical: "playback", catalogId: "playback" },
  { canonical: "fighter-planes", catalogId: "fighter-planes" },
  { canonical: "floor13", catalogId: "floor13" },
  { canonical: "godai-is-back", catalogId: "godai-is-back" },
  { canonical: "peanball", catalogId: "peanball" },
  { canonical: "eat-my-dust", catalogId: "eat-my-dust" },
  { canonical: "where-were-going-we-do-need-roads", catalogId: "where-were-going-we-do-need-roads" },
  { canonical: "vedas-run", catalogId: "vedas-run" },
];

const GLOBAL_IGNORED_PAGE_ERROR_PATTERNS = [
  /play\(\) failed because the user didn't interact with the document first/i,
];

const GLOBAL_IGNORED_CONSOLE_ERROR_PATTERNS = [
  /Failed to load resource: the server responded with a status of 500/i,
  /Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES/i,
];

const GAME_IGNORED_CONSOLE_RULES = {
  playback: [
    { text: /failed to load resource/i, url: /\/games\/beta\/playback\/build\/out\.js/i },
  ],
  "godai-is-back": [
    { text: /failed to load resource/i, url: /\/socket\.io\/socket\.io\.js/i },
  ],
};

const GAME_IGNORED_PAGE_ERROR_RULES = {
  ninja: [
    /G\._e\.cO is not a function/i,
  ],
  playback: [
    /number \d+ is not iterable/i,
  ],
};

const VISIT_PATH_OVERRIDES = {
  "555drive": "/games/555drive/index.html",
};

const MASTERED_LABEL = "Mastered";
const NEEDS_WORK_LABEL = "Needs Work";
const DEFERRED_LABEL = "Deferred";
const DEFAULT_EVAL_TIMEOUT_MS = Number(process.env.FIVE55_SMOKE_EVAL_TIMEOUT_MS || 1800);
const DEFAULT_SCREENSHOT_TIMEOUT_MS = Number(process.env.FIVE55_SMOKE_SCREENSHOT_TIMEOUT_MS || 4000);
const DEFAULT_BROWSER_CLOSE_TIMEOUT_MS = Number(process.env.FIVE55_SMOKE_BROWSER_CLOSE_TIMEOUT_MS || 5000);
const DEFAULT_PAGE_CLOSE_TIMEOUT_MS = Number(process.env.FIVE55_SMOKE_PAGE_CLOSE_TIMEOUT_MS || 5000);

const MASTERY_PROFILES = {
  knighthood: {
    objective: "Reach true mastery score in active combat loops (score > 5000).",
    primaryMetric: "score",
    progressStep: 80,
    gameplayDurationMs: 600_000,
    highScoreGate: {
      metric: "score",
      minMax: 5001,
      description: "Hard gate: peak score > 5000",
    },
    antiStall: {
      metric: "score",
      progressStep: 90,
      maxNoProgressMs: 7_000,
      minProgressEvents: 20,
      maxNoMovementMs: 7_500,
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "score", 5001, "Peak score exceeded 5000"),
      checkMetricDelta(stats, "score", 1200, "Score delta >= 1200"),
      checkTravel(stats, 1200, "Sustained movement/combat traversal"),
    ],
  },
  "sector-13": {
    objective: "Reach sector 7 or higher with sustained combat progression.",
    primaryMetric: "sector",
    progressStep: 1,
    gameplayDurationMs: 210_000,
    levelGate: {
      metric: "sector",
      totalStages: 13,
      indexBase: 1,
      minFraction: 0.5,
      description: "Hard gate: reach at least sector 7/13",
    },
    highScoreGate: {
      metric: "score",
      minMax: 2000,
      description: "Quality gate: peak score >= 2000",
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "sector", 7, "Reached sector >= 7"),
      checkMetricDelta(stats, "score", 400, "Score increased by >= 400"),
      checkMetricMax(stats, "lives", 1, "Entered live combat state with at least one life"),
    ],
  },
  ninja: {
    objective: "Reach level 8+ through true runtime progression.",
    primaryMetric: "level",
    progressStep: 1,
    gameplayDurationMs: 480_000,
    levelGate: {
      metric: "level",
      overrideTarget: 8,
      description: "Hard gate: level index >= 8",
    },
    highScoreGate: {
      metric: "score",
      minMax: 3500,
      description: "Quality gate: score proxy >= 3500",
    },
    antiStall: {
      metric: "level",
      progressStep: 1,
      maxNoProgressMs: 16_000,
      minProgressEvents: 6,
      maxNoMovementMs: 12_000,
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "level", 8, "Reached level >= 8"),
      checkMetricMax(stats, "score", 3500, "Runtime score reflects level progression"),
      checkTravel(stats, 1200, "High traversal distance >= 1200"),
    ],
  },
  clawstrike: {
    objective: "Reach level 7+ with sustained combat progression.",
    primaryMetric: "score",
    progressStep: 2,
    gameplayDurationMs: 420_000,
    levelGate: {
      metric: "level",
      overrideTarget: 7,
      description: "Hard gate: reach at least level index 7",
    },
    highScoreGate: {
      metric: "score",
      minMax: 240,
      description: "Quality gate: runtime score >= 240",
    },
    antiStall: {
      metric: "level",
      progressStep: 1,
      maxNoProgressMs: 20_000,
      minProgressEvents: 5,
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "level", 7, "Reached level >= 7"),
      checkMetricMax(stats, "score", 240, "Runtime score reached >= 240"),
      checkTravel(stats, 900, "Player movement distance >= 900"),
    ],
  },
  "555drive": {
    objective: "Sustain road progression and hit checkpoint/level momentum.",
    primaryMetric: "score",
    progressStep: 60,
    gameplayDurationMs: 140_000,
    highScoreGate: {
      metric: "score",
      minMax: 15_000,
      description: "Half-level proxy gate: distance score >= 15000",
    },
    antiStall: {
      metric: "score",
      maxNoProgressMs: 30_000,
      minProgressEvents: 3,
      maxNoMovementMs: 50_000,
    },
    evaluate: (stats) => [
      checkMetricDelta(stats, "score", 120, "Distance score increased by >= 120"),
      checkAny("drive_level", "Reached checkpoint tier or strong distance gain", [
        checkMetricMax(stats, "level", 1, "Level index reached >= 1"),
        checkMetricMax(stats, "score", 200, "Peak score reached >= 200"),
      ]),
    ],
  },
  chesspursuit: {
    objective: "Establish real board progression (no static board/menu pass).",
    primaryMetric: "score",
    progressStep: 25,
    gameplayDurationMs: 180_000,
    highScoreGate: {
      metric: "score",
      minMax: 250,
      description: "Quality gate: peak score >= 250",
    },
    antiStall: {
      metric: "score",
      maxNoProgressMs: 12_000,
      minProgressEvents: 8,
    },
    evaluate: (stats) => [
      checkAny("chess_progression", "Board/checkpoint progression observed", [
        checkMetricDelta(stats, "score", 120, "Score increased by >= 120"),
        checkMetricMax(stats, "checkpoint", 2, "Reached checkpoint >= 2"),
        checkMetricDelta(stats, "progressRow", 25, "Advanced board rows by >= 25"),
      ]),
      checkMetricMax(stats, "checkpoint", 2, "Reached checkpoint >= 2"),
    ],
  },
  "wolf-and-sheep": {
    objective: "Trap at least 2 wolves via block-push mechanics.",
    primaryMetric: "wolvesTrapped",
    progressStep: 1,
    gameplayDurationMs: 240_000,
    highScoreGate: {
      metric: "wolvesTrapped",
      minMax: 2,
      description: "Hard gate: trapped wolves >= 2",
    },
    antiStall: {
      metric: "score",
      maxNoProgressMs: 10_000,
      minProgressEvents: 8,
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "wolvesTrapped", 2, "Trapped at least 2 wolves"),
      checkMetricDelta(stats, "score", 12, "Move score increased by >= 12"),
      checkTravel(stats, 40, "Grid traversal distance >= 40"),
    ],
  },
  leftandright: {
    objective: "Survive for >= 60s with zero wrong-coin/game-over events.",
    primaryMetric: "survivalSec",
    progressStep: 3,
    gameplayDurationMs: 90_000,
    highScoreGate: {
      metric: "score",
      minMax: 4,
      description: "Quality gate: peak score >= 4",
    },
    antiStall: {
      metric: "score",
      maxNoProgressMs: 20_000,
      minProgressEvents: 2,
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "survivalSec", 60, "Survived >= 60 seconds"),
      checkMetricMaxLte(stats, "wrongCoinCount", 0, "Wrong coin count stayed at 0"),
      checkMetricMaxLte(stats, "gameOverCount", 0, "No game-over events during run"),
    ],
  },
  playback: {
    objective: "Leave blank/start states and progress rooms/time with native telemetry.",
    primaryMetric: "worldAge",
    progressStep: 80,
    gameplayDurationMs: 240_000,
    highScoreGate: {
      metric: "score",
      minMax: 120,
      description: "Quality gate: peak score >= 120",
    },
    antiStall: {
      metric: "worldAge",
      progressStep: 120,
      maxNoProgressMs: 12_000,
      minProgressEvents: 14,
    },
    evaluate: (stats) => [
      checkMetricDelta(stats, "worldAge", 1800, "World age progressed by >= 1800 ticks"),
      checkAny("playback_objective", "Progressed room/index/score", [
        checkMetricMax(stats, "localIndex", 35, "Local index reached >= 35"),
        checkMetricMax(stats, "roomTransitions", 2, "Room transitions >= 2"),
        checkMetricDelta(stats, "score", 60, "Score increased by >= 60"),
      ]),
    ],
  },
  "fighter-planes": {
    objective: "Demonstrate active flight control + aiming + sustained combat survival.",
    primaryMetric: "score",
    progressStep: 25,
    gameplayDurationMs: 180_000,
    highScoreGate: {
      metric: "score",
      minMax: 25,
      description: "Quality gate: peak score >= 25",
    },
    antiStall: {
      metric: "score",
      progressStep: 6,
      maxNoProgressMs: 24_000,
      minProgressEvents: 6,
    },
    evaluate: (stats) => [
      checkMetricDelta(stats, "score", 20, "Score increased by >= 20"),
      checkTravel(stats, 1600, "Plane movement distance >= 1600"),
    ],
  },
  floor13: {
    objective: "Reach floor >= 5 with active combat/traversal.",
    primaryMetric: "level",
    progressStep: 1,
    gameplayDurationMs: 240_000,
    levelGate: {
      metric: "level",
      overrideTarget: 5,
      description: "Temporary hard gate: reach floor >= 5",
    },
    highScoreGate: {
      metric: "level",
      minMax: 5,
      description: "Hard gate: floor >= 5",
    },
    antiStall: {
      metric: "level",
      maxNoProgressMs: 40_000,
      minProgressEvents: 4,
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "level", 5, "Floor index reached >= 5"),
      checkTravel(stats, 120, "Traversal activity observed"),
    ],
  },
  "godai-is-back": {
    objective: "Deferred: multiplayer gate pending.",
    deferred: true,
    primaryMetric: "score",
    progressStep: 12,
    gameplayDurationMs: 20_000,
    evaluate: () => [],
  },
  peanball: {
    objective: "Launch stable pinball loop and clear ring/score targets.",
    primaryMetric: "score",
    progressStep: 20,
    gameplayDurationMs: 120_000,
    highScoreGate: {
      metric: "score",
      minMax: 1_500,
      description: "High-score gate: peak score >= 1500",
    },
    antiStall: {
      metric: "score",
      maxNoProgressMs: 6_500,
      minProgressEvents: 6,
    },
    evaluate: (stats) => [
      checkAny("peanball_progression", "Cleared rings or increased score", [
        checkMetricDecrease(stats, "ringsRemaining", 1, "Cleared at least one ring"),
        checkMetricDelta(stats, "score", 40, "Score increased by >= 40"),
      ]),
      checkMetricMax(stats, "boost", 1, "Boost system engaged"),
    ],
  },
  "eat-my-dust": {
    objective: "Type through phrases with sustained cursor + score progression.",
    primaryMetric: "localIndex",
    progressStep: 8,
    gameplayDurationMs: 90_000,
    highScoreGate: {
      metric: "score",
      minMax: 60,
      description: "High-score gate: race score >= 60",
    },
    antiStall: {
      metric: "localIndex",
      maxNoProgressMs: 6_000,
      minProgressEvents: 6,
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "localIndex", 20, "Local cursor reached >= 20"),
      checkMetricDelta(stats, "score", 15, "Race score increased by >= 15"),
    ],
  },
  "where-were-going-we-do-need-roads": {
    objective: "Maintain valid road shaping with no buried/invalid placement states.",
    primaryMetric: "score",
    progressStep: 120,
    gameplayDurationMs: 180_000,
    highScoreGate: {
      metric: "score",
      minMax: 2_200,
      description: "High-score gate: distance score >= 2200",
    },
    antiStall: {
      metric: "score",
      maxNoProgressMs: 6_000,
      minProgressEvents: 6,
    },
    evaluate: (stats) => [
      checkMetricDelta(stats, "score", 1500, "Distance increased by >= 1500"),
      checkAny("roads_pathing", "Trajectory or distance progression observed", [
        checkTravel(stats, 120, "Player trajectory changed continuously"),
        checkMetricDelta(stats, "distance", 1500, "Distance metric increased by >= 1500"),
      ]),
      checkMetricMaxLte(stats, "invalidPlacementCount", 0, "No invalid/buried road placements"),
    ],
  },
  "vedas-run": {
    objective: "Reach segment >= 7 with stable route progression.",
    primaryMetric: "segment",
    progressStep: 1,
    gameplayDurationMs: 300_000,
    levelGate: {
      metric: "segment",
      overrideTarget: 7,
      description: "Hard gate: segment >= 7",
    },
    highScoreGate: {
      metric: "segment",
      minMax: 7,
      description: "Hard gate: segment >= 7",
    },
    antiStall: {
      metric: "segment",
      progressStep: 1,
      maxNoProgressMs: 22_000,
      minProgressEvents: 5,
    },
    evaluate: (stats) => [
      checkMetricMax(stats, "segment", 7, "Reached segment >= 7"),
      checkAny("vedas_progression", "Advanced runner depth", [
        checkMetricDelta(stats, "tz", 300, "tz progressed by >= 300"),
        checkMetricDelta(stats, "score", 120, "Score increased by >= 120"),
      ]),
      checkTravel(stats, 220, "Player moved across lanes"),
    ],
  },
};

const execFileAsync = promisify(execFile);
let masteryRegistryModulePromise = null;

async function loadMasteryRegistryModule() {
  if (!masteryRegistryModulePromise) {
    masteryRegistryModulePromise = import(
      pathToFileURL(LOCAL_ARCADE_MASTERY_REGISTRY_PATH).href
    ).catch(() => null);
  }
  return masteryRegistryModulePromise;
}

function summarizeAtomicMetricCoverage(atomicAudit) {
  const metricSourceMap = Array.isArray(atomicAudit?.metricSourceMap)
    ? atomicAudit.metricSourceMap
    : [];
  if (metricSourceMap.length === 0) return "missing";
  const coverages = metricSourceMap.map((entry) => String(entry?.coverage || ""));
  const coveredCount = coverages.filter((value) => value && value !== "missing").length;
  if (coveredCount === 0) return "missing";
  if (coveredCount === metricSourceMap.length) return "complete";
  return "partial";
}

async function readAtomicAuditMeta(canonical) {
  const module = await loadMasteryRegistryModule();
  if (!module || typeof module.getMasteryContractOrNull !== "function") {
    return {
      auditComplete: false,
      auditStatus: "pending",
      blockingSubsystem: null,
      controllerMode: null,
      nativeMetricCoverage: "missing",
      currentFailureReason: null,
      boundedGate: null,
    };
  }
  const contract = module.getMasteryContractOrNull(canonical);
  const atomicAudit = contract?.atomicAudit || null;
  const auditStatus = String(atomicAudit?.auditStatus || "pending");
  return {
    auditComplete: ["audited", "closed", "regression-only", "deferred"].includes(auditStatus),
    auditStatus,
    blockingSubsystem: atomicAudit?.controllerDesign?.currentBlockingSubsystem || null,
    controllerMode: atomicAudit?.controllerDesign?.mode || null,
    nativeMetricCoverage: summarizeAtomicMetricCoverage(atomicAudit),
    currentFailureReason: atomicAudit?.objectiveModel?.currentFailureReason || null,
    boundedGate: atomicAudit?.controllerDesign?.boundedGate || null,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const envGames = String(process.env.FIVE55_SMOKE_GAMES || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const config = {
    baseUrl: DEFAULT_BASE_URL,
    outDir: process.env.FIVE55_SMOKE_OUT_DIR || DEFAULT_OUT_DIR,
    timeoutMs: Number(process.env.FIVE55_SMOKE_TIMEOUT_MS || 45_000),
    settleMs: Number(process.env.FIVE55_SMOKE_SETTLE_MS || 3_500),
    postProbeWaitMs: Number(process.env.FIVE55_SMOKE_POST_PROBE_WAIT_MS || 1_200),
    gameplayDurationMs: Number(process.env.FIVE55_SMOKE_GAMEPLAY_MS || 12_000),
    sampleIntervalMs: Number(process.env.FIVE55_SMOKE_SAMPLE_INTERVAL_MS || 260),
    forceGameplayDurationMs: Number(process.env.FIVE55_SMOKE_FORCE_GAMEPLAY_MS || 0) || null,
    evalTimeoutMs: DEFAULT_EVAL_TIMEOUT_MS,
    screenshotTimeoutMs: DEFAULT_SCREENSHOT_TIMEOUT_MS,
    headless: process.env.FIVE55_SMOKE_HEADFUL === "1" ? false : true,
    strictErrors: process.env.FIVE55_SMOKE_STRICT_ERRORS === "1",
    maxPageErrors: Number(process.env.FIVE55_SMOKE_MAX_PAGE_ERRORS || 0),
    maxConsoleErrors: Number(process.env.FIVE55_SMOKE_MAX_CONSOLE_ERRORS || 0),
    failOnFailure: process.env.FIVE55_SMOKE_FAIL_ON_FAILURE === "0" ? false : true,
    requireMastery: process.env.FIVE55_SMOKE_REQUIRE_MASTERY === "1",
    games: envGames,
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--base-url") {
      config.baseUrl = args[i + 1] || config.baseUrl;
      i += 1;
      continue;
    }
    if (token === "--out-dir") {
      config.outDir = args[i + 1] || config.outDir;
      i += 1;
      continue;
    }
    if (token === "--headful") {
      config.headless = false;
      continue;
    }
    if (token === "--strict-errors") {
      config.strictErrors = true;
      continue;
    }
    if (token === "--lenient-errors") {
      config.strictErrors = false;
      continue;
    }
    if (token === "--no-fail") {
      config.failOnFailure = false;
      continue;
    }
    if (token === "--gameplay-ms") {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.gameplayDurationMs = parsed;
      }
      i += 1;
      continue;
    }
    if (token === "--sample-ms") {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 40) {
        config.sampleIntervalMs = parsed;
      }
      i += 1;
      continue;
    }
    if (token === "--force-gameplay-ms") {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        config.forceGameplayDurationMs = parsed;
      }
      i += 1;
      continue;
    }
    if (token === "--eval-timeout-ms") {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 200) {
        config.evalTimeoutMs = parsed;
      }
      i += 1;
      continue;
    }
    if (token === "--screenshot-timeout-ms") {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 200) {
        config.screenshotTimeoutMs = parsed;
      }
      i += 1;
      continue;
    }
    if (token === "--games") {
      config.games = String(args[i + 1] || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      i += 1;
      continue;
    }
    if (token === "--require-mastery") {
      config.requireMastery = true;
      continue;
    }
  }

  return config;
}

async function loadChromium() {
  const candidates = ["playwright", "@playwright/test"];
  for (const name of candidates) {
    try {
      const mod = await import(name);
      if (mod?.chromium) return mod.chromium;
    } catch {
      // try next
    }
  }
  throw new Error(
    "Missing Playwright runtime. Install `playwright` or `@playwright/test` in milaidy.",
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function isTransientNetworkError(err) {
  const code = err?.cause?.code || err?.code;
  return [
    "EPERM",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EHOSTUNREACH",
  ].includes(String(code || ""));
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err;
      if (!isTransientNetworkError(err) || attempt >= attempts) break;
      await sleep(250 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

function withAgentQuery(rawPath, baseUrl) {
  const url = new URL(String(rawPath || "/"), baseUrl);
  const params = url.searchParams;
  params.set("agent", "true");
  params.set("bot", "true");
  params.set("spectate", "1");
  params.set("agentId", "alice");
  params.set("masteryV2", "true");
  return url.toString();
}

async function fetchCatalog(baseUrl) {
  const endpoint = new URL("/api/games/catalog", baseUrl).toString();

  async function loadLocalCatalogFallback() {
    const source = await fs.readFile(LOCAL_GAMES_CONFIG_PATH, "utf8");
    const games = [];
    const objectPattern = /\{[\s\S]*?id:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'[\s\S]*?\}/g;
    let match;
    while ((match = objectPattern.exec(source))) {
      games.push({
        id: match[1],
        path: match[2],
      });
    }
    if (games.length === 0) {
      throw new Error(`local catalog fallback produced 0 games from ${LOCAL_GAMES_CONFIG_PATH}`);
    }
    return { games };
  }

  function shouldUseLocalCatalogFallback(errOrStatus) {
    const text = String(errOrStatus?.message || errOrStatus || "");
    return /catalog failed (404|405|501)\b/i.test(text)
      || /unsupported method/i.test(text)
      || /not found/i.test(text);
  }

  async function fetchCatalogViaCurl() {
    let lastError = null;
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        const { stdout } = await execFileAsync("curl", [
          "-fsS",
          "-X",
          "POST",
          endpoint,
          "-H",
          "content-type: application/json",
          "-d",
          JSON.stringify({ includeBeta: true }),
        ]);
        return JSON.parse(stdout);
      } catch (err) {
        lastError = err;
        await sleep(500);
      }
    }
    throw lastError;
  }

  let res;
  try {
    res = await fetchWithRetry(
      endpoint,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ includeBeta: true }),
      },
      3,
    );
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err;
    try {
      return await fetchCatalogViaCurl();
    } catch (curlErr) {
      if (!shouldUseLocalCatalogFallback(curlErr)) throw curlErr;
      console.warn(`[smoke] catalog local-fallback ${LOCAL_GAMES_CONFIG_PATH}`);
      return loadLocalCatalogFallback();
    }
  }
  if (!res.ok) {
    const raw = await res.text();
    const failure = new Error(`catalog failed ${res.status}: ${raw}`);
    if (shouldUseLocalCatalogFallback(failure)) {
      console.warn(`[smoke] catalog local-fallback ${LOCAL_GAMES_CONFIG_PATH}`);
      return loadLocalCatalogFallback();
    }
    throw failure;
  }
  return res.json();
}

function isIgnoredPageError(canonical, message) {
  if (GLOBAL_IGNORED_PAGE_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }
  const rules = GAME_IGNORED_PAGE_ERROR_RULES[canonical] || [];
  return rules.some((pattern) => pattern.test(message));
}

function isIgnoredConsoleError(canonical, entry) {
  const text = String(entry?.text || "");
  const url = String(entry?.location?.url || "");
  if (GLOBAL_IGNORED_CONSOLE_ERROR_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  const rules = GAME_IGNORED_CONSOLE_RULES[canonical] || [];
  for (const rule of rules) {
    const textOk = rule.text ? rule.text.test(text) : true;
    const urlOk = rule.url ? rule.url.test(url) : true;
    if (textOk && urlOk) return true;
  }
  return false;
}

function normalizeStatus(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "GAMEOVER") return "GAME_OVER";
  if (raw === "TITLE" || raw === "TITLE_MENU") return "MENU";
  if (raw === "RUNNING") return "PLAYING";
  if (raw === "") return "UNKNOWN";
  return raw;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function copyAsFlatObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" || typeof entry === "string" || typeof entry === "boolean") {
      out[key] = entry;
    }
  }
  return out;
}

async function probeFrame(frame, timeoutMs = DEFAULT_EVAL_TIMEOUT_MS) {
  try {
    return await withTimeout(frame.evaluate(() => {
      const asNumber = (...values) => {
        for (const value of values) {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) return parsed;
        }
        return null;
      };

      const socket = window.AliceSocket;
      const getState = () => {
        try {
          if (socket && typeof socket.getState === "function") {
            return socket.getState();
          }
          if (socket && typeof socket.state === "function") {
            return socket.state();
          }
        } catch {
          // ignore getState/state runtime faults
        }
        return null;
      };

      let state = getState();
      if (!state && window.__sector13State) {
        const s13 = window.__sector13State;
        state = {
          status: s13.gameOver ? "GAME_OVER" : (s13.shipEngaged ? "PLAYING" : "MENU"),
          score: Number(s13.score || 0),
          sector: Number(s13.currentSectorNumber || 1),
          lives: Number(s13.lives || 0),
          player: {
            x: Number(s13.playerX || 0),
            y: Number(s13.playerY || 0),
            position: {
              x: Number(s13.playerX || 0),
              y: Number(s13.playerY || 0),
            },
          },
        };
      }
      if (!state && typeof window.__level !== "undefined") {
        state = {
          status: "PLAYING",
          score: Number(window.__level || 0),
          level: Number(window.__level || 0),
        };
      }
      const status = (() => {
        const raw = String(state?.status || state?.phase || state?.state || "").trim().toUpperCase();
        if (raw === "GAMEOVER") return "GAME_OVER";
        if (raw === "TITLE" || raw === "TITLE_MENU") return "MENU";
        if (raw === "RUNNING") return "PLAYING";
        return raw || "UNKNOWN";
      })();

      const playerX = asNumber(
        state?.player?.x,
        state?.player?.position?.x,
        state?.heroX,
        window.x,
        window.player?.x,
        window.G?.player?.x,
        window.gs?.player?.x,
      );
      const playerY = asNumber(
        state?.player?.y,
        state?.player?.position?.y,
        state?.heroY,
        window.y,
        window.player?.y,
        window.G?.player?.y,
        window.gs?.player?.y,
      );

      const diagnostics = (() => {
        try {
          if (socket && typeof socket.getDiagnostics === "function") {
            return socket.getDiagnostics();
          }
        } catch {
          // ignore diagnostics faults
        }
        return null;
      })();

      return {
        ts: Date.now(),
        frameUrl: window.location.href,
        frameTitle: document.title || "",
        hasAliceSocket: Boolean(socket),
        hasCanvas: Boolean(document.querySelector("canvas")),
        aliceSocketKeys: socket && typeof socket === "object" ? Object.keys(socket).slice(0, 20) : [],
        bridge: {
          hasExecute: Boolean(socket && typeof socket.execute === "function"),
          hasGetState: Boolean(socket && typeof socket.getState === "function"),
          hasState: Boolean(socket && typeof socket.state === "function"),
          hasDiagnostics: Boolean(socket && typeof socket.getDiagnostics === "function"),
        },
        status,
        score: asNumber(
          state?.score,
          state?.distance,
          state?.tz,
          window.score,
          window.dist,
          window.distance,
          window.G?.state?.D,
          window.G?.g?.ja?.(),
          window.__sector13State?.score,
        ),
        metrics: {
          level: asNumber(state?.level, state?.levelNum, state?.levelIndex, window.__level, window.G?.runLevelIndex),
          sector: asNumber(state?.sector, state?.currentSectorNumber, window.__sector13State?.currentSectorNumber),
          lives: asNumber(state?.lives, window.__sector13State?.lives),
          ringsRemaining: asNumber(state?.ringsRemaining, window.sc?.length),
          energy: asNumber(state?.energy, window.G?.state?.E),
          worldAge: asNumber(state?.worldAge, window.worldAge),
          localIndex: asNumber(state?.localIndex),
          checkpoint: asNumber(state?.checkpoint, window.rb),
          progressRow: asNumber(state?.progressRow, window.xb),
          wolvesTrapped: asNumber(state?.wolvesTrapped),
          wrongCoinCount: asNumber(state?.wrongCoinCount),
          gameOverCount: asNumber(state?.gameOverCount),
          survivalSec: asNumber(state?.survivalSec),
          roomTransitions: asNumber(state?.roomTransitions),
          invalidPlacementCount: asNumber(state?.invalidPlacementCount),
          segment: asNumber(state?.segment),
          heroHp: asNumber(state?.heroHp),
          enemyHp: asNumber(state?.enemyHp),
          rocketCount: asNumber(Array.isArray(state?.rockets) ? state.rockets.length : null),
          enemyCount: asNumber(Array.isArray(state?.enemies) ? state.enemies.length : null),
          distance: asNumber(state?.distance, window.dist, window.distance),
          tz: asNumber(state?.tz, window.gs?.tz),
          iy: asNumber(state?.iy, window.gs?.iy),
          sprites: asNumber(state?.sprites),
          boost: asNumber(state?.boost, window.Ec),
        },
        player: {
          x: playerX,
          y: playerY,
        },
        stateSummary: state && typeof state === "object" && !Array.isArray(state)
          ? Object.fromEntries(
              Object.entries(state)
                .filter(([, value]) => {
                  if (value == null) return false;
                  const type = typeof value;
                  return type === "number" || type === "string" || type === "boolean";
                })
                .slice(0, 20),
            )
          : null,
        diagnosticsSummary: diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)
          ? Object.fromEntries(
              Object.entries(diagnostics)
                .filter(([, value]) => {
                  if (value == null) return false;
                  const type = typeof value;
                  return type === "number" || type === "string" || type === "boolean";
                })
                .slice(0, 20),
            )
          : null,
      };
    }), timeoutMs, "frame.evaluate(probe)");
  } catch (err) {
    return {
      ts: Date.now(),
      frameUrl: frame.url(),
      frameTitle: "",
      hasAliceSocket: false,
      hasCanvas: false,
      aliceSocketKeys: [],
      bridge: {
        hasExecute: false,
        hasGetState: false,
        hasState: false,
        hasDiagnostics: false,
      },
      status: "UNKNOWN",
      score: null,
      metrics: {},
      player: { x: null, y: null },
      stateSummary: null,
      diagnosticsSummary: null,
      error: String(err?.message || err),
    };
  }
}

function scoreFrameProbe(probe) {
  let score = 0;
  if (probe?.hasAliceSocket) score += 5;
  if (probe?.hasCanvas) score += 3;
  if (probe?.bridge?.hasGetState || probe?.bridge?.hasState) score += 4;
  if (probe?.bridge?.hasExecute) score += 2;
  if (probe?.status === "PLAYING") score += 1;
  return score;
}

async function selectPrimaryFrame(page, visitUrl) {
  const frameProbes = [];
  for (const frame of page.frames()) {
    const probe = await probeFrame(frame);
    frameProbes.push({
      frame,
      probe,
      score: scoreFrameProbe(probe),
      frameUrl: probe?.frameUrl || frame.url() || visitUrl,
    });
  }

  frameProbes.sort((a, b) => b.score - a.score);
  const best = frameProbes[0] || null;

  return {
    primaryFrame: best?.frame || page.mainFrame(),
    primaryProbe: best?.probe || null,
    frameProbes: frameProbes.map((entry) => ({
      score: entry.score,
      frameUrl: entry.frameUrl,
      probe: entry.probe,
    })),
  };
}

async function kickStartFrame(frame) {
  try {
    return await withTimeout(frame.evaluate(() => {
      const actions = [];
      const socket = window.AliceSocket;
      const maybeExecute = (action) => {
        if (!socket || typeof socket.execute !== "function") return false;
        try {
          const result = socket.execute(action);
          actions.push(`execute:${action}`);
          return result !== false;
        } catch {
          return false;
        }
      };

      maybeExecute("START");
      maybeExecute("LAUNCH");
      maybeExecute("RESTART");

      const clickers = ["start", "btn-start", "play", "restart", "reset"];
      for (const id of clickers) {
        const node = document.getElementById(id);
        if (node && typeof node.click === "function") {
          node.click();
          actions.push(`click:#${id}`);
        }
      }

      if (typeof window.startGame === "function") {
        try {
          window.startGame();
          actions.push("call:startGame()");
        } catch {
          // ignore
        }
      }

      if (typeof window.start === "function") {
        try {
          window.start();
          actions.push("call:start()");
        } catch {
          // ignore
        }
      }

      const press = (type, key, code) => {
        const event = new KeyboardEvent(type, {
          key,
          code,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
        document.dispatchEvent(event);
      };

      press("keydown", " ", "Space");
      press("keyup", " ", "Space");
      press("keydown", "Enter", "Enter");
      press("keyup", "Enter", "Enter");
      press("keydown", "r", "KeyR");
      press("keyup", "r", "KeyR");
      press("keydown", "1", "Digit1");
      press("keyup", "1", "Digit1");
      press("keydown", "w", "KeyW");
      press("keyup", "w", "KeyW");

      const canvas = document.querySelector("canvas");
      const clickTarget = canvas || document.body;
      if (clickTarget) {
        clickTarget.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            clientX: 140,
            clientY: 120,
            button: 0,
          }),
        );
        clickTarget.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
            clientX: 140,
            clientY: 120,
            button: 0,
          }),
        );
        clickTarget.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: 140,
            clientY: 120,
            button: 0,
          }),
        );
        actions.push("mouse:click");
      }

      actions.push("keys:Space+Enter");

      return {
        actions,
        hasAliceSocket: Boolean(window.AliceSocket),
      };
    }), DEFAULT_EVAL_TIMEOUT_MS, "frame.evaluate(kickstart)");
  } catch (err) {
    return {
      actions: [],
      error: String(err?.message || err),
      hasAliceSocket: false,
    };
  }
}

function derivePrimaryMetric(profile, sample) {
  const key = profile?.primaryMetric || "score";
  return resolveMetricValue(sample, key);
}

function resolveMetricValue(sample, metric) {
  if (!sample) return null;
  if (metric === "score") return toFiniteNumber(sample.score);
  return toFiniteNumber(sample.metrics?.[metric]);
}

async function collectGameplayEvidence(page, frame, canonical, config) {
  const profile = MASTERY_PROFILES[canonical] || {
    primaryMetric: "score",
    progressStep: 10,
  };
  const gameplayDurationMs = Number(
    (config.forceGameplayDurationMs && config.forceGameplayDurationMs > 0)
      ? config.forceGameplayDurationMs
      : (profile.gameplayDurationMs || config.gameplayDurationMs),
  );

  const samples = [];
  const kicks = [];
  const screenshots = [];

  const screenshotBase = `alice-smoke-${canonical}`;
  let screenshotCounter = 0;
  const progressStep = Number(profile.progressStep || 10);
  let bestProgressValue = -Infinity;

  const takeScreenshot = async (label, sample = null) => {
    const shotName = `${screenshotBase}-${String(screenshotCounter).padStart(2, "0")}-${label}.png`;
    screenshotCounter += 1;
    const shotPath = path.join(config.outDir, shotName);
    try {
      await withTimeout(
        page.screenshot({ path: shotPath, fullPage: true }),
        config.screenshotTimeoutMs,
        "page.screenshot",
      );
      const stat = await fs.stat(shotPath).catch(() => null);
      screenshots.push({
        label,
        path: shotPath,
        relPath: shotName,
        ts: sample?.ts || Date.now(),
        status: sample?.status || null,
        score: sample?.score ?? null,
        sizeBytes: stat?.size ?? null,
      });
    } catch {
      // ignore screenshot failures
    }
  };

  const startedAt = Date.now();
  await takeScreenshot("boot", null);

  let sawPlaying = false;
  let lastKickAt = 0;
  let lastProgressShotAt = 0;

  while (Date.now() - startedAt < gameplayDurationMs) {
    const sample = await probeFrame(frame, config.evalTimeoutMs);
    sample.status = normalizeStatus(sample.status);
    sample.elapsedMs = Date.now() - startedAt;
    sample.stateSummary = copyAsFlatObject(sample.stateSummary) || sample.stateSummary;
    sample.diagnosticsSummary = copyAsFlatObject(sample.diagnosticsSummary) || sample.diagnosticsSummary;
    samples.push(sample);

    if (
      sample?.error
      && /Target page, context or browser has been closed|Execution context was destroyed|has crashed/i.test(
        String(sample.error),
      )
    ) {
      break;
    }

    if (sample.status === "PLAYING" && !sawPlaying) {
      sawPlaying = true;
      await takeScreenshot("first-playing", sample);
    }

    const primaryValue = derivePrimaryMetric(profile, sample);
    const now = Date.now();
    if (
      primaryValue != null
      && primaryValue > bestProgressValue + progressStep
      && now - lastProgressShotAt > 1400
      && screenshots.length < 6
    ) {
      bestProgressValue = primaryValue;
      lastProgressShotAt = now;
      await takeScreenshot(`progress-${screenshots.length}`, sample);
    }

    if (
      ["MENU", "LOADING", "UNKNOWN", "PAUSED", "GAME_OVER", "FINISHED", "STORY_PICKER"].includes(sample.status)
      && now - lastKickAt > 850
    ) {
      const kick = await kickStartFrame(frame);
      kicks.push({ at: now - startedAt, ...kick });
      lastKickAt = now;
    }

    try {
      await page.waitForTimeout(config.sampleIntervalMs);
    } catch {
      break;
    }
  }

  const finalSample = samples[samples.length - 1] || null;
  await takeScreenshot("final", finalSample);

  return {
    samples,
    kicks,
    screenshots,
    elapsedMs: Date.now() - startedAt,
    configuredGameplayDurationMs: gameplayDurationMs,
  };
}

function buildRange(values) {
  const finite = values.map(toFiniteNumber).filter((entry) => entry != null);
  if (finite.length === 0) {
    return {
      start: null,
      end: null,
      min: null,
      max: null,
      delta: null,
      increase: null,
      decrease: null,
      samples: 0,
    };
  }
  const start = finite[0];
  const end = finite[finite.length - 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  return {
    start,
    end,
    min,
    max,
    delta: end - start,
    increase: max - start,
    decrease: start - min,
    samples: finite.length,
  };
}

function computeTravelDistance(samples) {
  let distance = 0;
  let last = null;
  for (const sample of samples) {
    const x = toFiniteNumber(sample?.player?.x);
    const y = toFiniteNumber(sample?.player?.y);
    if (x == null || y == null) continue;
    if (last) {
      distance += Math.hypot(x - last.x, y - last.y);
    }
    last = { x, y };
  }
  return Number(distance.toFixed(2));
}

function computeProgressDynamics(samples, profile) {
  const antiStall = profile?.antiStall || {};
  const metric = String(antiStall.metric || profile?.primaryMetric || "score");
  const direction = String(antiStall.direction || "increase").toLowerCase() === "decrease"
    ? "decrease"
    : "increase";
  const progressStep = Math.max(
    1,
    Number(antiStall.progressStep || profile?.progressStep || 10),
  );
  const eventDelta = Math.max(1, progressStep * 0.5);
  const movementEpsilon = Math.max(1, Number(antiStall.movementEpsilon || 5));

  let lastProgressValue = null;
  let lastProgressAt = null;
  let progressEvents = 0;
  let longestNoProgressMs = 0;

  let lastMovementAt = null;
  let longestNoMovementMs = 0;
  let lastPosition = null;
  let movementSamples = 0;
  let playingSamples = 0;

  for (const sample of samples) {
    const status = normalizeStatus(sample?.status);
    if (status !== "PLAYING") continue;
    const elapsedMs = toFiniteNumber(sample?.elapsedMs);
    if (elapsedMs == null) continue;

    playingSamples += 1;
    const value = resolveMetricValue(sample, metric);

    if (value != null) {
      if (lastProgressValue == null) {
        lastProgressValue = value;
        lastProgressAt = elapsedMs;
      } else if (
        (direction === "increase" && value >= lastProgressValue + eventDelta)
        || (direction === "decrease" && value <= lastProgressValue - eventDelta)
      ) {
        lastProgressValue = value;
        lastProgressAt = elapsedMs;
        progressEvents += 1;
      } else if (
        (direction === "increase" && value <= lastProgressValue - eventDelta)
        || (direction === "decrease" && value >= lastProgressValue + eventDelta)
      ) {
        // Restart/reset path: accept lower baseline so new progress is still measurable.
        lastProgressValue = value;
        lastProgressAt = elapsedMs;
      }
    }

    if (lastProgressAt != null) {
      longestNoProgressMs = Math.max(longestNoProgressMs, elapsedMs - lastProgressAt);
    }

    const x = toFiniteNumber(sample?.player?.x);
    const y = toFiniteNumber(sample?.player?.y);
    if (x != null && y != null) {
      movementSamples += 1;
      if (!lastPosition) {
        lastPosition = { x, y };
        lastMovementAt = elapsedMs;
      } else {
        const moved = Math.hypot(x - lastPosition.x, y - lastPosition.y) >= movementEpsilon;
        if (moved) {
          lastPosition = { x, y };
          lastMovementAt = elapsedMs;
        }
      }
    }

    if (lastMovementAt != null) {
      longestNoMovementMs = Math.max(longestNoMovementMs, elapsedMs - lastMovementAt);
    }
  }

  return {
    metric,
    progressEvents,
    longestNoProgressMs: Math.round(longestNoProgressMs),
    longestNoMovementMs: Math.round(longestNoMovementMs),
    movementSamples,
    playingSamples,
  };
}

function collectStats(samples, profile) {
  const statusCounts = {};
  const metricKeys = new Set([
    "score",
    "level",
    "sector",
    "lives",
    "checkpoint",
    "progressRow",
    "wolvesTrapped",
    "wrongCoinCount",
    "gameOverCount",
    "survivalSec",
    "roomTransitions",
    "invalidPlacementCount",
    "segment",
    "rocketCount",
    "enemyCount",
    "ringsRemaining",
    "energy",
    "worldAge",
    "localIndex",
    "heroHp",
    "enemyHp",
    "distance",
    "tz",
    "iy",
    "sprites",
    "boost",
  ]);

  for (const sample of samples) {
    const status = normalizeStatus(sample?.status);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    for (const key of Object.keys(sample?.metrics || {})) {
      metricKeys.add(key);
    }
  }

  const metrics = {};
  for (const key of metricKeys) {
    const values = samples.map((sample) => {
      if (key === "score") return sample?.score;
      return sample?.metrics?.[key];
    });
    metrics[key] = buildRange(values);
  }

  const totalSamples = Math.max(1, samples.length);
  const menuSamples =
    (statusCounts.MENU || 0)
    + (statusCounts.LOADING || 0)
    + (statusCounts.UNKNOWN || 0)
    + (statusCounts.STORY_PICKER || 0);
  const socketSeen = samples.some((sample) => Boolean(sample?.hasAliceSocket));
  const canvasSeen = samples.some((sample) => Boolean(sample?.hasCanvas));

  return {
    sampleCount: samples.length,
    statusCounts,
    statusesSeen: Object.keys(statusCounts).sort(),
    menuShare: Number((menuSamples / totalSamples).toFixed(4)),
    playingShare: Number(((statusCounts.PLAYING || 0) / totalSamples).toFixed(4)),
    metrics,
    travelDistance: computeTravelDistance(samples),
    progressionDynamics: computeProgressDynamics(samples, profile),
    socketSeen,
    canvasSeen,
  };
}

function buildCheck(id, passed, message, observed = null, target = null) {
  return {
    id,
    passed: Boolean(passed),
    message,
    observed,
    target,
  };
}

function formatNumber(value) {
  const num = toFiniteNumber(value);
  if (num == null) return "n/a";
  if (Math.abs(num) >= 1000) return num.toFixed(0);
  if (Math.abs(num) >= 100) return num.toFixed(1);
  return num.toFixed(2);
}

function metricRange(stats, key) {
  return stats?.metrics?.[key] || null;
}

function checkMetricDelta(stats, key, minDelta, message) {
  const range = metricRange(stats, key);
  const observed = range?.delta;
  if (observed == null) {
    return buildCheck(`metric_delta_${key}`, false, `${message} (missing metric: ${key})`, "n/a", `>= ${minDelta}`);
  }
  return buildCheck(`metric_delta_${key}`, observed >= minDelta, message, formatNumber(observed), `>= ${minDelta}`);
}

function checkMetricMax(stats, key, minMax, message) {
  const range = metricRange(stats, key);
  const observed = range?.max;
  if (observed == null) {
    return buildCheck(`metric_max_${key}`, false, `${message} (missing metric: ${key})`, "n/a", `>= ${minMax}`);
  }
  return buildCheck(`metric_max_${key}`, observed >= minMax, message, formatNumber(observed), `>= ${minMax}`);
}

function checkMetricMaxLte(stats, key, maxAllowed, message) {
  const range = metricRange(stats, key);
  const observed = range?.max;
  if (observed == null) {
    return buildCheck(`metric_max_lte_${key}`, false, `${message} (missing metric: ${key})`, "n/a", `<= ${maxAllowed}`);
  }
  return buildCheck(`metric_max_lte_${key}`, observed <= maxAllowed, message, formatNumber(observed), `<= ${maxAllowed}`);
}

function checkMetricMin(stats, key, minVal, message) {
  const range = metricRange(stats, key);
  const observed = range?.min;
  if (observed == null) {
    return buildCheck(`metric_min_${key}`, false, `${message} (missing metric: ${key})`, "n/a", `>= ${minVal}`);
  }
  return buildCheck(`metric_min_${key}`, observed >= minVal, message, formatNumber(observed), `>= ${minVal}`);
}

function checkMetricDecrease(stats, key, minDecrease, message) {
  const range = metricRange(stats, key);
  const observed = range?.decrease;
  if (observed == null) {
    return buildCheck(`metric_decrease_${key}`, false, `${message} (missing metric: ${key})`, "n/a", `>= ${minDecrease}`);
  }
  return buildCheck(`metric_decrease_${key}`, observed >= minDecrease, message, formatNumber(observed), `>= ${minDecrease}`);
}

function checkTravel(stats, minDistance, message) {
  const observed = toFiniteNumber(stats?.travelDistance);
  if (observed == null) {
    return buildCheck("travel_distance", false, `${message} (missing travel metric)`, "n/a", `>= ${minDistance}`);
  }
  return buildCheck("travel_distance", observed >= minDistance, message, formatNumber(observed), `>= ${minDistance}`);
}

function checkAny(id, message, checks) {
  const passed = checks.some((check) => check.passed);
  const observed = checks.map((check) => `${check.id}:${check.passed ? "ok" : "fail"}`).join(", ");
  return {
    ...buildCheck(id, passed, message, observed, "any"),
    anyOf: checks,
  };
}

function resolveLevelGateTarget(levelGate) {
  const overrideTarget = toFiniteNumber(levelGate?.overrideTarget);
  if (overrideTarget != null) return overrideTarget;

  const totalStages = Math.max(1, Math.floor(toFiniteNumber(levelGate?.totalStages) || 1));
  const minFraction = Math.max(0.01, Math.min(1, toFiniteNumber(levelGate?.minFraction) || 0.5));
  const indexBase = Math.floor(toFiniteNumber(levelGate?.indexBase) || 0);
  const requiredStages = Math.ceil(totalStages * minFraction);
  return indexBase + requiredStages - 1;
}

function checkLevelGate(stats, levelGate) {
  const metric = String(levelGate?.metric || "level");
  const direction = levelGate?.direction === "min_lte" ? "min_lte" : "max_gte";
  const range = metricRange(stats, metric);
  const target = resolveLevelGateTarget(levelGate);
  const defaultDescription =
    direction === "min_lte"
      ? `Half-level gate: ${metric} <= ${target}`
      : `Half-level gate: ${metric} >= ${target}`;
  const message = levelGate?.description || defaultDescription;

  if (!range) {
    return buildCheck(
      `level_gate_${metric}`,
      false,
      `${message} (missing metric: ${metric})`,
      "n/a",
      direction === "min_lte" ? `<= ${target}` : `>= ${target}`,
    );
  }

  const observed = direction === "min_lte" ? range.min : range.max;
  if (observed == null) {
    return buildCheck(
      `level_gate_${metric}`,
      false,
      `${message} (metric unavailable: ${metric})`,
      "n/a",
      direction === "min_lte" ? `<= ${target}` : `>= ${target}`,
    );
  }

  const passed = direction === "min_lte" ? observed <= target : observed >= target;
  return buildCheck(
    `level_gate_${metric}`,
    passed,
    message,
    formatNumber(observed),
    direction === "min_lte" ? `<= ${target}` : `>= ${target}`,
  );
}

function checkHighScoreGate(stats, highScoreGate) {
  const metric = String(highScoreGate?.metric || "score");
  const minMax = toFiniteNumber(highScoreGate?.minMax);
  const message = highScoreGate?.description || `High-score gate: ${metric} max >= ${minMax}`;
  if (minMax == null) {
    return buildCheck(
      `high_score_${metric}`,
      false,
      `${message} (invalid threshold)`,
      "n/a",
      "configured threshold",
    );
  }
  return checkMetricMax(stats, metric, minMax, message);
}

function buildAntiStallChecks(stats, profile) {
  const antiStall = profile?.antiStall;
  if (!antiStall) return [];

  const dynamics = stats?.progressionDynamics || {};
  const checks = [];
  const maxNoProgressMs = Math.max(1, Number(antiStall.maxNoProgressMs || 0));
  const minProgressEvents = Math.max(1, Number(antiStall.minProgressEvents || 0));
  const maxNoMovementMs = toFiniteNumber(antiStall.maxNoMovementMs);
  const minMovementSamples = Math.max(1, Number(antiStall.minMovementSamples || 6));

  checks.push(
    buildCheck(
      "anti_stall_progress_window",
      Number(dynamics.longestNoProgressMs ?? Number.POSITIVE_INFINITY) <= maxNoProgressMs,
      `Anti-stall: longest no-progress window <= ${maxNoProgressMs}ms`,
      String(dynamics.longestNoProgressMs ?? "n/a"),
      `<= ${maxNoProgressMs}`,
    ),
  );
  checks.push(
    buildCheck(
      "anti_stall_progress_events",
      Number(dynamics.progressEvents || 0) >= minProgressEvents,
      `Anti-stall: progress events >= ${minProgressEvents}`,
      String(dynamics.progressEvents ?? 0),
      `>= ${minProgressEvents}`,
    ),
  );

  if (maxNoMovementMs != null) {
    if (Number(dynamics.movementSamples || 0) < minMovementSamples) {
      checks.push(
        buildCheck(
          "anti_stall_motion_window",
          true,
          `Anti-stall: motion gate skipped (insufficient movement samples < ${minMovementSamples})`,
          String(dynamics.movementSamples ?? 0),
          `>= ${minMovementSamples}`,
        ),
      );
      return checks;
    }
    checks.push(
      buildCheck(
        "anti_stall_motion_window",
        Number(dynamics.longestNoMovementMs ?? Number.POSITIVE_INFINITY) <= maxNoMovementMs,
        `Anti-stall: longest no-movement window <= ${maxNoMovementMs}ms`,
        String(dynamics.longestNoMovementMs ?? "n/a"),
        `<= ${maxNoMovementMs}`,
      ),
    );
  }

  return checks;
}

function buildMasteryIndicator({
  canonical,
  navOk,
  probe,
  strictErrorPass,
  stats,
  screenshots = [],
  atomicAuditMeta = null,
}) {
  const profile = MASTERY_PROFILES[canonical] || {
    objective: "Demonstrate sustained gameplay progression.",
    evaluate: () => [],
  };

  if (profile.deferred) {
    return {
      level: "deferred",
      label: DEFERRED_LABEL,
      reason: "Deferred by scope (multiplayer milestone pending).",
      objective: profile.objective,
      checks: [
        buildCheck("deferred_scope", true, "Game is intentionally deferred from strict denominator", "deferred", "deferred"),
      ],
      statsSnapshot: {
        statusesSeen: stats.statusesSeen,
        menuShare: stats.menuShare,
        playingShare: stats.playingShare,
      },
    };
  }

  const checks = [];
  checks.push(buildCheck("navigation", navOk, "Navigation to game page succeeded", navOk ? "ok" : "fail", "ok"));
  const socketPresent = Boolean(probe?.hasAliceSocket || stats?.socketSeen);
  const canvasPresent = Boolean(probe?.hasCanvas || stats?.canvasSeen);
  checks.push(buildCheck("alice_socket", socketPresent, "AliceSocket bridge is present", socketPresent ? "present" : "missing", "present"));
  checks.push(buildCheck("canvas", canvasPresent, "Game canvas is present", canvasPresent ? "present" : "missing", "present"));
  checks.push(buildCheck("strict_errors", strictErrorPass, "Strict error gate passed", strictErrorPass ? "ok" : "fail", "ok"));
  checks.push(
    buildCheck(
      "entered_playing",
      (stats?.statusCounts?.PLAYING || 0) > 0,
      "Reached PLAYING state",
      String(stats?.statusCounts?.PLAYING || 0),
      ">= 1",
    ),
  );
  checks.push(
    buildCheck(
      "menu_share",
      (stats?.menuShare ?? 1) <= 0.7,
      "Menu/loading share <= 70%",
      formatNumber(stats?.menuShare),
      "<= 0.70",
    ),
  );
  checks.push(
    buildCheck(
      "evidence_frames",
      (screenshots?.length || 0) >= 3,
      "Captured at least 3 evidence frames",
      String(screenshots?.length || 0),
      ">= 3",
    ),
  );

  if (canonical === "playback") {
    const maxFrameSize = Math.max(
      0,
      ...((screenshots || []).map((shot) => Number(shot?.sizeBytes || 0))),
    );
    checks.push(
      buildCheck(
        "playback_nonblank_frames",
        maxFrameSize >= 9_000,
        "Playback frames are non-blank (max frame size >= 9KB)",
        String(maxFrameSize),
        ">= 9000",
      ),
    );
  }

  const auditStatus = String(atomicAuditMeta?.auditStatus || "pending");
  if (atomicAuditMeta) {
    checks.push(
      buildCheck(
        "atomic_audit_present",
        Boolean(atomicAuditMeta.auditComplete),
        "Canonical atomic audit is present",
        auditStatus,
        "audited|closed|regression-only|deferred",
      ),
    );
    if (auditStatus === "audited" && atomicAuditMeta.blockingSubsystem) {
      checks.push(
        buildCheck(
          "atomic_audit_blocker",
          false,
          "Atomic audit still marks an unresolved controller blocker",
          atomicAuditMeta.blockingSubsystem,
          "closed",
        ),
      );
    }
  }

  if (profile.levelGate) {
    checks.push(checkLevelGate(stats, profile.levelGate));
  }
  if (profile.highScoreGate) {
    checks.push(checkHighScoreGate(stats, profile.highScoreGate));
  }

  checks.push(...buildAntiStallChecks(stats, profile));

  const gameChecks = profile.evaluate(stats);
  checks.push(...gameChecks);

  const failedChecks = checks.filter((check) => !check.passed);
  const passed = failedChecks.length === 0;

  const reason = passed
    ? `${profile.objective} (all checks passed)`
    : `Failed checks: ${failedChecks.map((check) => check.id).join(", ")}`;

  return {
    level: passed ? "mastered" : "needs-work",
    label: passed ? MASTERED_LABEL : NEEDS_WORK_LABEL,
    reason,
    objective: profile.objective,
    auditStatus,
    blockingSubsystem: atomicAuditMeta?.blockingSubsystem || null,
    controllerMode: atomicAuditMeta?.controllerMode || null,
    nativeMetricCoverage: atomicAuditMeta?.nativeMetricCoverage || "missing",
    currentFailureReason: atomicAuditMeta?.currentFailureReason || null,
    boundedGate: atomicAuditMeta?.boundedGate || null,
    checks,
    statsSnapshot: {
      statusesSeen: stats.statusesSeen,
      menuShare: stats.menuShare,
      playingShare: stats.playingShare,
      travelDistance: stats.travelDistance,
      score: stats.metrics?.score || null,
      level: stats.metrics?.level || null,
      sector: stats.metrics?.sector || null,
      checkpoint: stats.metrics?.checkpoint || null,
      progressRow: stats.metrics?.progressRow || null,
      tz: stats.metrics?.tz || null,
      segment: stats.metrics?.segment || null,
      localIndex: stats.metrics?.localIndex || null,
      roomTransitions: stats.metrics?.roomTransitions || null,
      wolvesTrapped: stats.metrics?.wolvesTrapped || null,
      wrongCoinCount: stats.metrics?.wrongCoinCount || null,
      survivalSec: stats.metrics?.survivalSec || null,
      invalidPlacementCount: stats.metrics?.invalidPlacementCount || null,
      ringsRemaining: stats.metrics?.ringsRemaining || null,
      enemyHp: stats.metrics?.enemyHp || null,
      progressionDynamics: stats.progressionDynamics || null,
    },
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCheck(check) {
  const statusClass = check.passed ? "ok" : "bad";
  const target = check.target != null ? ` target=${escapeHtml(check.target)}` : "";
  const observed = check.observed != null ? ` observed=${escapeHtml(check.observed)}` : "";
  let detail = "";
  if (Array.isArray(check.anyOf) && check.anyOf.length > 0) {
    detail = ` (${check.anyOf.map((entry) => `${entry.id}:${entry.passed ? "ok" : "fail"}`).join(", ")})`;
  }
  return `<li class="check ${statusClass}"><span>${check.passed ? "PASS" : "FAIL"}</span> ${escapeHtml(check.message)}${target}${observed}${escapeHtml(detail)}</li>`;
}

function renderShot(shot) {
  return `<a class="shot" href="${escapeHtml(shot.relPath)}" target="_blank" rel="noreferrer">
    <img src="${escapeHtml(shot.relPath)}" alt="${escapeHtml(shot.label)}"/>
    <div class="shot-meta">${escapeHtml(shot.label)}${shot.status ? ` | ${escapeHtml(shot.status)}` : ""}${shot.score != null ? ` | score ${escapeHtml(formatNumber(shot.score))}` : ""}</div>
  </a>`;
}

async function writeHtmlReport(summary, outDir) {
  const htmlPath = path.join(outDir, "alice-game-smoke-report.html");
  const cards = summary.results
    .map((result) => {
      const mastery = result.masteryIndicator || {
        level: "needs-work",
        label: NEEDS_WORK_LABEL,
        reason: "missing mastery indicator",
        objective: "No objective available",
        checks: [],
      };
      const statusClass = result.status === "pass" ? "pass" : result.status === "deferred" ? "deferred" : "fail";
      const masteryClass = mastery.level === "mastered"
        ? "mastered"
        : mastery.level === "deferred"
          ? "deferred"
          : "needs-work";
      const errorItems = [
        ...(result.pageErrors || []).map((msg) => `page: ${msg}`),
        ...(result.consoleErrors || []).map((entry) =>
          `console: ${typeof entry === "string" ? entry : entry?.text || ""}`,
        ),
      ]
        .slice(0, 5)
        .map((msg) => `<li>${escapeHtml(msg)}</li>`)
        .join("");

      const checks = (mastery.checks || []).map(renderCheck).join("\n");
      const shots = (result.screenshots || []).map(renderShot).join("\n");
      const auditInfo = [
        mastery.auditStatus ? `<div><b>Audit:</b> ${escapeHtml(mastery.auditStatus)}</div>` : "",
        mastery.controllerMode ? `<div><b>Controller Mode:</b> ${escapeHtml(mastery.controllerMode)}</div>` : "",
        mastery.blockingSubsystem ? `<div><b>Blocking Subsystem:</b> ${escapeHtml(mastery.blockingSubsystem)}</div>` : "",
        mastery.nativeMetricCoverage ? `<div><b>Metric Coverage:</b> ${escapeHtml(mastery.nativeMetricCoverage)}</div>` : "",
        mastery.currentFailureReason ? `<div><b>Audit Failure:</b> ${escapeHtml(mastery.currentFailureReason)}</div>` : "",
      ].filter(Boolean).join("");

      return `
      <article class="card">
        <div class="card-header">
          <h2>${escapeHtml(result.canonical)}</h2>
          <div class="badges">
            <span class="badge ${statusClass}">${escapeHtml(result.status)}</span>
            <span class="badge ${masteryClass}">${escapeHtml(mastery.label)}</span>
          </div>
        </div>
        <div class="meta">${escapeHtml(result.gameTitle || "")}</div>
        <div class="objective"><b>Objective:</b> ${escapeHtml(mastery.objective || "")}</div>
        <div class="reason">${escapeHtml(mastery.reason)}</div>
        ${auditInfo ? `<div class="audit">${auditInfo}</div>` : ""}
        <div class="stats">
          <span>AliceSocket: ${result.probe?.hasAliceSocket ? "yes" : "no"}</span>
          <span>Canvas: ${result.probe?.hasCanvas ? "yes" : "no"}</span>
          <span>MenuShare: ${escapeHtml(formatNumber(result.stats?.menuShare || 0))}</span>
          <span>PlayingShare: ${escapeHtml(formatNumber(result.stats?.playingShare || 0))}</span>
          <span>Travel: ${escapeHtml(formatNumber(result.stats?.travelDistance || 0))}</span>
          <span>ScoreDelta: ${escapeHtml(formatNumber(result.stats?.metrics?.score?.delta))}</span>
          <span>Kicks: ${escapeHtml(String(result.kicks?.length || 0))}</span>
        </div>
        ${shots ? `<div class="shots">${shots}</div>` : '<div class="missing-shot">No screenshots</div>'}
        ${checks ? `<ul class="checks">${checks}</ul>` : ""}
        ${errorItems ? `<ul class="errors">${errorItems}</ul>` : ""}
      </article>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Alice Five55 Mastery Spectate</title>
  <style>
    :root {
      --bg: #0c0f14;
      --card: #151a22;
      --text: #eef3ff;
      --muted: #9aa5bd;
      --ok: #17c964;
      --warn: #f5a524;
      --bad: #f31260;
      --line: #273246;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .wrap { max-width: 1800px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .summary { color: var(--muted); margin-bottom: 20px; }
    .summary b { color: var(--text); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 16px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .card h2 { margin: 0; font-size: 16px; }
    .meta { color: var(--muted); font-size: 12px; margin-top: 2px; }
    .objective { margin-top: 8px; font-size: 12px; color: #d5e0f7; }
    .reason { color: #cdd8ee; font-size: 12px; margin: 8px 0; }
    .audit { margin: 8px 0; font-size: 12px; color: #b9c8e6; display: grid; gap: 4px; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; }
    .badge {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .03em;
    }
    .badge.pass { background: color-mix(in srgb, var(--ok) 30%, transparent); color: #8ff7bc; border: 1px solid color-mix(in srgb, var(--ok) 50%, transparent); }
    .badge.fail { background: color-mix(in srgb, var(--bad) 30%, transparent); color: #ff95bd; border: 1px solid color-mix(in srgb, var(--bad) 50%, transparent); }
    .badge.mastered { background: color-mix(in srgb, var(--ok) 20%, transparent); color: #8ff7bc; border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent); }
    .badge.needs-work { background: color-mix(in srgb, var(--warn) 30%, transparent); color: #ffd78a; border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); }
    .badge.deferred { background: color-mix(in srgb, #78909c 35%, transparent); color: #d8e3ec; border: 1px solid color-mix(in srgb, #78909c 55%, transparent); }
    .stats { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 10px; color: var(--muted); font-size: 12px; }
    .shots {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }
    .shot {
      display: block;
      text-decoration: none;
      color: inherit;
      background: #0d1219;
      border: 1px solid #2b3649;
      border-radius: 8px;
      overflow: hidden;
    }
    .shot img {
      width: 100%;
      height: 90px;
      object-fit: cover;
      display: block;
      background: #000;
    }
    .shot-meta {
      padding: 6px;
      font-size: 11px;
      color: #d0d9ef;
      border-top: 1px solid #2b3649;
    }
    .missing-shot {
      padding: 24px;
      text-align: center;
      color: var(--muted);
      background: #0b1118;
      border-radius: 10px;
      border: 1px dashed #314159;
      margin-top: 10px;
    }
    .checks {
      margin: 10px 0 0 16px;
      color: #d9e6ff;
      font-size: 12px;
    }
    .check span {
      display: inline-block;
      min-width: 34px;
      font-weight: 700;
    }
    .check.ok span { color: #8ff7bc; }
    .check.bad span { color: #ff95bd; }
    .errors {
      margin: 10px 0 0 16px;
      color: #ffb3cf;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Alice Five55 Mastery Spectate Gallery</h1>
    <div class="summary">
      Generated: <b>${escapeHtml(summary.finishedAt)}</b> |
      Total: <b>${summary.total}</b> |
      Mastered: <b>${summary.mastered}</b> |
      Deferred: <b>${summary.deferred || 0}</b> |
      Required: <b>${summary.requiredTotal || summary.total}</b> |
      Needs Work: <b>${summary.failed}</b> |
      Strict Errors: <b>${summary.strictErrors ? "on" : "off"}</b> |
      Default Gameplay Window: <b>${escapeHtml(String(summary.defaultGameplayDurationMs))}ms</b> |
      Per-game Overrides: <b>${summary.perGameDurationOverrides ? "on" : "off"}</b>
    </div>
    <section class="grid">
      ${cards}
    </section>
  </div>
</body>
</html>`;

  await fs.writeFile(htmlPath, html, "utf8");
  return htmlPath;
}

async function run() {
  const config = parseArgs();
  await fs.mkdir(config.outDir, { recursive: true });

  const chromium = await loadChromium();
  const catalog = await fetchCatalog(config.baseUrl);
  const byId = new Map((catalog.games || []).map((game) => [String(game.id), game]));

  const browser = await chromium.launch({
    headless: config.headless,
    args: [
      "--use-angle=swiftshader",
      "--use-gl=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const startedAt = new Date().toISOString();
  const results = [];
  const selectedTargets = config.games.length > 0
    ? TARGETS.filter((target) => config.games.includes(target.canonical) || config.games.includes(target.catalogId))
    : TARGETS;

  for (const target of selectedTargets) {
    console.log(`[smoke] game-start ${target.canonical}`);
    const game = byId.get(target.catalogId);
    const masteryProfile = MASTERY_PROFILES[target.canonical] || null;
    const atomicAuditMeta = await readAtomicAuditMeta(target.canonical);
    if (!game) {
      results.push({
        canonical: target.canonical,
        catalogId: target.catalogId,
        status: "missing_catalog",
        masteryIndicator: {
          level: "needs-work",
          label: NEEDS_WORK_LABEL,
          reason: "Game missing from catalog",
          objective: "Catalog entry must exist",
          auditStatus: atomicAuditMeta.auditStatus,
          blockingSubsystem: atomicAuditMeta.blockingSubsystem,
          controllerMode: atomicAuditMeta.controllerMode,
          nativeMetricCoverage: atomicAuditMeta.nativeMetricCoverage,
          currentFailureReason: atomicAuditMeta.currentFailureReason,
          boundedGate: atomicAuditMeta.boundedGate,
          checks: [buildCheck("catalog_entry", false, "Catalog entry found", "missing", "present")],
        },
        auditComplete: atomicAuditMeta.auditComplete,
        auditStatus: atomicAuditMeta.auditStatus,
        blockingSubsystem: atomicAuditMeta.blockingSubsystem,
        controllerMode: atomicAuditMeta.controllerMode,
        nativeMetricCoverage: atomicAuditMeta.nativeMetricCoverage,
        screenshots: [],
      });
      console.log(`[smoke] game-end ${target.canonical} missing_catalog`);
      continue;
    }

    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    let pageClosedUnexpectedly = false;

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push({
          type: msg.type(),
          text: msg.text(),
          location: msg.location(),
        });
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(String(err?.message || err));
    });
    page.on("close", () => {
      pageClosedUnexpectedly = true;
    });

    try {

    const visitPath = VISIT_PATH_OVERRIDES[target.canonical] || String(game.path || "/");
    const visitUrl = withAgentQuery(visitPath, config.baseUrl);
    let navOk = true;
    let navError = null;

    try {
      await page.goto(visitUrl, {
        waitUntil: "domcontentloaded",
        timeout: config.timeoutMs,
      });
      await page.waitForTimeout(config.settleMs);
    } catch (err) {
      navOk = false;
      navError = err instanceof Error ? err.message : String(err);
    }

    let probe = {
      hasAliceSocket: false,
      hasCanvas: false,
      aliceSocketKeys: [],
      title: "",
      href: visitUrl,
      status: "UNKNOWN",
      score: null,
      frameCount: 0,
      frameProbes: [],
      bridge: {
        hasExecute: false,
        hasGetState: false,
        hasState: false,
        hasDiagnostics: false,
      },
    };

    let gameplayEvidence = {
      samples: [],
      kicks: [],
      screenshots: [],
      elapsedMs: 0,
    };

    if (navOk) {
      const selection = await selectPrimaryFrame(page, visitUrl);
      const { primaryFrame, primaryProbe, frameProbes } = selection;
      probe = {
        hasAliceSocket: Boolean(primaryProbe?.hasAliceSocket),
        hasCanvas: Boolean(primaryProbe?.hasCanvas),
        aliceSocketKeys: primaryProbe?.aliceSocketKeys || [],
        title: primaryProbe?.frameTitle || "",
        href: primaryProbe?.frameUrl || visitUrl,
        status: normalizeStatus(primaryProbe?.status),
        score: primaryProbe?.score ?? null,
        bridge: primaryProbe?.bridge || probe.bridge,
        frameCount: frameProbes.length,
        frameProbes,
      };

      await page.waitForTimeout(config.postProbeWaitMs);
      gameplayEvidence = await collectGameplayEvidence(
        page,
        primaryFrame,
        target.canonical,
        config,
      );
    }

    const ignoredPageErrors = pageErrors.filter((message) => isIgnoredPageError(target.canonical, message));
    const effectivePageErrors = pageErrors.filter(
      (message) => !isIgnoredPageError(target.canonical, message),
    );
    const ignoredConsoleErrors = consoleErrors.filter((entry) =>
      isIgnoredConsoleError(target.canonical, entry),
    );
    const effectiveConsoleErrors = consoleErrors.filter(
      (entry) => !isIgnoredConsoleError(target.canonical, entry),
    );

    const strictErrorPass =
      !config.strictErrors ||
      (effectivePageErrors.length <= config.maxPageErrors
        && effectiveConsoleErrors.length <= config.maxConsoleErrors);

    const stats = collectStats(gameplayEvidence.samples, masteryProfile);

    const masteryIndicator = buildMasteryIndicator({
      canonical: target.canonical,
      navOk,
      probe,
      strictErrorPass,
      stats,
      screenshots: gameplayEvidence.screenshots,
      atomicAuditMeta,
    });

    const pass = masteryIndicator.level === "mastered" || masteryIndicator.level === "deferred";
    results.push({
      canonical: target.canonical,
      catalogId: target.catalogId,
      gameTitle: game.title,
      visitUrl,
      status: masteryIndicator.level === "deferred" ? "deferred" : pass ? "pass" : navOk ? "probe_fail" : "nav_fail",
      navError,
      probe,
      strictGate: {
        enabled: config.strictErrors,
        passed: strictErrorPass,
        maxPageErrors: config.maxPageErrors,
        maxConsoleErrors: config.maxConsoleErrors,
      },
      masteryIndicator,
      auditComplete: atomicAuditMeta.auditComplete,
      auditStatus: atomicAuditMeta.auditStatus,
      blockingSubsystem: atomicAuditMeta.blockingSubsystem,
      controllerMode: atomicAuditMeta.controllerMode,
      nativeMetricCoverage: atomicAuditMeta.nativeMetricCoverage,
      stats,
      sampleCount: gameplayEvidence.samples.length,
      elapsedMs: gameplayEvidence.elapsedMs,
      configuredGameplayDurationMs: gameplayEvidence.configuredGameplayDurationMs,
      kicks: gameplayEvidence.kicks,
      screenshots: gameplayEvidence.screenshots,
      samplesTail: gameplayEvidence.samples.slice(-20),
      consoleErrorCount: effectiveConsoleErrors.length,
      pageErrorCount: effectivePageErrors.length,
      ignoredConsoleErrorCount: ignoredConsoleErrors.length,
      ignoredPageErrorCount: ignoredPageErrors.length,
      consoleErrors: effectiveConsoleErrors.slice(0, 8),
      pageErrors: effectivePageErrors.slice(0, 8),
      ignoredConsoleErrors: ignoredConsoleErrors.slice(0, 8),
      ignoredPageErrors: ignoredPageErrors.slice(0, 8),
      screenshotPath: gameplayEvidence.screenshots[0]?.path || null,
      pageClosedUnexpectedly,
    });
    console.log(`[smoke] game-end ${target.canonical} ${masteryIndicator.level}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        canonical: target.canonical,
        catalogId: target.catalogId,
        gameTitle: game.title,
        status: "runtime_error",
        navError: errorMessage,
        probe: {
          hasAliceSocket: false,
          hasCanvas: false,
          status: "UNKNOWN",
          frameCount: 0,
          frameProbes: [],
        },
        strictGate: {
          enabled: config.strictErrors,
          passed: false,
          maxPageErrors: config.maxPageErrors,
          maxConsoleErrors: config.maxConsoleErrors,
        },
        masteryIndicator: {
          level: "needs-work",
          label: NEEDS_WORK_LABEL,
          reason: `runtime_error: ${errorMessage}`,
          objective: MASTERY_PROFILES[target.canonical]?.objective || "Demonstrate sustained gameplay progression.",
          auditStatus: atomicAuditMeta.auditStatus,
          blockingSubsystem: atomicAuditMeta.blockingSubsystem,
          controllerMode: atomicAuditMeta.controllerMode,
          nativeMetricCoverage: atomicAuditMeta.nativeMetricCoverage,
          currentFailureReason: atomicAuditMeta.currentFailureReason,
          boundedGate: atomicAuditMeta.boundedGate,
          checks: [buildCheck("runtime_error", false, "Runner completed game pass without runtime exception", errorMessage, "no_error")],
        },
        auditComplete: atomicAuditMeta.auditComplete,
        auditStatus: atomicAuditMeta.auditStatus,
        blockingSubsystem: atomicAuditMeta.blockingSubsystem,
        controllerMode: atomicAuditMeta.controllerMode,
        nativeMetricCoverage: atomicAuditMeta.nativeMetricCoverage,
        stats: collectStats([], masteryProfile),
        sampleCount: 0,
        elapsedMs: 0,
        configuredGameplayDurationMs: masteryProfile?.gameplayDurationMs || config.gameplayDurationMs,
        kicks: [],
        screenshots: [],
        samplesTail: [],
        consoleErrorCount: consoleErrors.length,
        pageErrorCount: pageErrors.length,
        ignoredConsoleErrorCount: 0,
        ignoredPageErrorCount: 0,
        consoleErrors: consoleErrors.slice(0, 8),
        pageErrors: pageErrors.slice(0, 8),
        ignoredConsoleErrors: [],
        ignoredPageErrors: [],
        screenshotPath: null,
        pageClosedUnexpectedly,
      });
      console.log(`[smoke] game-end ${target.canonical} runtime_error`);
    } finally {
      try {
        if (!page.isClosed()) {
          await withTimeout(page.close(), DEFAULT_PAGE_CLOSE_TIMEOUT_MS, "page.close");
        }
      } catch (err) {
        console.warn(
          `[smoke] page-close-timeout ${target.canonical} ${String(err?.message || err)}`,
        );
      }
    }
  }

  try {
    await withTimeout(browser.close(), DEFAULT_BROWSER_CLOSE_TIMEOUT_MS, "browser.close");
  } catch (err) {
    console.warn(`[smoke] browser-close-timeout ${String(err?.message || err)}`);
  }

  const deferredCount = results.filter((r) => r.masteryIndicator?.level === "deferred").length;
  const requiredTotal = Math.max(0, results.length - deferredCount);
  const masteredCount = results.filter((r) => r.masteryIndicator?.level === "mastered").length;
  const failedRequiredCount = results.filter(
    (r) => r.masteryIndicator?.level !== "mastered" && r.masteryIndicator?.level !== "deferred",
  ).length;

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    strictErrors: config.strictErrors,
    requireMastery: config.requireMastery,
    maxPageErrors: config.maxPageErrors,
    maxConsoleErrors: config.maxConsoleErrors,
    defaultGameplayDurationMs: config.gameplayDurationMs,
    perGameDurationOverrides: true,
    sampleIntervalMs: config.sampleIntervalMs,
    selectedGames: selectedTargets.map((target) => target.canonical),
    total: results.length,
    requiredTotal,
    mastered: masteredCount,
    deferred: deferredCount,
    passed: results.filter((r) => r.status === "pass").length,
    failed: failedRequiredCount,
    results,
  };

  const reportPath = path.join(config.outDir, "alice-game-smoke-report.json");
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");
  const htmlReportPath = await writeHtmlReport(summary, config.outDir);

  console.log(
    JSON.stringify(
      {
        reportPath,
        htmlReportPath,
        baseUrl: config.baseUrl,
        total: summary.total,
        requiredTotal: summary.requiredTotal,
        mastered: summary.mastered,
        deferred: summary.deferred,
        passed: summary.passed,
        failed: summary.failed,
    strictErrors: summary.strictErrors,
    defaultGameplayDurationMs: summary.defaultGameplayDurationMs,
    perGameDurationOverrides: summary.perGameDurationOverrides,
    sampleIntervalMs: summary.sampleIntervalMs,
    requireMastery: config.requireMastery,
      },
      null,
      2,
    ),
  );

  if (config.failOnFailure && summary.failed > 0) {
    process.exitCode = 1;
  }
  if (config.requireMastery && summary.mastered !== summary.requiredTotal) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
