import { describe, expect, test } from "bun:test";

import {
  authorizeDeploymentPause,
  authorizeEmergencyRecovery,
  authorizeInternalService,
  requiredInternalService,
} from "../src/internal-auth";

const config = {
  ALICE_ACCESS_GATEWAY_SERVICE_TOKEN:
    "access-control-token-with-at-least-32-bytes",
  ALICE_AI_GATEWAY_SERVICE_TOKEN:
    "ai-control-token-with-at-least-32-bytes----",
  ALICE_CONTROL_RECOVERY_TOKEN:
    "recovery-control-token-with-at-least-32-bytes",
  ALICE_DEPLOYMENT_PAUSE_TOKEN:
    "deployment-pause-token-with-at-least-32-bytes",
};

describe("Alice route-scoped internal service authentication", () => {
  test("maps transcript and release routes only to Access and model reserve only to AI", () => {
    expect(requiredInternalService("GET", "/control/internal/v1/runtime/admit")).toBe(
      "access-gateway",
    );
    expect(
      requiredInternalService(
        "POST",
        "/control/internal/v1/sessions/owner-primary/conversation/turn",
      ),
    ).toBe("access-gateway");
    expect(requiredInternalService("POST", "/control/internal/v1/model/reserve")).toBe(
      "ai-gateway",
    );
    expect(requiredInternalService("GET", "/control/internal/v1/model/binding")).toBe(
      "ai-gateway",
    );
    expect(requiredInternalService("POST", "/control/internal/v1/unknown")).toBeNull();
  });

  test("denies each gateway from using the other gateway's credential", () => {
    expect(
      authorizeInternalService(
        "access-gateway",
        config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
        config,
      ),
    ).toBe(true);
    expect(
      authorizeInternalService(
        "access-gateway",
        config.ALICE_AI_GATEWAY_SERVICE_TOKEN,
        config,
      ),
    ).toBe(false);
    expect(
      authorizeInternalService(
        "ai-gateway",
        config.ALICE_AI_GATEWAY_SERVICE_TOKEN,
        config,
      ),
    ).toBe(true);
    expect(
      authorizeInternalService(
        "ai-gateway",
        config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
        config,
      ),
    ).toBe(false);
  });

  test("isolates a malformed subordinate token to its own internal route", () => {
    const malformedAi = { ...config, ALICE_AI_GATEWAY_SERVICE_TOKEN: "short" };
    expect(
      authorizeInternalService(
        "access-gateway",
        config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
        malformedAi,
      ),
    ).toBe(true);
    expect(
      authorizeInternalService("ai-gateway", "short", malformedAi),
    ).toBe(false);

    const equal = {
      ...config,
      ALICE_AI_GATEWAY_SERVICE_TOKEN:
        config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
    };
    expect(
      authorizeInternalService(
        "access-gateway",
        equal.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
        equal,
      ),
    ).toBe(false);
    expect(
      authorizeInternalService(
        "ai-gateway",
        equal.ALICE_AI_GATEWAY_SERVICE_TOKEN,
        equal,
      ),
    ).toBe(false);
  });

  test("keeps deployment PAUSE_ALL separate from recovery signing authority", () => {
    expect(
      authorizeDeploymentPause(
        config.ALICE_DEPLOYMENT_PAUSE_TOKEN,
        config,
      ),
    ).toBe(true);
    for (const forbidden of [
      config.ALICE_CONTROL_RECOVERY_TOKEN,
      config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
      config.ALICE_AI_GATEWAY_SERVICE_TOKEN,
    ]) {
      expect(authorizeDeploymentPause(forbidden, config)).toBe(false);
    }
    expect(
      authorizeEmergencyRecovery(
        config.ALICE_CONTROL_RECOVERY_TOKEN,
        config,
      ),
    ).toBe(true);
    expect(
      authorizeEmergencyRecovery(
        config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
        config,
      ),
    ).toBe(false);
    expect(
      authorizeEmergencyRecovery(config.ALICE_DEPLOYMENT_PAUSE_TOKEN, config),
    ).toBe(false);
    expect(
      authorizeEmergencyRecovery(config.ALICE_CONTROL_RECOVERY_TOKEN, {
        ...config,
        ALICE_CONTROL_RECOVERY_TOKEN:
          config.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
      }),
    ).toBe(false);
    expect(
      authorizeDeploymentPause(config.ALICE_DEPLOYMENT_PAUSE_TOKEN, {
        ...config,
        ALICE_DEPLOYMENT_PAUSE_TOKEN: config.ALICE_CONTROL_RECOVERY_TOKEN,
      }),
    ).toBe(false);
  });
});
