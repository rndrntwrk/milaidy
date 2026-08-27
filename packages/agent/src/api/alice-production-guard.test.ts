import { describe, expect, it } from "vitest";
import {
  evaluateAliceProductionRequest,
  isAliceProductionChatIngressAuthenticated,
  isAliceProductionRequestAuthenticated,
  isAliceProductionRuntime,
  shouldStartOptionalRuntimeSubsystems,
} from "./alice-production-guard";

const aliceEnv = {
  ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
};

const fullAliceEnv = {
  ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
  ALICE_RUNTIME_PROFILE: "full-gated",
};

describe("Alice production runtime guard", () => {
  it("activates only for the exact proposer-only authority mode", () => {
    expect(isAliceProductionRuntime(aliceEnv)).toBe(true);
    expect(isAliceProductionRuntime({})).toBe(false);
    expect(
      isAliceProductionRuntime({ ALICE_RUNTIME_AUTHORITY_MODE: "PROPOSER-ONLY" }),
    ).toBe(false);
  });

  it("suppresses every optional background subsystem in production-core mode", () => {
    expect(shouldStartOptionalRuntimeSubsystems(aliceEnv)).toBe(false);
    expect(shouldStartOptionalRuntimeSubsystems(fullAliceEnv)).toBe(true);
    expect(
      shouldStartOptionalRuntimeSubsystems({
        ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
        ALICE_RUNTIME_PROFILE: "FULL-GATED",
      }),
    ).toBe(false);
    expect(
      shouldStartOptionalRuntimeSubsystems({
        ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
        ALICE_RUNTIME_PROFILE: " full-gated ",
      }),
    ).toBe(false);
    expect(shouldStartOptionalRuntimeSubsystems({})).toBe(true);
  });

  it("restores authenticated product surfaces only for the exact full-gated profile", () => {
    for (const [method, pathname] of [
      ["GET", "/"],
      ["GET", "/companion"],
      ["GET", "/broadcast/alice-cam"],
      ["GET", "/api/broadcast/alice-cam/scene"],
      ["GET", "/api/conversations"],
      ["POST", "/api/conversations"],
      ["POST", "/api/conversations/7/messages"],
      ["POST", "/api/companion/stage"],
    ]) {
      expect(
        evaluateAliceProductionRequest(method, pathname, fullAliceEnv),
      ).toEqual({ allowed: true });
    }

    expect(
      evaluateAliceProductionRequest("POST", "/api/conversations", {
        ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
        ALICE_RUNTIME_PROFILE: "FULL-GATED",
      }),
    ).toEqual({
      allowed: false,
      code: "ALICE_PRODUCTION_MUTATION_DENIED",
    });
  });

  it("keeps high-risk and WebSocket surfaces denied without an exact grant", () => {
    for (const [method, pathname] of [
      ["POST", "/api/wallet/trade/execute"],
      ["POST", "/api/wallet/transfer"],
      ["POST", "/api/connectors/discord/messages"],
      ["POST", "/api/stream/start"],
      ["POST", "/api/cloud/deploy"],
      ["POST", "/api/repository/merge"],
      ["POST", "/api/sandbox/exec"],
      ["POST", "/api/unreviewed/execute"],
      ["GET", "/api/secrets"],
      ["GET", "/api/wallet/keys"],
      ["GET", "/ws"],
    ]) {
      expect(
        evaluateAliceProductionRequest(method, pathname, fullAliceEnv),
      ).toEqual({
        allowed: false,
        code: "ALICE_PRODUCTION_MUTATION_DENIED",
      });
    }
  });

  it("allows read-only status and only the durable bounded chat write surface", () => {
    for (const [method, pathname] of [
      ["GET", "/api/health"],
      ["HEAD", "/api/alice-production/proof"],
      ["OPTIONS", "/api/conversations"],
      ["POST", "/v1/chat/completions"],
    ]) {
      expect(evaluateAliceProductionRequest(method, pathname, aliceEnv)).toEqual({
        allowed: true,
      });
    }
  });

  it("denies runtime/plugin/admin/custody mutations even for an authenticated owner", () => {
    for (const [method, pathname] of [
      ["PUT", "/api/plugins/plugin-evm"],
      ["POST", "/api/plugins/install"],
      ["DELETE", "/api/plugins/plugin-openai"],
      ["POST", "/api/config"],
      ["POST", "/api/secrets"],
      ["PUT", "/api/permissions/state"],
      ["POST", "/api/wallet/import"],
      ["POST", "/api/wallet/trade/execute"],
      ["POST", "/api/provider/switch"],
      ["POST", "/api/connectors/discord"],
      ["POST", "/api/skills/marketplace/install"],
      ["POST", "/api/terminal/run"],
      ["POST", "/api/custom-actions"],
      ["POST", "/api/agent/reset"],
      ["POST", "/api/restart"],
      ["POST", "/api/stream/start"],
      ["POST", "/api/sandbox/exec"],
      ["POST", "/api/cloud/agents"],
      ["POST", "/api/conversations"],
      ["POST", "/api/conversations/7/messages"],
      ["POST", "/api/conversations/7/messages/stream"],
      ["POST", "/api/conversations/7/greeting"],
      ["POST", "/v1/messages"],
      ["PATCH", "/api/conversations/7"],
      ["DELETE", "/api/conversations/7"],
      ["GET", "/api/wallet/keys"],
      ["GET", "/api/runtime"],
      ["GET", "/api/secrets"],
      ["GET", "/api/onboarding/status"],
      ["GET", "/api/broadcast/alice-cam/scene"],
      ["GET", "/api/conversations"],
      ["GET", "/api/conversations/7/messages"],
      ["GET", "/broadcast/alice-cam"],
      ["GET", "/ws"],
    ]) {
      expect(evaluateAliceProductionRequest(method, pathname, aliceEnv)).toEqual({
        allowed: false,
        code: "ALICE_PRODUCTION_MUTATION_DENIED",
      });
    }
  });

  it("does not alter non-Alice runtime behavior", () => {
    expect(evaluateAliceProductionRequest("POST", "/api/plugins/install", {})).toEqual({
      allowed: true,
    });
  });

  it("fails closed without a configured bearer or exact trusted-proxy proof", () => {
    expect(
      isAliceProductionRequestAuthenticated({
        authDisabled: false,
        trustedProxyAuthenticated: false,
        bearerConfigured: false,
        bearerMatches: false,
      }),
    ).toBe(false);
    expect(
      isAliceProductionRequestAuthenticated({
        authDisabled: true,
        trustedProxyAuthenticated: false,
        bearerConfigured: true,
        bearerMatches: true,
      }),
    ).toBe(false);
    expect(
      isAliceProductionRequestAuthenticated({
        authDisabled: false,
        trustedProxyAuthenticated: true,
        bearerConfigured: false,
        bearerMatches: false,
      }),
    ).toBe(true);
  });

  it("requires the trusted Access proxy for every durable production chat", () => {
    expect(isAliceProductionChatIngressAuthenticated(true)).toBe(true);
    expect(isAliceProductionChatIngressAuthenticated(false)).toBe(false);
  });
});
