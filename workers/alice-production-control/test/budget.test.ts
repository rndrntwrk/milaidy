import { describe, expect, test } from "bun:test";

import { reserveModelBudget } from "../src/policy";

const binding = {
  programDigest: "sha256:program",
  releaseDigest: "sha256:release",
  policyHash: "sha256:policy",
};

describe("Alice model budget", () => {
  test("rejects a reservation that would exceed the production ceiling", () => {
    expect(
      reserveModelBudget(
        {
          requestId: "inference-over-budget",
          model: "workers-ai/@cf/openai/gpt-oss-20b",
          estimatedUnits: 25,
          ...binding,
        },
        {
          binding,
          pausedScopes: [],
          usedUnits: 90,
          maxUnits: 100,
          existingReservation: null,
        },
      ),
    ).toEqual({
      allowed: false,
      code: "MODEL_BUDGET_EXCEEDED",
      usedUnits: 90,
      maxUnits: 100,
    });
  });

  test("reserves bounded units for an allowlisted model", () => {
    expect(
      reserveModelBudget(
        {
          requestId: "inference-bounded",
          model: "workers-ai/@cf/openai/gpt-oss-20b",
          estimatedUnits: 10,
          ...binding,
        },
        {
          binding,
          pausedScopes: [],
          usedUnits: 40,
          maxUnits: 100,
          existingReservation: null,
        },
      ),
    ).toEqual({
      allowed: true,
      code: "MODEL_BUDGET_RESERVED",
      reservationId: "inference-bounded",
      usedUnits: 50,
      maxUnits: 100,
    });
  });

  test("replays an existing reservation without charging the budget twice", () => {
    expect(
      reserveModelBudget(
        {
          requestId: "inference-idempotent",
          model: "workers-ai/@cf/openai/gpt-oss-20b",
          estimatedUnits: 10,
          ...binding,
        },
        {
          binding,
          pausedScopes: [],
          usedUnits: 50,
          maxUnits: 100,
          existingReservation: {
            requestId: "inference-idempotent",
            model: "workers-ai/@cf/openai/gpt-oss-20b",
            estimatedUnits: 10,
          },
        },
      ),
    ).toEqual({
      allowed: true,
      code: "MODEL_BUDGET_ALREADY_RESERVED",
      reservationId: "inference-idempotent",
      usedUnits: 50,
      maxUnits: 100,
    });
  });

  test("fails closed on mismatched release, pause, model, and reservation inputs", () => {
    const request = {
      requestId: "inference-validated",
      model: "workers-ai/@cf/openai/gpt-oss-20b",
      estimatedUnits: 10,
      ...binding,
    };
    const context = {
      binding,
      pausedScopes: [] as string[],
      usedUnits: 20,
      maxUnits: 100,
      existingReservation: null,
    };

    const scenarios = [
      [{ ...request, releaseDigest: "sha256:other" }, context, "RELEASE_BINDING_MISMATCH"],
      [request, { ...context, pausedScopes: ["all"] }, "PAUSED_ALL"],
      [request, { ...context, pausedScopes: ["release"] }, "PAUSED_RELEASE"],
      [request, { ...context, pausedScopes: ["modal"] }, "PAUSED_MODAL"],
      [request, { ...context, pausedScopes: ["model"] }, "PAUSED_MODEL"],
      [{ ...request, model: "openai/gpt-5.5" }, context, "MODEL_NOT_ALLOWED"],
      [{ ...request, estimatedUnits: 0 }, context, "INVALID_BUDGET_REQUEST"],
      [{ ...request, requestId: "" }, context, "INVALID_BUDGET_REQUEST"],
      [
        request,
        {
          ...context,
          existingReservation: {
            requestId: request.requestId,
            model: request.model,
            estimatedUnits: 11,
          },
        },
        "RESERVATION_MISMATCH",
      ],
      [
        request,
        {
          ...context,
          existingReservation: {
            requestId: request.requestId,
            model: "workers-ai/@cf/openai/gpt-oss-120b",
            estimatedUnits: request.estimatedUnits,
          },
        },
        "RESERVATION_MISMATCH",
      ],
    ] as const;

    for (const [candidate, candidateContext, code] of scenarios) {
      expect(reserveModelBudget(candidate, candidateContext)).toEqual({
        allowed: false,
        code,
        usedUnits: 20,
        maxUnits: 100,
      });
    }
  });
});
