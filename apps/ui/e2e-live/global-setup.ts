/** Boots real Milaidy + Vite servers in an isolated HOME for live E2E tests. */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.resolve(HERE, "..");
const MILAIDY_ROOT = path.resolve(UI_ROOT, "../..");
const WORKSPACE_ROOT = path.resolve(MILAIDY_ROOT, "..");
const API_PORT = 2138;
const UI_PORT = 18790;
const STATE_FILE = path.join(os.tmpdir(), "milaidy-e2e-live-state.json");

const FORWARDED_KEYS = [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY",
  "EVM_PRIVATE_KEY", "SOLANA_API_KEY",
  "ALCHEMY_API_KEY", "HELIUS_API_KEY", "BIRDEYE_API_KEY",
] as const;

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const vars: Record<string, string> = {};
  for (const raw of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let val = line.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    vars[line.slice(0, eq)] = val;
  }
  return vars;
}

function waitForPort(port: number, timeout = 180_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    (function attempt() {
      if (Date.now() > deadline) { reject(new Error(`Port ${port} timeout`)); return; }
      const sock = createConnection({ port, host: "127.0.0.1" });
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => { sock.destroy(); setTimeout(attempt, 500); });
    })();
  });
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: "127.0.0.1" });
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
  });
}

async function waitForAgentReady(port: number, timeout = 180_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(timer);
    if (resp?.ok) {
      const data = (await resp.json()) as { state?: string };
      if (data.state === "running") return;
      console.log(`  [e2e-live] Agent state: ${data.state ?? "unknown"}, waiting...`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Agent not running within ${timeout}ms`);
}

function createSeedConfig(testHome: string, env: Record<string, string>): void {
  const stateDir = path.join(testHome, ".milaidy");
  const workspaceDir = path.join(stateDir, "workspace");
  fs.mkdirSync(workspaceDir, { recursive: true });

  const envSection: Record<string, string> = {};
  for (const k of FORWARDED_KEYS) if (env[k]) envSection[k] = env[k];

  fs.writeFileSync(path.join(stateDir, "milaidy.json"), JSON.stringify({
    meta: { lastTouchedVersion: "0.0.0-e2e", lastTouchedAt: new Date().toISOString() },
    agents: {
      defaults: { workspace: workspaceDir },
      list: [{
        id: "main", default: true, name: "Reimu", workspace: workspaceDir,
        bio: "E2E test agent.", system: "You are Reimu. Keep responses short.",
        adjectives: ["helpful", "concise"], topics: ["testing"],
        style: { all: ["Be brief."], chat: ["Be concise."] },
      }],
    },
    env: envSection,
    ui: { theme: "dark" },
    plugins: { entries: {
      anthropic: { enabled: Boolean(env.ANTHROPIC_API_KEY) },
      openai: { enabled: Boolean(env.OPENAI_API_KEY) },
      groq: { enabled: Boolean(env.GROQ_API_KEY) },
    }},
    cloud: { enabled: false },
    wizard: { lastRunAt: new Date().toISOString(), lastRunVersion: "0.0.0-e2e" },
  }, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
}

export default async function globalSetup(): Promise<void> {
  console.log("\n  [e2e-live] Starting setup...\n");

  const loaded: Record<string, string> = {};
  for (const f of [path.join(MILAIDY_ROOT, ".env"), path.join(WORKSPACE_ROOT, "eliza", ".env")])
    for (const [k, v] of Object.entries(loadEnvFile(f))) if (!loaded[k]) loaded[k] = v;
  for (const [k, v] of Object.entries(loaded)) if (!process.env[k]) process.env[k] = v;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY)
    throw new Error("[e2e-live] No LLM API key found");

  const apiInUse = await isPortInUse(API_PORT);
  const uiInUse = await isPortInUse(UI_PORT);
  let apiPid: number | null = null;
  let vitePid: number | null = null;
  let testHome: string | null = null;

  if (apiInUse) {
    console.log(`  [e2e-live] API on :${API_PORT} — reusing`);
  } else {
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), "milaidy-e2e-live-"));
    console.log(`  [e2e-live] HOME: ${testHome}`);
    createSeedConfig(testHome, loaded);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      HOME: testHome, USERPROFILE: testHome,
      MILAIDY_PORT: String(API_PORT), MILAIDY_HEADLESS: "1",
      LOG_LEVEL: "warn", NODE_ENV: "test",
    };
    for (const k of FORWARDED_KEYS) if (loaded[k]) env[k] = loaded[k];

    const proc = spawn("bun", ["src/runtime/dev-server.ts"], {
      cwd: MILAIDY_ROOT, env, stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stderr?.on("data", (c: Buffer) => {
      const t = c.toString();
      if (/error|fatal/i.test(t)) process.stderr.write(`  [api] ${t}`);
    });

    const t0 = Date.now();
    await waitForPort(API_PORT, 180_000);
    console.log(`  [e2e-live] Port open (${((Date.now() - t0) / 1000).toFixed(1)}s), waiting for runtime...`);
    await waitForAgentReady(API_PORT, 180_000);
    console.log(`  [e2e-live] Ready (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    apiPid = proc.pid ?? null;
  }

  if (uiInUse) {
    console.log(`  [e2e-live] Vite on :${UI_PORT} — reusing`);
  } else {
    const viteEnv = { ...(process.env as Record<string, string>), MILAIDY_API_PORT: String(API_PORT) };
    const proc = spawn("npx", ["vite", "--port", String(UI_PORT), "--strictPort"], {
      cwd: UI_ROOT, env: viteEnv, stdio: ["pipe", "pipe", "pipe"],
    });
    await waitForPort(UI_PORT, 60_000);
    console.log(`  [e2e-live] Vite ready`);
    vitePid = proc.pid ?? null;
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify({
    apiPid, vitePid, testHome, reusedApi: apiInUse, reusedUi: uiInUse,
  }));
  console.log(`\n  [e2e-live] http://localhost:${UI_PORT}\n`);
}
