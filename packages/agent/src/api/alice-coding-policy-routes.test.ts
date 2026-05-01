import { describe, expect, it } from "vitest";
import { handleAliceCodingPolicyRoutes } from "./alice-coding-policy-routes";

function makeContext({
  method,
  pathname,
  body,
}: {
  method: string;
  pathname: string;
  body?: Record<string, unknown>;
}) {
  const jsonCalls: Array<{ data: unknown; status?: number }> = [];
  const errorCalls: Array<{ message: string; status?: number }> = [];
  return {
    ctx: {
      req: {} as never,
      res: {} as never,
      method,
      pathname,
      config: {},
      readJsonBody: async () => body ?? {},
      json: (_res: unknown, data: unknown, status?: number) => {
        jsonCalls.push({ data, status });
      },
      error: (_res: unknown, message: string, status?: number) => {
        errorCalls.push({ message, status });
      },
    },
    jsonCalls,
    errorCalls,
  };
}

describe("handleAliceCodingPolicyRoutes", () => {
  it("exposes Alice's allowed repo and deploy rail policy", async () => {
    const { ctx, jsonCalls } = makeContext({
      method: "GET",
      pathname: "/api/alice/coding/policy",
    });

    await expect(handleAliceCodingPolicyRoutes(ctx)).resolves.toBe(true);

    expect(jsonCalls[0]?.data).toMatchObject({
      ok: true,
      policy: {
        allowedRepos: [
          "rndrntwrk/milaidy",
          "Render-Network-OS/555-bot",
          "Render-Network-OS/stream",
        ],
        deployRail: "webhook",
        productionDeploys: "approval",
      },
    });
  });

  it("rejects production deploy decisions unless human approval is attached", async () => {
    const { ctx, jsonCalls } = makeContext({
      method: "POST",
      pathname: "/api/alice/coding/decision",
      body: {
        action: "deploy",
        repo: "rndrntwrk/milaidy",
        environment: "production",
        deployRail: "webhook",
      },
    });

    await expect(handleAliceCodingPolicyRoutes(ctx)).resolves.toBe(true);

    expect(jsonCalls[0]?.data).toMatchObject({
      ok: true,
      decision: {
        allowed: false,
        requiresApproval: true,
      },
    });
  });

  it("blocks deploys that bypass the Ops-visible webhook rail", async () => {
    const { ctx, jsonCalls } = makeContext({
      method: "POST",
      pathname: "/api/alice/coding/decision",
      body: {
        action: "deploy",
        repo: "rndrntwrk/milaidy",
        environment: "staging",
        deployRail: "local-shell",
      },
    });

    await handleAliceCodingPolicyRoutes(ctx);

    expect(jsonCalls[0]?.data).toMatchObject({
      ok: true,
      decision: {
        allowed: false,
        requiresApproval: false,
        reason: "Deploys must use the webhook rail so they are visible in Ops.",
      },
    });
  });

  it("rejects unknown coding actions before policy evaluation", async () => {
    const { ctx, errorCalls } = makeContext({
      method: "POST",
      pathname: "/api/alice/coding/decision",
      body: {
        action: "rm_everything",
        repo: "rndrntwrk/milaidy",
      },
    });

    await handleAliceCodingPolicyRoutes(ctx);

    expect(errorCalls).toEqual([
      { message: "Invalid Alice coding action request", status: 400 },
    ]);
  });

  it("rejects deploy decisions without a valid environment", async () => {
    const { ctx, errorCalls } = makeContext({
      method: "POST",
      pathname: "/api/alice/coding/decision",
      body: {
        action: "deploy",
        repo: "rndrntwrk/milaidy",
        deployRail: "webhook",
      },
    });

    await handleAliceCodingPolicyRoutes(ctx);

    expect(errorCalls).toEqual([
      { message: "Invalid Alice coding action request", status: 400 },
    ]);
  });
});
