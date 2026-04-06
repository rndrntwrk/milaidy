import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createConversation,
  postConversationMessage,
  req,
} from "../../../test/helpers/http";

const LIVE_TESTS_ENABLED =
  process.env.MILADY_LIVE_TEST === "1" || process.env.ELIZA_LIVE_TEST === "1";
const LIVE_CHAT_TESTS_ENABLED = process.env.MILADY_LIVE_CHAT_TEST === "1";
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const ENV_PATH = path.join(REPO_ROOT, ".env");

try {
  const { config } = await import("dotenv");
  config({ path: ENV_PATH });
} catch {
  // dotenv is optional in this environment.
}

const LIVE_PROVIDER_CANDIDATES = [
  {
    name: "groq",
    keys: ["GROQ_API_KEY"],
    predicate: () =>
      /groq/i.test(process.env.OPENAI_BASE_URL ?? "") ||
      !process.env.OPENAI_API_KEY?.trim(),
  },
  {
    name: "openai",
    keys: ["OPENAI_API_KEY"],
    predicate: () => !/groq/i.test(process.env.OPENAI_BASE_URL ?? ""),
  },
  {
    name: "groq",
    keys: ["GROQ_API_KEY"],
    predicate: () => true,
  },
  {
    name: "openrouter",
    keys: ["OPENROUTER_API_KEY"],
    predicate: () => true,
  },
  {
    name: "google",
    keys: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
    predicate: () => true,
  },
  {
    name: "anthropic",
    keys: ["ANTHROPIC_API_KEY"],
    predicate: () => true,
  },
] as const;

function selectLiveProvider(): {
  name: string;
  env: Record<string, string>;
} | null {
  for (const candidate of LIVE_PROVIDER_CANDIDATES) {
    if (!candidate.predicate()) {
      continue;
    }
    const env: Record<string, string> = {};
    for (const key of candidate.keys) {
      const value = process.env[key]?.trim();
      if (value) {
        env[key] = value;
      }
    }
    if (Object.keys(env).length > 0) {
      return {
        name: candidate.name,
        env,
      };
    }
  }

  return null;
}

const selectedLiveProvider = selectLiveProvider();

function resolveSelectedProviderPlugin(): string | null {
  switch (selectedLiveProvider?.name) {
    case "groq":
      return "@elizaos/plugin-groq";
    case "openai":
      return "@elizaos/plugin-openai";
    case "openrouter":
      return "@elizaos/plugin-openrouter";
    case "google":
      return "@elizaos/plugin-google-genai";
    case "anthropic":
      return "@elizaos/plugin-anthropic";
    default:
      return null;
  }
}

const selectedLiveProviderPlugin = resolveSelectedProviderPlugin();

type StartedRuntime = {
  close: () => Promise<void>;
  getLogTail: () => string;
  port: number;
};

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback port"));
        return;
      }

      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode != null) {
    return true;
  }

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const handleExit = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.off("exit", handleExit);
      child.off("close", handleExit);
    };

    child.once("exit", handleExit);
    child.once("close", handleExit);
  });
}

async function waitForJsonPredicate<T>(
  url: string,
  predicate: (value: T) => boolean,
  timeoutMs: number = 150_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
      }

      const data = (await response.json()) as T;
      if (predicate(data)) {
        return data;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(1_000);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for ${url}`);
}

async function waitForTrajectoryCall(
  port: number,
  expectedUserPrompt: string,
  timeoutMs: number = 120_000,
): Promise<{
  trajectoryId: string;
  llmCall: {
    systemPrompt?: string;
    userPrompt?: string;
    response?: string;
  };
}> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const list = await req(port, "GET", "/api/trajectories?limit=20");
    const trajectories = Array.isArray(list.data.trajectories)
      ? (list.data.trajectories as Array<{ id?: string }>)
      : [];

    for (const trajectory of trajectories) {
      const trajectoryId = String(trajectory.id ?? "");
      if (!trajectoryId) continue;

      const detail = await req(
        port,
        "GET",
        `/api/trajectories/${encodeURIComponent(trajectoryId)}`,
      );
      const llmCalls = Array.isArray(detail.data.llmCalls)
        ? (detail.data.llmCalls as Array<{
            systemPrompt?: string;
            userPrompt?: string;
            response?: string;
          }>)
        : [];

      const match = llmCalls.find(
        (call) => String(call.userPrompt ?? "") === expectedUserPrompt,
      );
      if (match) {
        return { trajectoryId, llmCall: match };
      }
    }

    await sleep(1_000);
  }

  throw new Error("Timed out waiting for a live LifeOps trajectory");
}

async function waitForDefinitionByTitle(
  port: number,
  title: string,
  predicate?: (entry: {
    definition?: Record<string, unknown>;
    reminderPlan?: Record<string, unknown> | null;
  }) => boolean,
): Promise<{
  definition?: Record<string, unknown>;
  reminderPlan?: Record<string, unknown> | null;
}> {
  const response = await waitForJsonPredicate<{
    definitions?: Array<{
      definition?: Record<string, unknown>;
      reminderPlan?: Record<string, unknown> | null;
    }>;
  }>(
    `http://127.0.0.1:${port}/api/lifeops/definitions`,
    (value) =>
      Array.isArray(value.definitions) &&
      value.definitions.some(
        (entry) =>
          entry.definition?.title === title && (predicate?.(entry) ?? true),
      ),
  );

  const match = response.definitions?.find(
    (entry) => entry.definition?.title === title && (predicate?.(entry) ?? true),
  );
  if (!match) {
    throw new Error(`Timed out waiting for ${title} definition`);
  }
  return match;
}

