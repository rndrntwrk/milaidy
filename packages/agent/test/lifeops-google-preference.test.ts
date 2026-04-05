import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { IAgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { saveEnv } from "../../../test/helpers/test-utils";
import { ManagedGoogleClientError } from "../src/lifeops/google-managed-client";
import {
  createLifeOpsConnectorGrant,
  LifeOpsRepository,
} from "../src/lifeops/repository";
import { LifeOpsService } from "../src/lifeops/service";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) {
    return "";
  }
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) {
        return value.join("");
      }
      return String(value ?? "");
    })
    .join("");
}

function createRuntime(agentId: string, databasePath: string): IAgentRuntime {
  const sqlite = new DatabaseSync(databasePath);
  return {
    agentId,
    character: {
      name: `${agentId}-agent`,
    } as IAgentRuntime["character"],
    getSetting: () => undefined,
    getService: () => null,
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          if (sql.length === 0) {
            return [];
          }
          if (/^(select|pragma)\b/i.test(sql)) {
            return sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
          }
          sqlite.exec(sql);
          return [];
        },
      },
    },
  } as unknown as IAgentRuntime;
}

async function seedGoogleGrants(
  repository: LifeOpsRepository,
  agentId: string,
  preferredMode: "local" | "cloud_managed",
): Promise<void> {
  await repository.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId,
      provider: "google",
      identity: {},
      grantedScopes: [],
      capabilities: [],
      tokenRef: null,
      mode: "local",
      preferredByAgent: preferredMode === "local",
      metadata: {},
      lastRefreshAt: null,
    }),
  );
  await repository.upsertConnectorGrant(
    createLifeOpsConnectorGrant({
      agentId,
      provider: "google",
      identity: {},
      grantedScopes: [],
      capabilities: [],
      tokenRef: null,
      mode: "cloud_managed",
      executionTarget: "cloud",
      sourceOfTruth: "cloud_connection",
      preferredByAgent: preferredMode === "cloud_managed",
      cloudConnectionId: `cloud-${agentId}`,
      metadata: {},
      lastRefreshAt: null,
    }),
  );
}

describe("life-ops Google mode preference", () => {
  let databasePath = "";
  let envBackup: { restore: () => void };

  beforeAll(async () => {
    envBackup = saveEnv(
      "ELIZAOS_CLOUD_API_KEY",
      "ELIZAOS_CLOUD_BASE_URL",
      "MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID",
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID",
      "MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      "ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET",
      "MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL",
      "ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL",
    );
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_BASE_URL;
    delete process.env.MILADY_GOOGLE_OAUTH_DESKTOP_CLIENT_ID;
    delete process.env.ELIZA_GOOGLE_OAUTH_DESKTOP_CLIENT_ID;
    delete process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_ID;
    delete process.env.ELIZA_GOOGLE_OAUTH_WEB_CLIENT_ID;
    delete process.env.MILADY_GOOGLE_OAUTH_WEB_CLIENT_SECRET;
    delete process.env.ELIZA_GOOGLE_OAUTH_WEB_CLIENT_SECRET;
    delete process.env.MILADY_GOOGLE_OAUTH_PUBLIC_BASE_URL;
    delete process.env.ELIZA_GOOGLE_OAUTH_PUBLIC_BASE_URL;

    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "lifeops-google-preference-"),
    );
    databasePath = path.join(tempDir, "lifeops.sqlite");
  });

  afterAll(async () => {
    if (databasePath) {
      await fs.rm(path.dirname(databasePath), {
        recursive: true,
        force: true,
      });
    }
    envBackup.restore();
  });

  it("stores Google preference per agent instead of globally", async () => {
    const runtimeA = createRuntime("lifeops-google-agent-a", databasePath);
    const runtimeB = createRuntime("lifeops-google-agent-b", databasePath);
    const repositoryA = new LifeOpsRepository(runtimeA);
    const repositoryB = new LifeOpsRepository(runtimeB);
    const serviceA = new LifeOpsService(runtimeA);
    const serviceB = new LifeOpsService(runtimeB);
    const requestUrl = new URL(
      "http://127.0.0.1:3000/api/lifeops/connectors/google/status",
    );

    await seedGoogleGrants(
      repositoryA,
      "lifeops-google-agent-a",
      "cloud_managed",
    );
    await seedGoogleGrants(repositoryB, "lifeops-google-agent-b", "local");

    const switchedLocalStatus = await serviceA.selectGoogleConnectorMode(
      requestUrl,
      "local",
    );
    const agentAGrants = await repositoryA.listConnectorGrants(
      "lifeops-google-agent-a",
    );
    const agentBGrantsAfterA = await repositoryB.listConnectorGrants(
      "lifeops-google-agent-b",
    );

    expect(switchedLocalStatus.mode).toBe("local");
    expect(switchedLocalStatus.preferredByAgent).toBe(true);
    expect(
      agentAGrants.find((grant) => grant.mode === "local")?.preferredByAgent,
    ).toBe(true);
    expect(
      agentAGrants.find((grant) => grant.mode === "cloud_managed")
        ?.preferredByAgent,
    ).toBe(false);
    expect(
      agentBGrantsAfterA.find((grant) => grant.mode === "local")
        ?.preferredByAgent,
    ).toBe(true);
    expect(
      agentBGrantsAfterA.find((grant) => grant.mode === "cloud_managed")
        ?.preferredByAgent,
    ).toBe(false);

    const switchedCloudStatus = await serviceB.selectGoogleConnectorMode(
      requestUrl,
      "cloud_managed",
    );
    const agentAGrantsAfterB = await repositoryA.listConnectorGrants(
      "lifeops-google-agent-a",
    );
    const agentBGrants = await repositoryB.listConnectorGrants(
      "lifeops-google-agent-b",
    );

    expect(switchedCloudStatus.mode).toBe("cloud_managed");
    expect(switchedCloudStatus.preferredByAgent).toBe(true);
    expect(
      agentAGrantsAfterB.find((grant) => grant.mode === "local")
        ?.preferredByAgent,
    ).toBe(true);
    expect(
      agentAGrantsAfterB.find((grant) => grant.mode === "cloud_managed")
        ?.preferredByAgent,
    ).toBe(false);
    expect(
      agentBGrants.find((grant) => grant.mode === "local")?.preferredByAgent,
    ).toBe(false);
    expect(
      agentBGrants.find((grant) => grant.mode === "cloud_managed")
        ?.preferredByAgent,
    ).toBe(true);
  });

  it("treats missing managed Google status endpoints as unavailable instead of crashing", async () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "test-cloud-key";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://www.elizacloud.ai";

    const runtime = createRuntime("lifeops-google-status-agent", databasePath);
    const service = new LifeOpsService(runtime);

    (
      service as unknown as {
        googleManagedClient: { getStatus: () => Promise<never> };
      }
    ).googleManagedClient = {
      getStatus: vi
        .fn()
        .mockRejectedValue(new Error("should not be called through network")),
    };

    vi.spyOn(
      (
        service as unknown as {
          googleManagedClient: { getStatus: () => Promise<never> };
        }
      ).googleManagedClient,
      "getStatus",
    ).mockRejectedValueOnce(new ManagedGoogleClientError(404, "404 Not Found"));

    const status = await service.getGoogleConnectorStatus(
      new URL("http://127.0.0.1:3000/api/lifeops/connectors/google/status"),
    );

    expect(status.connected).toBe(false);
    expect(status.configured).toBe(false);
    expect(status.reason).toBe("config_missing");
    expect(status.availableModes).toEqual([]);
    expect(status.mode).toBe("local");

    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_BASE_URL;
  });
});
