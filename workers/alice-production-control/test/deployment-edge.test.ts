import { describe, expect, test } from "bun:test";

import {
  ALICE_DEPLOYMENT_PAUSE_V2_PATH,
  buildAliceDeploymentEdgeReadiness,
  executeAliceDeploymentPauseV2,
} from "../src/deployment-edge";

const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};
const release = {
  releaseEpoch: 1,
  sourceCommit: "4".repeat(40),
  deploymentControllerCommit: "5".repeat(40),
  runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"6".repeat(64)}`,
  runtimeBuildManifestSha256: `sha256:${"7".repeat(64)}`,
  elizaCommit: "8".repeat(40),
  modalRevision: 49,
  deploymentManifestSha256: `sha256:${"9".repeat(64)}`,
};
const config = {
  binding,
  deploymentManifestSha256: release.deploymentManifestSha256,
  modalRevision: 49,
  envelope: {
    release: {
      ...release,
      rollbackBoundary: "modal:alice-runtime:v49",
    },
  },
};
const workerVersion = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tag: "alice-candidate",
  timestamp: "2026-08-25T16:00:00.000Z",
};
const nonce = "n".repeat(43);

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "alice.deployment-pause-request.v2",
    edgeReadiness: {
      ...buildAliceDeploymentEdgeReadiness({ config, workerVersion, nonce }),
      ...overrides,
    },
  };
}

describe("Alice deployment edge readiness", () => {
  test("binds a no-store challenge to the exact serving candidate and Worker version", () => {
    expect(buildAliceDeploymentEdgeReadiness({ config, workerVersion, nonce })).toEqual({
      schemaVersion: "alice.deployment-edge-readiness.v1",
      nonce,
      workerVersionId: workerVersion.id,
      servingCandidate: {
        binding,
        release,
        rollbackBoundary: "modal:alice-runtime:v49",
      },
    });
  });

  test("leaves v1 and a stale v2 Worker unable to mutate PAUSE_ALL", async () => {
    let mutations = 0;
    const mutate = async () => {
      mutations += 1;
      return { response: new Response(null, { status: 200 }), value: { ok: true } };
    };
    const oldPath = await executeAliceDeploymentPauseV2({
      path: "/control/internal/v1/deployment/pause-all",
      method: "POST",
      headerNonce: nonce,
      body: requestBody(),
      config,
      workerVersion,
      mutate,
    });
    expect(oldPath).toEqual({
      ok: false,
      code: "DEPLOYMENT_EDGE_READINESS_REQUIRED",
    });
    expect(mutations).toBe(0);

    const staleWorker = await executeAliceDeploymentPauseV2({
      path: ALICE_DEPLOYMENT_PAUSE_V2_PATH,
      method: "POST",
      headerNonce: nonce,
      body: requestBody({
        workerVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
      config,
      workerVersion,
      mutate,
    });
    expect(staleWorker).toEqual({
      ok: false,
      code: "DEPLOYMENT_EDGE_READINESS_MISMATCH",
    });
    expect(mutations).toBe(0);
  });

  test("refuses a wrong nonce or candidate tuple before the Durable mutation", async () => {
    let mutations = 0;
    const mutate = async () => {
      mutations += 1;
      return { response: new Response(null, { status: 200 }), value: { ok: true } };
    };
    for (const candidate of [
      {
        headerNonce: "x".repeat(43),
        body: requestBody(),
      },
      {
        headerNonce: nonce,
        body: requestBody({
          servingCandidate: {
            binding: { ...binding, releaseDigest: `sha256:${"a".repeat(64)}` },
            release,
            rollbackBoundary: "modal:alice-runtime:v49",
          },
        }),
      },
    ]) {
      const result = await executeAliceDeploymentPauseV2({
        path: ALICE_DEPLOYMENT_PAUSE_V2_PATH,
        method: "POST",
        ...candidate,
        config,
        workerVersion,
        mutate,
      });
      expect(result).toEqual({
        ok: false,
        code: "DEPLOYMENT_EDGE_READINESS_MISMATCH",
      });
    }
    expect(mutations).toBe(0);
  });

  test("permits the exact nonce/version/candidate v2 request to pause once", async () => {
    let mutations = 0;
    const mutation = {
      response: new Response(null, { status: 202 }),
      value: { ok: true, code: "PAUSED" },
    };
    const result = await executeAliceDeploymentPauseV2({
      path: ALICE_DEPLOYMENT_PAUSE_V2_PATH,
      method: "POST",
      headerNonce: nonce,
      body: requestBody(),
      config,
      workerVersion,
      mutate: async () => {
        mutations += 1;
        return mutation;
      },
    });
    expect(result).toEqual({ ok: true, mutation });
    expect(mutations).toBe(1);
  });
});