async function startLiveRuntime(): Promise<StartedRuntime> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "milady-lifeops-live-"));
  const stateDir = path.join(tempRoot, "state");
  const configPath = path.join(tempRoot, "eliza.json");
  const apiPort = await getFreePort();
  const logs: string[] = [];

  await mkdir(stateDir, { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        logging: { level: "info" },
        plugins: {
          allow: [selectedLiveProviderPlugin].filter(
            (entry): entry is string => typeof entry === "string",
          ),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const child = spawn("bun", ["run", "start:eliza"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...(selectedLiveProvider?.env ?? {}),
      ELIZA_CONFIG_PATH: configPath,
      MILADY_CONFIG_PATH: configPath,
      ELIZA_STATE_DIR: stateDir,
      MILADY_STATE_DIR: stateDir,
      ELIZA_PORT: String(apiPort),
      MILADY_API_PORT: String(apiPort),
      ELIZA_DISABLE_LOCAL_EMBEDDINGS: "1",
      MILADY_DISABLE_LOCAL_EMBEDDINGS: "1",
      DISCORD_API_TOKEN: "",
      DISCORD_BOT_TOKEN: "",
      TELEGRAM_BOT_TOKEN: "",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => logs.push(chunk));
  child.stderr.on("data", (chunk: string) => logs.push(chunk));

  try {
    await waitForJsonPredicate<{ ready?: boolean; runtime?: string }>(
      `http://127.0.0.1:${apiPort}/api/health`,
      (value) => value.ready === true && value.runtime === "ok",
    );
  } catch (error) {
    const logTail = logs.join("").slice(-8_000);
    if (child.exitCode == null) {
      child.kill("SIGKILL");
      await waitForChildExit(child, 5_000);
    }
    await rm(tempRoot, { recursive: true, force: true });
    throw new Error(
      `Live runtime failed to start: ${error instanceof Error ? error.message : String(error)}\n${logTail}`,
    );
  }

  return {
    port: apiPort,
    getLogTail: () => logs.join("").slice(-8_000),
    close: async () => {
      if (child.exitCode == null) {
        child.kill("SIGTERM");
        const exited = await waitForChildExit(child, 10_000);
        if (!exited && child.exitCode == null) {
          child.kill("SIGKILL");
          await waitForChildExit(child, 5_000);
        }
      }
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

function assertNoProviderIssue(
  turnName: string,
  text: string,
  runtime: StartedRuntime,
): void {
  if (!/provider issue/i.test(text)) {
    return;
  }

  throw new Error(
    `${turnName} returned a provider issue reply.\n${runtime.getLogTail()}`,
  );
}

describe.skipIf(
  !(
    LIVE_TESTS_ENABLED &&
    LIVE_CHAT_TESTS_ENABLED &&
    selectedLiveProvider &&
    selectedLiveProviderPlugin
  ),
)("Live: LifeOps seeded brush-teeth chat roundtrip", () => {
  let runtime: StartedRuntime | undefined;

  beforeAll(async () => {
    runtime = await startLiveRuntime();
  }, 120_000);

  afterAll(async () => {
    if (runtime) {
      await runtime.close();
    }
  });

  it("creates the seeded brush-teeth routine through chat and records a real trajectory", async () => {
    const liveRuntime = runtime!;
    const { conversationId } = await createConversation(liveRuntime.port, {
      title: "Live LifeOps",
    });

    const prompt =
      "Use LifeOps now. Actually create a routine named Brush teeth that happens every morning and every night. Do not just give advice.";
    const response = await postConversationMessage(
      liveRuntime.port,
      conversationId,
      {
      text: prompt,
      mode: "power",
      },
    );
    expect(response.status).toBe(200);

    const responseText = String(response.data.text ?? "");
    assertNoProviderIssue("brush-teeth creation", responseText, liveRuntime);
    expect(responseText).toContain("Brush teeth");

    const trajectory = await waitForTrajectoryCall(liveRuntime.port, prompt);
    expect(trajectory.trajectoryId.length).toBeGreaterThan(0);
    expect(String(trajectory.llmCall.response ?? "").length).toBeGreaterThan(0);

    const brushTeeth = await waitForDefinitionByTitle(
      liveRuntime.port,
      "Brush teeth",
      (entry) =>
        (entry.definition?.cadence as { kind?: string } | undefined)?.kind ===
        "daily",
    );
    expect(brushTeeth).toBeDefined();
    expect(brushTeeth.definition?.cadence).toMatchObject({
      kind: "daily",
      windows: expect.arrayContaining(["morning", "night"]),
    });
    expect(brushTeeth.reminderPlan?.id ?? null).not.toBeNull();

    const overview = await req(liveRuntime.port, "GET", "/api/lifeops/overview");
    expect(overview.status).toBe(200);
    const definitionId = String(brushTeeth.definition?.id ?? "");
    const windows = (
      overview.data.occurrences as Array<Record<string, unknown>>
    )
      .filter((occurrence) => occurrence.definitionId === definitionId)
      .map((occurrence) => String(occurrence.windowName ?? ""));
    expect(windows).toEqual(expect.arrayContaining(["morning", "night"]));
  }, 180_000);

  it("creates a blocker-aware workout habit through chat and stores earned-access policy", async () => {
    const liveRuntime = runtime!;
    const { conversationId } = await createConversation(liveRuntime.port, {
      title: "Live LifeOps Workout",
    });

    const prompt =
      "Use LifeOps now. Actually create a habit named Workout that happens every afternoon, blocks X, Instagram, and Hacker News until I complete it, and then unlocks them for 60 minutes. Do not just give advice.";
    const response = await postConversationMessage(
      liveRuntime.port,
      conversationId,
      {
        text: prompt,
        mode: "power",
      },
    );
    expect(response.status).toBe(200);

    const responseText = String(response.data.text ?? "");
    assertNoProviderIssue("workout creation", responseText, liveRuntime);
    expect(responseText).toContain("Workout");

    const trajectory = await waitForTrajectoryCall(liveRuntime.port, prompt);
    expect(trajectory.trajectoryId.length).toBeGreaterThan(0);
    expect(String(trajectory.llmCall.response ?? "").length).toBeGreaterThan(0);

    const workout = await waitForDefinitionByTitle(
      liveRuntime.port,
      "Workout",
      (entry) =>
        (entry.definition?.websiteAccess as { unlockMode?: string } | undefined)
          ?.unlockMode === "fixed_duration",
    );
    expect(workout.definition?.cadence).toMatchObject({
      kind: "daily",
      windows: expect.arrayContaining(["afternoon"]),
    });
    expect(workout.definition?.websiteAccess).toMatchObject({
      unlockMode: "fixed_duration",
      unlockDurationMinutes: 60,
      websites: expect.arrayContaining([
        "x.com",
        "twitter.com",
        "instagram.com",
        "news.ycombinator.com",
      ]),
    });
    expect(workout.reminderPlan?.id ?? null).not.toBeNull();
  }, 180_000);

  it("creates a meal-window vitamin routine through chat", async () => {
    const liveRuntime = runtime!;
    const { conversationId } = await createConversation(liveRuntime.port, {
      title: "Live LifeOps Vitamins",
    });

    const prompt =
      "Use LifeOps now. Actually create a routine named Take vitamins that reminds me to take them with lunch every day. Do not just give advice.";
    const response = await postConversationMessage(
      liveRuntime.port,
      conversationId,
      {
        text: prompt,
        mode: "power",
      },
    );
    expect(response.status).toBe(200);

    const responseText = String(response.data.text ?? "");
    assertNoProviderIssue("vitamins creation", responseText, liveRuntime);
    expect(responseText).toContain("Take vitamins");

    const trajectory = await waitForTrajectoryCall(liveRuntime.port, prompt);
    expect(trajectory.trajectoryId.length).toBeGreaterThan(0);
    expect(String(trajectory.llmCall.response ?? "").length).toBeGreaterThan(0);

    const vitamins = await waitForDefinitionByTitle(
      liveRuntime.port,
      "Take vitamins",
    );
    expect(vitamins.definition?.cadence).toMatchObject({
      kind: "daily",
      windows: expect.arrayContaining(["afternoon"]),
    });
    expect(vitamins.reminderPlan?.id ?? null).not.toBeNull();
  }, 180_000);
});
