/**
 * Live plugin lifecycle tests.
 *
 * Boots a real milady runtime with specific plugins enabled and verifies:
 * - Plugins are loaded and registered
 * - Plugin APIs respond correctly
 * - Plugin lifecycle hooks (start/stop) work on real infra
 *
 * Gated on MILADY_LIVE_TEST=1.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeIf } from "../../../test/helpers/conditional-tests.ts";
import { req } from "../../../test/helpers/http.ts";

const LIVE = process.env.MILADY_LIVE_TEST === "1" || process.env.ELIZA_LIVE_TEST === "1";
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

try {
  const { config } = await import("dotenv");
  config({ path: path.join(REPO_ROOT, ".env") });
} catch { /* dotenv optional */ }

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") { server.close(); reject(new Error("no port")); return; }
      server.close((e) => (e ? reject(e) : resolve(addr.port)));
    });
  });
}

type Runtime = { port: number; close: () => Promise<void>; logs: () => string };

async function startRuntimeWithPlugins(allowPlugins: string[]): Promise<Runtime> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "milady-plugin-lifecycle-"));
  const stateDir = path.join(tmp, "state");
  const configPath = path.join(tmp, "eliza.json");
  const port = await getFreePort();
  const logBuf: string[] = [];

  await mkdir(stateDir, { recursive: true });
  await writeFile(configPath, JSON.stringify({
    logging: { level: "info" },
    plugins: { allow: allowPlugins },
  }), "utf8");

  const child = spawn("bun", ["run", "start:eliza"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ELIZA_CONFIG_PATH: configPath,
      MILADY_CONFIG_PATH: configPath,
      ELIZA_STATE_DIR: stateDir,
      MILADY_STATE_DIR: stateDir,
      ELIZA_PORT: String(port),
      MILADY_API_PORT: String(port),
      ELIZA_DISABLE_LOCAL_EMBEDDINGS: "1",
      MILADY_DISABLE_LOCAL_EMBEDDINGS: "1",
      ALLOW_NO_DATABASE: "",
      DISCORD_API_TOKEN: "",
      DISCORD_BOT_TOKEN: "",
      TELEGRAM_BOT_TOKEN: "",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c: string) => logBuf.push(c));
  child.stderr.on("data", (c: string) => logBuf.push(c));

  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) {
        const d = (await r.json()) as { ready?: boolean; runtime?: string };
        if (d.ready === true && d.runtime === "ok") break;
      }
    } catch { /* not ready */ }
    await sleep(1_000);
  }

  return {
    port,
    logs: () => logBuf.join("").slice(-8_000),
    close: async () => {
      if (child.exitCode == null) {
        child.kill("SIGTERM");
        await new Promise<void>((r) => { child.once("exit", () => r()); setTimeout(() => r(), 10_000); });
        if (child.exitCode == null) child.kill("SIGKILL");
      }
      await rm(tmp, { recursive: true, force: true });
    },
  };
}

describeIf(LIVE)("Live: plugin lifecycle — selfcontrol", () => {
  let rt: Runtime;

  beforeAll(async () => {
    rt = await startRuntimeWithPlugins(["selfcontrol"]);
  }, 180_000);

  afterAll(async () => { if (rt) await rt.close(); });

  it("selfcontrol plugin is loaded and registers its API routes", async () => {
    const pluginsRes = await req(rt.port, "GET", "/api/plugins");
    expect(pluginsRes.status).toBe(200);

    // The website blocker endpoint should exist
    const blockerRes = await req(rt.port, "GET", "/api/website-blocker");
    expect(blockerRes.status).toBe(200);
    expect(blockerRes.data).toHaveProperty("active");
  });

  it("website blocker starts inactive with no blocked sites", async () => {
    const res = await req(rt.port, "GET", "/api/website-blocker");
    expect(res.data).toMatchObject({ active: false, websites: [] });
  });

  it("permissions endpoint responds", async () => {
    const res = await req(rt.port, "GET", "/api/permissions");
    expect([200, 404]).toContain(res.status);
  });
}, 300_000);

describeIf(LIVE)("Live: plugin lifecycle — minimal boot", () => {
  let rt: Runtime;

  beforeAll(async () => {
    rt = await startRuntimeWithPlugins([]);
  }, 180_000);

  afterAll(async () => { if (rt) await rt.close(); });

  it("runtime boots successfully with no optional plugins", async () => {
    const res = await req(rt.port, "GET", "/api/health");
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ ready: true, runtime: "ok" });
  });

  it("database is accessible through the API", async () => {
    // Creating a conversation exercises the real database layer
    const res = await req(rt.port, "POST", "/api/conversations", {
      title: "plugin lifecycle test",
    });
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("conversation");
  });
}, 300_000);
