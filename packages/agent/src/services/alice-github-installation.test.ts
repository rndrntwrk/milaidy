import { generateKeyPairSync } from "node:crypto";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AliceGitHubInstallationService,
  captureAliceGitHubAppSigningMaterial,
} from "./alice-github-installation";

const runtime = {} as IAgentRuntime;
const unconfiguredService = new AliceGitHubInstallationService(runtime);
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
captureAliceGitHubAppSigningMaterial({
  GITHUB_APP_ID: "123",
  GITHUB_APP_PRIVATE_KEY_B64: Buffer.from(privateKey).toString("base64"),
});

const installation = {
  id: 456,
  app_id: 123,
  account: { login: "rndrntwrk" },
  repository_selection: "selected",
  suspended_at: null,
};

describe("Alice GitHub installation readback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports missing captured signing material as unavailable without a request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(unconfiguredService.readCodingStatus()).resolves.toEqual({
      configured: false,
      verification: "unavailable",
      installations: [],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("verifies complete App installation pages and returns only allowed account scope", async () => {
    const firstPage = [
      installation,
      ...Array.from({ length: 99 }, (_, index) => ({
        ...installation,
        id: 1_000 + index,
        account: { login: "other-owner" },
      })),
    ];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(
        Response.json([
          {
            ...installation,
            id: 789,
            account: { login: "Render-Network-OS" },
            repository_selection: "all",
          },
          { ...installation, app_id: 999 },
          { ...installation, suspended_at: "2026-09-27T00:00:00Z" },
        ]),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      new AliceGitHubInstallationService(runtime).readCodingStatus(),
    ).resolves.toEqual({
      configured: true,
      verification: "verified",
      installations: [
        {
          installationId: 456,
          accountLogin: "rndrntwrk",
          repositorySelection: "selected",
        },
        {
          installationId: 789,
          accountLogin: "Render-Network-OS",
          repositorySelection: "all",
        },
      ],
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/app/installations?per_page=100&page=1",
      "https://api.github.com/app/installations?per_page=100&page=2",
    ]);
    const request = fetcher.mock.calls[0][1];
    expect(request).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: { "x-github-api-version": "2022-11-28" },
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const jwt = request.headers.authorization.slice("Bearer ".length);
    expect(
      JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).iss,
    ).toBe(123);
  });

  it("drops partial results and redacts provider failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(Array.from({ length: 100 }, () => installation)),
      )
      .mockRejectedValueOnce(new Error(`Bearer secret-token ${privateKey}`));
    vi.stubGlobal("fetch", fetcher);
    const status = await new AliceGitHubInstallationService(
      runtime,
    ).readCodingStatus();
    expect(status).toEqual({
      configured: true,
      verification: "unavailable",
      installations: [],
    });
    expect(JSON.stringify(status)).not.toContain("secret-token");
    expect(JSON.stringify(status)).not.toContain("PRIVATE KEY");
  });
});
