import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime, State } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveEnv } from "../../../test/helpers/test-utils";
import { gmailAction } from "../src/actions/gmail";
import { resolveOAuthDir } from "../src/config/paths";
import {
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "../src/lifeops/repository";
import { createLifeOpsChatTestRuntime } from "./helpers/lifeops-chat-runtime";

const AGENT_ID = "lifeops-gmail-action-agent";

function makeMessage(text: string) {
  return {
    entityId: AGENT_ID,
    content: {
      source: "discord",
      text,
    },
  } as never;
}

function emptyState(): State {
  return {
    values: {
      recentMessages: "",
    },
    data: {},
  } as State;
}

async function seedLocalGmailTriageOnly(
  runtime: AgentRuntime,
  stateDir: string,
) {
  const repository = new LifeOpsRepository(runtime);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const tokenRef = `${AGENT_ID}/owner/local.json`;
  const tokenPath = path.join(
    resolveOAuthDir(process.env, stateDir),
    "lifeops",
    "google",
    tokenRef,
  );

  await fs.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(
    tokenPath,
    JSON.stringify(
      {
        provider: "google",
        agentId: AGENT_ID,
        side: "owner",
        mode: "local",
        clientId: "lifeops-gmail-action-client",
        redirectUri: "http://127.0.0.1/callback",
        accessToken: "gmail-action-access-token",
        refreshToken: "gmail-action-refresh-token",
        tokenType: "Bearer",
        grantedScopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.readonly",
        ],
        expiresAt: now + 60 * 60 * 1000,
        refreshTokenExpiresAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      null,
      2,
    ),
    {
      encoding: "utf-8",
      mode: 0o600,
    },
  );

  await repository.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId: AGENT_ID,
      provider: "google",
      side: "owner",
      identity: {
        email: "shawmakesmagic@gmail.com",
        name: "Shaw",
      },
      grantedScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      capabilities: ["google.basic_identity", "google.gmail.triage"],
      tokenRef,
      mode: "local",
      metadata: {},
      lastRefreshAt: nowIso,
    }),
  );
}

describe("GMAIL_ACTION capability messaging", () => {
  const envBackup = saveEnv("MILADY_STATE_DIR", "ELIZA_STATE_DIR");
  let stateDir = "";

  beforeAll(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-gmail-action-"));
    process.env.MILADY_STATE_DIR = stateDir;
    delete process.env.ELIZA_STATE_DIR;
  });

  afterAll(async () => {
    envBackup.restore();
    if (stateDir) {
      await fs.rm(stateDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  });

  it("keeps canonical reconnect guidance when Gmail send scope is missing", async () => {
    const prompts: string[] = [];
    const runtime = createLifeOpsChatTestRuntime({
      agentId: AGENT_ID,
      handleTurn: async () => ({
        text: "",
      }),
      useModel: async (_modelType, params) => {
        const prompt = String(params?.prompt ?? "");
        prompts.push(prompt);

        if (prompt.includes("Plan the Gmail action for this request.")) {
          return JSON.stringify({
            subaction: "send_message",
            shouldAct: true,
            response: null,
            queries: [],
          });
        }

        if (
          prompt.includes(
            "Write the assistant's user-facing reply for a Gmail interaction.",
          )
        ) {
          return "the current cloud-managed Gmail connector can't send messages yet, so i can't deliver it right now.";
        }

        return "";
      },
    });

    await seedLocalGmailTriageOnly(runtime, stateDir);

    const result = await gmailAction.handler?.(
      runtime,
      makeMessage(
        "send an email to nubs@nubs.site with subject testing this and body I'm inside your email",
      ),
      emptyState() as never,
      {
        parameters: {
          subaction: "send_message",
          details: {
            to: ["nubs@nubs.site"],
            subject: "testing this",
            bodyText: "I'm inside your email",
          },
        },
      } as never,
    );

    expect(result?.success).toBe(false);
    expect(String(result?.text ?? "")).toBe(
      "Gmail send access is not granted. Reconnect Google in LifeOps settings to allow email sending.",
    );
    expect(
      prompts.some((prompt) =>
        prompt.includes(
          "Write the assistant's user-facing reply for a Gmail interaction.",
        ),
      ),
    ).toBe(false);
  });
});
