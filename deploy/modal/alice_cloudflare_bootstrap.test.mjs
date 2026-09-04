import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import * as bootstrapModule from "./alice_cloudflare_bootstrap.mjs";

import {
  buildAliceBootstrapCreationCommand,
  buildAliceBootstrapPromotionCommand,
  buildAliceBootstrapControlConfig,
  ensureAliceBootstrapQueue,
  extractAliceBootstrapNamespaceIds,
  fetchAliceActiveControlVersionId,
  parseAliceWranglerDeployVersionId,
  verifyAliceBootstrapDeployToken,
  verifyAliceBootstrapReentryBoundary,
  verifyAliceBootstrapBucket,
  verifyAliceBootstrapQueueConsumer,
} from "./alice_cloudflare_bootstrap.mjs";
import fs from "node:fs";

const sourceConfig = {
  account_id: "036df6c823669b8fa2f66cf4c16eeb29",
  name: "alice-production-control",
  main: "src/index.ts",
  routes: [{ pattern: "alice.rndrntwrk.com/control/*" }],
  workers_dev: false,
  preview_urls: false,
  vars: {
    ALICE_PROGRAM_ENVELOPE_B64: "program",
    ALICE_PROGRAM_SIGNATURE_B64: "signature",
    ALICE_PROGRAM_PUBLIC_JWK_B64: "jwk",
    ALICE_DEPLOYMENT_MANIFEST_SHA256: "manifest",
    ALICE_DEPLOYMENT_MANIFEST_B64: "manifest-b64",
  },
  secrets: { required: ["ALICE_CONTROL_RECOVERY_TOKEN"] },
  queues: {
    producers: [{ binding: "ALICE_EVIDENCE_QUEUE", queue: "alice-production-evidence-v1" }],
    consumers: [{ queue: "alice-production-evidence-v1" }],
  },
  durable_objects: {
    bindings: [
      { name: "ALICE_AUTHORITY", class_name: "AliceAuthority" },
      { name: "ALICE_SESSIONS", class_name: "AliceSession" },
    ],
  },
};

const observedLegacyAccessVersionId =
  "f380b84a-c470-405f-b8bf-a7a85ea2b8c0";
const observedLegacyAccessVersion = {
  id: observedLegacyAccessVersionId,
  resources: {
    bindings: [
      { name: "ASSET_BUST_TAG", text: "prod-0d7cee2-20260501", type: "plain_text" },
      { name: "BYPASS_PATHS", text: "/health,/cdn-cgi/access/*", type: "plain_text" },
      { name: "DEFAULT_AUTH_REDIRECT_PATH", text: "/", type: "plain_text" },
      { name: "HOMEPAGE_URL", text: "https://rndrntwrk.com", type: "plain_text" },
      { name: "REDIRECT_STATUS", text: "302", type: "plain_text" },
      { name: "SHARED_CONVERSATION_MODE", text: "true", type: "plain_text" },
      { name: "SHARED_CONVERSATION_TITLE", text: "Alice Shared Session", type: "plain_text" },
      { name: "TRUST_ACCESS_SESSION_COOKIES", text: "false", type: "plain_text" },
      { name: "UPSTREAM_API_TOKEN", type: "secret_text" },
      { name: "UPSTREAM_HOST_HEADER", text: "", type: "plain_text" },
      { name: "UPSTREAM_ORIGIN", text: "", type: "plain_text" },
    ],
    script: {
      etag: "77d7eb6b24cf375ff26ecfef60077f109a60b03dcd972175fab00ecfd7937cbe",
    },
    script_runtime: {
      cache_options: null,
      compatibility_date: "2026-02-18",
      compatibility_flags: [],
      exports: {},
      limits: null,
      migration_tag: null,
      usage_model: "standard",
    },
  },
};
const observedControlVersionId = "12567b75-bc0e-4451-9e8c-52295ec7af2b";
const observedControlVersion = {
  id: observedControlVersionId,
  resources: {
    bindings: [
      {
        type: "durable_object_namespace",
        name: "ALICE_AUTHORITY",
        class_name: "AliceAuthority",
        namespace_id: "b8e8471d24e043e4a0114fecabab913c",
      },
      {
        type: "durable_object_namespace",
        name: "ALICE_SESSIONS",
        class_name: "AliceSession",
        namespace_id: "0ecdd7fb1aa94d6c912a4b12790586bb",
      },
    ],
  },
};
const statePlaneVersionId = "33333333-3333-4333-8333-333333333333";
const statePlaneVersion = {
  id: statePlaneVersionId,
  resources: {
    bindings: [{
      type: "durable_object_namespace",
      name: "ALICE_COORDINATION",
      class_name: "AliceStateCoordination",
      namespace_id: "3".repeat(32),
    }],
  },
};
const connectorPlaneVersionId = "44444444-4444-4444-8444-444444444444";
const connectorPlaneVersion = {
  id: connectorPlaneVersionId,
  resources: {
    bindings: [{
      type: "durable_object_namespace",
      name: "ALICE_CONNECTOR_OUTBOUND",
      class_name: "AliceConnectorOutboundCoordination",
      namespace_id: "4".repeat(32),
    }],
  },
};
const runtimeHostVersionId = "55555555-5555-4555-8555-555555555555";
const runtimeHostVersion = {
  id: runtimeHostVersionId,
  resources: {
    bindings: [{
      type: "durable_object_namespace",
      name: "ALICE_RUNTIME_CONTAINER",
      class_name: "AliceRuntimeContainer",
      namespace_id: "5".repeat(32),
    }],
  },
};
const observedTraffic = {
  customDomains: [],
  routes: [{
    id: "55959f9c8da945f9a2b85b02b3657016",
    pattern: "alice.rndrntwrk.com/*",
    request_limit_fail_open: false,
    script: "alice-access-gateway",
  }],
};

test("verifies the durable Alice account token through the account-owned endpoint", async () => {
  const requests = [];
  const id = "a".repeat(32);
  const digest = await verifyAliceBootstrapDeployToken({
    apiToken: "account-token-never-log",
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      requests.push({
        authorization: options.headers.authorization,
        method: options.method,
        pathname: parsed.pathname,
      });
      return Response.json({
        success: true,
        errors: [],
        messages: [],
        result: { id, status: "active" },
      });
    },
  });
  assert.deepEqual(requests, [{
    authorization: "Bearer account-token-never-log",
    method: "GET",
    pathname:
      "/client/v4/accounts/036df6c823669b8fa2f66cf4c16eeb29/tokens/verify",
  }]);
  assert.equal(
    digest,
    `sha256:${crypto.createHash("sha256").update(id).digest("hex")}`,
  );
});

test("materializes an unrouted fail-closed control bootstrap without secret bindings", () => {
  const config = buildAliceBootstrapControlConfig({
    sourceConfig,
    deploymentMainPath: "/release/alice-production-control/index.js",
  });
  assert.deepEqual(config.routes, []);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.queues.consumers, []);
  assert.deepEqual(config.secrets.required, []);
  assert.equal(config.main, "/release/alice-production-control/index.js");
  assert.match(
    config.vars.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    /^sha256:0{64}$/,
  );
  assert.equal(config.vars.ALICE_PROGRAM_SIGNATURE_B64, "invalid");
  assert.deepEqual(sourceConfig.routes, [{ pattern: "alice.rndrntwrk.com/control/*" }]);
});

test("extracts the exact six-role provider-assigned Durable Object namespaces", () => {
  const version = (bindings) => ({ resources: { bindings } });
  const versions = {
    access: version([{
      type: "durable_object_namespace",
      name: "ALICE_RUNTIME_CONTAINER",
      class_name: "AliceRuntimeContainer",
      script_name: "alice-runtime-container-host",
      namespace_id: "5".repeat(32),
    }]),
    runtimeHost: version([{
      type: "durable_object_namespace",
      name: "ALICE_RUNTIME_CONTAINER",
      class_name: "AliceRuntimeContainer",
      namespace_id: "5".repeat(32),
    }]),
    control: version([
      {
        type: "durable_object_namespace",
        name: "ALICE_SESSIONS",
        class_name: "AliceSession",
        namespace_id: "2".repeat(32),
      },
      {
        type: "durable_object_namespace",
        name: "ALICE_AUTHORITY",
        class_name: "AliceAuthority",
        namespace_id: "1".repeat(32),
      },
    ]),
    aiGateway: null,
    statePlane: version([{
      type: "durable_object_namespace",
      name: "ALICE_COORDINATION",
      class_name: "AliceStateCoordination",
      namespace_id: "3".repeat(32),
    }]),
    connectorPlane: version([{
      type: "durable_object_namespace",
      name: "ALICE_CONNECTOR_OUTBOUND",
      class_name: "AliceConnectorOutboundCoordination",
      namespace_id: "4".repeat(32),
    }]),
  };
  const ids = extractAliceBootstrapNamespaceIds(versions);
  assert.deepEqual(ids, {
    access: [{
      className: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      namespaceId: "5".repeat(32),
      scriptName: "alice-runtime-container-host",
    }],
    runtimeHost: [{
      className: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      namespaceId: "5".repeat(32),
      scriptName: null,
    }],
    aiGateway: [],
    control: [
      {
        className: "AliceAuthority",
        name: "ALICE_AUTHORITY",
        namespaceId: "1".repeat(32),
        scriptName: null,
      },
      {
        className: "AliceSession",
        name: "ALICE_SESSIONS",
        namespaceId: "2".repeat(32),
        scriptName: null,
      },
    ],
    statePlane: [{
      className: "AliceStateCoordination",
      name: "ALICE_COORDINATION",
      namespaceId: "3".repeat(32),
      scriptName: null,
    }],
    connectorPlane: [{
      className: "AliceConnectorOutboundCoordination",
      name: "ALICE_CONNECTOR_OUTBOUND",
      namespaceId: "4".repeat(32),
      scriptName: null,
    }],
  });
  assert.throws(() =>
    extractAliceBootstrapNamespaceIds({
      ...versions,
      statePlane: version([{
        type: "durable_object_namespace",
        name: "ALICE_COORDINATION",
        class_name: "WrongCoordination",
        namespace_id: "3".repeat(32),
      }]),
    }),
  );
  assert.throws(
    () => extractAliceBootstrapNamespaceIds({
      ...versions,
      access: version([{
        ...versions.access.resources.bindings[0],
        script_name: "wrong-runtime-host",
      }]),
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
  );
});

test("plans an inactive Access upload for the observed legacy version before first-deploying absent planes", () => {
  assert.equal(
    typeof bootstrapModule.planAliceBootstrapIdentityActions,
    "function",
  );
  assert.deepEqual(
    bootstrapModule.planAliceBootstrapIdentityActions({
      activeVersionIds: {
        access: observedLegacyAccessVersionId,
        runtimeHost: null,
        control: observedControlVersionId,
        statePlane: null,
        connectorPlane: null,
      },
      activeVersions: {
        access: observedLegacyAccessVersion,
        runtimeHost: null,
        control: observedControlVersion,
        statePlane: null,
        connectorPlane: null,
      },
    }),
    {
      access: { upload: "inactive", promote: false },
      runtimeHost: { upload: "first-deploy", promote: true },
      control: { upload: "none", promote: false },
      statePlane: { upload: "first-deploy", promote: true },
      connectorPlane: { upload: "first-deploy", promote: true },
    },
  );
});

test("stages only Access when rerunning after the absent planes were first-deployed", () => {
  assert.equal(
    typeof bootstrapModule.planAliceBootstrapIdentityActions,
    "function",
  );
  assert.deepEqual(
    bootstrapModule.planAliceBootstrapIdentityActions({
      activeVersionIds: {
        access: observedLegacyAccessVersionId,
        runtimeHost: runtimeHostVersionId,
        control: observedControlVersionId,
        statePlane: statePlaneVersionId,
        connectorPlane: connectorPlaneVersionId,
      },
      activeVersions: {
        access: observedLegacyAccessVersion,
        runtimeHost: runtimeHostVersion,
        control: observedControlVersion,
        statePlane: statePlaneVersion,
        connectorPlane: connectorPlaneVersion,
      },
    }),
    {
      access: { upload: "inactive", promote: false },
      runtimeHost: { upload: "none", promote: false },
      control: { upload: "none", promote: false },
      statePlane: { upload: "none", promote: false },
      connectorPlane: { upload: "none", promote: false },
    },
  );
});

test("rejects an external Access runtime reference when its owning host is absent", () => {
  assert.throws(
    () => bootstrapModule.planAliceBootstrapIdentityActions({
      activeVersionIds: {
        access: "11111111-1111-4111-8111-111111111111",
        runtimeHost: null,
        control: observedControlVersionId,
        statePlane: statePlaneVersionId,
        connectorPlane: connectorPlaneVersionId,
      },
      activeVersions: {
        access: {
          id: "11111111-1111-4111-8111-111111111111",
          resources: { bindings: [{
            type: "durable_object_namespace",
            name: "ALICE_RUNTIME_CONTAINER",
            class_name: "AliceRuntimeContainer",
            script_name: "alice-runtime-container-host",
            namespace_id: "5".repeat(32),
          }] },
        },
        runtimeHost: null,
        control: observedControlVersion,
        statePlane: statePlaneVersion,
        connectorPlane: connectorPlaneVersion,
      },
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
  );
});

test("rejects a cross-role namespace collision before planning any mutation", () => {
  assert.throws(
    () => bootstrapModule.planAliceBootstrapIdentityActions({
      activeVersionIds: {
        access: observedLegacyAccessVersionId,
        runtimeHost: null,
        control: observedControlVersionId,
        statePlane: statePlaneVersionId,
        connectorPlane: connectorPlaneVersionId,
      },
      activeVersions: {
        access: observedLegacyAccessVersion,
        runtimeHost: null,
        control: observedControlVersion,
        statePlane: {
          ...statePlaneVersion,
          resources: { bindings: [{
            ...statePlaneVersion.resources.bindings[0],
            namespace_id:
              observedControlVersion.resources.bindings[0].namespace_id,
          }] },
        },
        connectorPlane: connectorPlaneVersion,
      },
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
  );
});

test("uses exact pinned-Wrangler upload-only semantics for a staged Access identity", () => {
  assert.equal(
    typeof bootstrapModule.buildAliceBootstrapInactiveUploadCommand,
    "function",
  );
  assert.deepEqual(
    bootstrapModule.buildAliceBootstrapInactiveUploadCommand({
      workerMain: "/release/alice-access-gateway/index.js",
      configPath: "/release/access.bootstrap.wrangler.json",
      sourceCommit: "1".repeat(40),
      releaseRunId: "33244173579-1",
    }),
    [
      "versions",
      "upload",
      "/release/alice-access-gateway/index.js",
      "--config",
      "/release/access.bootstrap.wrangler.json",
      "--no-bundle",
      "--strict",
      "--tag",
      `alice-continuity-bootstrap-${"1".repeat(40)}-33244173579-1`,
      "--message",
      `Alice inactive fail-closed continuity bootstrap ${"1".repeat(40)}`,
    ],
  );
  assert.equal(
    typeof bootstrapModule.parseAliceBootstrapUploadVersionId,
    "function",
  );
  assert.equal(
    bootstrapModule.parseAliceBootstrapUploadVersionId(
      "Uploaded alice-access-gateway\n" +
        "Worker Version ID: 11111111-1111-4111-8111-111111111111\n",
    ),
    "11111111-1111-4111-8111-111111111111",
  );
  assert.throws(
    () => bootstrapModule.parseAliceBootstrapUploadVersionId(
      "Current Version ID: 11111111-1111-4111-8111-111111111111\n",
    ),
    /ALICE_CLOUDFLARE_BOOTSTRAP_UPLOAD_VERSION_INVALID/,
  );
});

test("extracts the Access namespace from the selected staged version only", () => {
  assert.equal(
    typeof bootstrapModule.extractAliceBootstrapSelectedNamespaceIds,
    "function",
  );
  const selectedVersionIds = {
    access: "11111111-1111-4111-8111-111111111111",
    runtimeHost: runtimeHostVersionId,
    control: observedControlVersionId,
    statePlane: statePlaneVersionId,
    connectorPlane: connectorPlaneVersionId,
  };
  const selectedVersions = {
    access: {
      id: selectedVersionIds.access,
      resources: { bindings: [{
        type: "durable_object_namespace",
        name: "ALICE_RUNTIME_CONTAINER",
        class_name: "AliceRuntimeContainer",
        script_name: "alice-runtime-container-host",
        namespace_id: "5".repeat(32),
      }] },
    },
    runtimeHost: runtimeHostVersion,
    control: observedControlVersion,
    aiGateway: null,
    statePlane: statePlaneVersion,
    connectorPlane: connectorPlaneVersion,
  };
  assert.deepEqual(
    bootstrapModule.extractAliceBootstrapSelectedNamespaceIds({
      versionIds: selectedVersionIds,
      versions: selectedVersions,
    }).access,
    [{
      className: "AliceRuntimeContainer",
      name: "ALICE_RUNTIME_CONTAINER",
      namespaceId: "5".repeat(32),
      scriptName: "alice-runtime-container-host",
    }],
  );
  assert.throws(
    () => bootstrapModule.extractAliceBootstrapSelectedNamespaceIds({
      versionIds: selectedVersionIds,
      versions: {
        ...selectedVersions,
        access: { ...selectedVersions.access, id: observedLegacyAccessVersionId },
      },
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
  );
});

test("binds inactive or exact active Access and revalidates the provider phase twice", async () => {
  const sourceCommit = "4b82f4f28ec704077da7fb416d163286bfe00a8d";
  const stagedAccessVersionId = "97d7d9c2-471f-47ee-ac5d-5cda28b66fac";
  const activeDeploymentIds = {
    access: "a30d90f6-f666-47b5-b250-8825d40c9b9b",
    runtimeHost: "66666666-6666-4666-8666-666666666666",
    control: "77777777-7777-4777-8777-777777777777",
    statePlane: "88888888-8888-4888-8888-888888888888",
    connectorPlane: "99999999-9999-4999-8999-999999999999",
  };
  const activeVersionIds = {
    access: observedLegacyAccessVersionId,
    runtimeHost: runtimeHostVersionId,
    control: observedControlVersionId,
    statePlane: statePlaneVersionId,
    connectorPlane: connectorPlaneVersionId,
  };
  const selectedVersionIds = {
    ...activeVersionIds,
    access: stagedAccessVersionId,
  };
  const activeIdentities = Object.fromEntries(
    Object.keys(activeVersionIds).map((role) => [role, {
      deploymentId: activeDeploymentIds[role],
      versionId: activeVersionIds[role],
    }]),
  );
  const routesSha256 = `sha256:${crypto.createHash("sha256").update(
    JSON.stringify(observedTraffic.routes),
  ).digest("hex")}`;
  const customDomainsSha256 = `sha256:${crypto.createHash("sha256").update(
    JSON.stringify(observedTraffic.customDomains),
  ).digest("hex")}`;
  const boundary = bootstrapModule.buildAliceBootstrapVersionBoundary({
    sourceCommit,
    producerRun: { id: "33290617560", attempt: 1 },
    identityActions: {
      access: { upload: "inactive", promote: false },
      runtimeHost: { upload: "none", promote: false },
      control: { upload: "none", promote: false },
      statePlane: { upload: "none", promote: false },
      connectorPlane: { upload: "none", promote: false },
    },
    versionIds: selectedVersionIds,
    activeBefore: activeIdentities,
    activeAfter: structuredClone(activeIdentities),
    trafficBefore: observedTraffic,
    trafficAfter: structuredClone(observedTraffic),
  });
  assert.equal(
    boundary.schemaVersion,
    "alice.cloudflare-bootstrap-version-boundary.v1",
  );
  assert.equal(boundary.sourceCommit, sourceCommit);
  assert.deepEqual(boundary.producerRun, { id: "33290617560", attempt: 1 });
  assert.deepEqual(boundary.traffic, {
    routesSha256Before: routesSha256,
    routesSha256After: routesSha256,
    customDomainsSha256Before: customDomainsSha256,
    customDomainsSha256After: customDomainsSha256,
  });
  assert.equal(
    boundary.roles.access.bootstrapSelectedVersionId,
    stagedAccessVersionId,
  );
  assert.equal(
    boundary.roles.access.activeVersionIdAfter,
    observedLegacyAccessVersionId,
  );
  for (const role of ["runtimeHost", "control", "statePlane", "connectorPlane"]) {
    assert.equal(
      boundary.roles[role].bootstrapSelectedVersionId,
      boundary.roles[role].activeVersionIdAfter,
    );
  }
  const activeAccessBoundary = bootstrapModule.buildAliceBootstrapVersionBoundary({
    sourceCommit,
    producerRun: { id: "33876477967", attempt: 1 },
    identityActions: {
      ...Object.fromEntries(Object.keys(activeVersionIds).map((role) => [
        role,
        { upload: "none", promote: false },
      ])),
    },
    versionIds: activeVersionIds,
    activeBefore: activeIdentities,
    activeAfter: structuredClone(activeIdentities),
    trafficBefore: observedTraffic,
    trafficAfter: structuredClone(observedTraffic),
  });
  assert.equal(activeAccessBoundary.roles.access.selectionMode, "active-existing");
  assert.equal(
    activeAccessBoundary.roles.access.bootstrapSelectedVersionId,
    activeVersionIds.access,
  );
  assert.throws(
    () => bootstrapModule.verifyAliceBootstrapVersionBoundary({
      ...activeAccessBoundary,
      roles: {
        ...activeAccessBoundary.roles,
        access: {
          ...activeAccessBoundary.roles.access,
          bootstrapSelectedVersionId: stagedAccessVersionId,
        },
      },
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_VERSION_BOUNDARY_INVALID/,
  );

  const selectedVersions = {
    access: {
      id: stagedAccessVersionId,
      resources: { bindings: [{
        type: "durable_object_namespace",
        name: "ALICE_RUNTIME_CONTAINER",
        class_name: "AliceRuntimeContainer",
        script_name: "alice-runtime-container-host",
        namespace_id: "5".repeat(32),
      }] },
    },
    runtimeHost: runtimeHostVersion,
    control: observedControlVersion,
    statePlane: statePlaneVersion,
    connectorPlane: connectorPlaneVersion,
  };
  const capture = {
    versions: selectedVersions,
    activeDeployments: Object.fromEntries(
      Object.keys(activeVersionIds).map((role) => [role, {
        deployments: [{
          id: activeDeploymentIds[role],
          versions: [{ version_id: activeVersionIds[role], percentage: 100 }],
        }],
      }]),
    ),
    traffic: structuredClone(observedTraffic),
  };
  let captures = 0;
  const namespaceIds = await bootstrapModule
    .revalidateAliceBootstrapVersionBoundaryCurrent({
      boundary,
      captureCurrent: async () => {
        captures += 1;
        return structuredClone(capture);
      },
    });
  assert.equal(captures, 2);
  assert.equal(namespaceIds.access[0].namespaceId, "5".repeat(32));
  assert.equal(
    namespaceIds.access[0].namespaceId,
    namespaceIds.runtimeHost[0].namespaceId,
  );
});

test("rejects bootstrap phase drift, unsafe plans, extra fields, and changing captures", async () => {
  const base = {
    sourceCommit: "4b82f4f28ec704077da7fb416d163286bfe00a8d",
    producerRun: { id: "33290617560", attempt: 1 },
    identityActions: {
      access: { upload: "inactive", promote: false },
      runtimeHost: { upload: "none", promote: false },
      control: { upload: "none", promote: false },
      statePlane: { upload: "none", promote: false },
      connectorPlane: { upload: "none", promote: false },
    },
    versionIds: {
      access: "97d7d9c2-471f-47ee-ac5d-5cda28b66fac",
      runtimeHost: runtimeHostVersionId,
      control: observedControlVersionId,
      statePlane: statePlaneVersionId,
      connectorPlane: connectorPlaneVersionId,
    },
    activeBefore: {
      access: {
        deploymentId: "a30d90f6-f666-47b5-b250-8825d40c9b9b",
        versionId: observedLegacyAccessVersionId,
      },
      runtimeHost: {
        deploymentId: "66666666-6666-4666-8666-666666666666",
        versionId: runtimeHostVersionId,
      },
      control: {
        deploymentId: "77777777-7777-4777-8777-777777777777",
        versionId: observedControlVersionId,
      },
      statePlane: {
        deploymentId: "88888888-8888-4888-8888-888888888888",
        versionId: statePlaneVersionId,
      },
      connectorPlane: {
        deploymentId: "99999999-9999-4999-8999-999999999999",
        versionId: connectorPlaneVersionId,
      },
    },
    trafficBefore: observedTraffic,
    trafficAfter: structuredClone(observedTraffic),
  };
  base.activeAfter = structuredClone(base.activeBefore);
  for (const [input, expectedError] of [
    [{
      ...base,
      versionIds: {
        ...base.versionIds,
        access: observedLegacyAccessVersionId,
      },
    }, /ALICE_CLOUDFLARE_BOOTSTRAP_VERSION_BOUNDARY_INVALID/],
    [{
      ...base,
      identityActions: {
        ...base.identityActions,
        statePlane: { upload: "first-deploy", promote: true },
      },
    }, /ALICE_BOOTSTRAP_PLAN_DRIFT/],
    [{
      ...base,
      activeAfter: {
        ...base.activeAfter,
        control: {
          ...base.activeAfter.control,
          versionId: "11111111-1111-4111-8111-111111111111",
        },
      },
    }, /ALICE_CLOUDFLARE_BOOTSTRAP_VERSION_BOUNDARY_INVALID/],
  ]) {
    assert.throws(
      () => bootstrapModule.buildAliceBootstrapVersionBoundary(input),
      expectedError,
    );
  }
  const boundary = bootstrapModule.buildAliceBootstrapVersionBoundary(base);
  assert.throws(
    () => bootstrapModule.verifyAliceBootstrapVersionBoundary({
      ...boundary,
      secret: "must-never-be-admitted",
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_VERSION_BOUNDARY_INVALID/,
  );
  const emptyCapture = {
    versions: {},
    activeDeployments: {},
    traffic: structuredClone(observedTraffic),
  };
  let attempt = 0;
  await assert.rejects(
    bootstrapModule.revalidateAliceBootstrapVersionBoundaryCurrent({
      boundary,
      captureCurrent: async () => {
        attempt += 1;
        return attempt === 1
          ? emptyCapture
          : { ...emptyCapture, traffic: { routes: [], customDomains: [] } };
      },
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_CAPTURE_DRIFT/,
  );
});

test("full-deploys the unrouted runtime host before one inactive Access upload", async () => {
  assert.equal(
    typeof bootstrapModule.executeAliceBootstrapIdentityActions,
    "function",
  );
  const stagedAccessVersionId = "11111111-1111-4111-8111-111111111111";
  const stagedAccessVersion = {
    id: stagedAccessVersionId,
    resources: { bindings: [{
      type: "durable_object_namespace",
      name: "ALICE_RUNTIME_CONTAINER",
      class_name: "AliceRuntimeContainer",
      script_name: "alice-runtime-container-host",
      namespace_id: "5".repeat(32),
    }] },
  };
  const provider = {
    activeVersionIds: {
      access: observedLegacyAccessVersionId,
      runtimeHost: null,
      control: observedControlVersionId,
      statePlane: statePlaneVersionId,
      connectorPlane: connectorPlaneVersionId,
    },
    traffic: structuredClone(observedTraffic),
  };
  const commands = [];
  const sequence = [];
  const result = await bootstrapModule.executeAliceBootstrapIdentityActions({
    identityActions: {
      access: { upload: "inactive", promote: false },
      runtimeHost: { upload: "first-deploy", promote: true },
      control: { upload: "none", promote: false },
      statePlane: { upload: "none", promote: false },
      connectorPlane: { upload: "none", promote: false },
    },
    versionIds: provider.activeVersionIds,
    bootstrapIdentityConfigs: {
      access: {
        configPath: "/release/access.bootstrap.wrangler.json",
        deploymentMainPath: "/release/alice-access-gateway/index.js",
      },
      runtimeHost: {
        configPath: "/release/runtimeHost.bootstrap.wrangler.json",
        deploymentMainPath: "/release/alice-runtime-container-host/index.js",
      },
      control: {
        configPath: "/release/control.bootstrap.wrangler.json",
        deploymentMainPath: "/release/alice-production-control/index.js",
      },
      statePlane: {
        configPath: "/release/statePlane.bootstrap.wrangler.json",
        deploymentMainPath: "/release/alice-state-plane/index.js",
      },
      connectorPlane: {
        configPath: "/release/connectorPlane.bootstrap.wrangler.json",
        deploymentMainPath: "/release/alice-connector-plane/index.js",
      },
    },
    wranglerBin: "/release/wrangler",
    sourceRoot: "/release/source",
    sourceCommit: "1".repeat(40),
    releaseRunId: "33244173579-1",
    expectedRuntimeHostApplicationImage:
      `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"5".repeat(64)}`,
    commandEnv: {},
    runCommand: (_binary, argv) => {
      commands.push(argv);
      sequence.push(`${argv[0]}:${argv[1]}`);
      if (argv[0] === "deploy") {
        provider.activeVersionIds.runtimeHost = runtimeHostVersionId;
        return `Current Version ID: ${runtimeHostVersionId}\n`;
      }
      if (argv[0] === "versions" && argv[1] === "upload") {
        return `Worker Version ID: ${stagedAccessVersionId}\n`;
      }
      if (argv[0] === "versions" && argv[1] === "deploy") {
        const configPath = argv[argv.indexOf("--config") + 1];
        const role = Object.keys(provider.activeVersionIds).find((candidate) =>
          configPath.includes(candidate)
        );
        provider.activeVersionIds[role] = argv[argv.indexOf("--version-id") + 1];
        return "";
      }
      throw new Error("unexpected identity command");
    },
    fetchVersion: async ({ role, versionId }) => ({
      access: stagedAccessVersion,
      runtimeHost: runtimeHostVersion,
      control: observedControlVersion,
      statePlane: statePlaneVersion,
      connectorPlane: connectorPlaneVersion,
    })[role]?.id === versionId
      ? ({
          access: stagedAccessVersion,
          runtimeHost: runtimeHostVersion,
          control: observedControlVersion,
          statePlane: statePlaneVersion,
          connectorPlane: connectorPlaneVersion,
        })[role]
      : null,
    fetchActiveVersionId: async (role) => provider.activeVersionIds[role],
    verifyRuntimeHostBoundary: async ({ versionId, version, namespaceIds }) => {
      sequence.push("verify:runtimeHost");
      assert.equal(versionId, runtimeHostVersionId);
      assert.equal(version, runtimeHostVersion);
      assert.deepEqual(namespaceIds, [{
        className: "AliceRuntimeContainer",
        name: "ALICE_RUNTIME_CONTAINER",
        namespaceId: "5".repeat(32),
        scriptName: null,
      }]);
      return { applicationId: "66666666-6666-4666-8666-666666666666" };
    },
    fetchTraffic: async () => structuredClone(provider.traffic),
    trafficBefore: observedTraffic,
  });
  assert.equal(result.versionIds.access, stagedAccessVersionId);
  assert.deepEqual(result.createdRoles, ["runtimeHost"]);
  assert.deepEqual(sequence.slice(0, 3), [
    "deploy:/release/alice-runtime-container-host/index.js",
    "verify:runtimeHost",
    "versions:upload",
  ]);
  assert.deepEqual(
    commands.map((argv) => argv.slice(0, 3)),
    [
      ["deploy", "/release/alice-runtime-container-host/index.js", "--config"],
      ["versions", "upload", "/release/alice-access-gateway/index.js"],
      ["versions", "deploy", "--config"],
    ],
  );
  assert.deepEqual(result.namespaceIds.access, [{
    className: "AliceRuntimeContainer",
    name: "ALICE_RUNTIME_CONTAINER",
    namespaceId: "5".repeat(32),
    scriptName: "alice-runtime-container-host",
  }]);
  assert.equal(
    result.namespaceIds.runtimeHost[0].namespaceId,
    result.namespaceIds.access[0].namespaceId,
  );
  assert.equal(result.namespaceIds.runtimeHost[0].scriptName, null);
  assert.equal(
    provider.activeVersionIds.access,
    observedLegacyAccessVersionId,
  );
  assert.deepEqual(provider.traffic, observedTraffic);
  assert.deepEqual(result.trafficAfter, observedTraffic);
});

test("checks the inactive Access boundary after first-deploy promotions", async () => {
  assert.equal(
    typeof bootstrapModule.executeAliceBootstrapIdentityActions,
    "function",
  );
  const stagedAccessVersionId = "11111111-1111-4111-8111-111111111111";
  const selectedVersions = {
    access: {
      id: stagedAccessVersionId,
      resources: { bindings: [{
        type: "durable_object_namespace",
        name: "ALICE_RUNTIME_CONTAINER",
        class_name: "AliceRuntimeContainer",
        script_name: "alice-runtime-container-host",
        namespace_id: "5".repeat(32),
      }] },
    },
    runtimeHost: runtimeHostVersion,
    control: observedControlVersion,
    statePlane: statePlaneVersion,
    connectorPlane: connectorPlaneVersion,
  };
  const activeVersionIds = {
    access: observedLegacyAccessVersionId,
    runtimeHost: runtimeHostVersionId,
    control: observedControlVersionId,
    statePlane: null,
    connectorPlane: connectorPlaneVersionId,
  };
  const providerTraffic = structuredClone(observedTraffic);
  const capturedRuntimeHostImage =
    `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"4".repeat(64)}`;
  await assert.rejects(
    bootstrapModule.executeAliceBootstrapIdentityActions({
      identityActions: {
        access: { upload: "inactive", promote: false },
        runtimeHost: { upload: "none", promote: false },
        control: { upload: "none", promote: false },
        statePlane: { upload: "first-deploy", promote: true },
        connectorPlane: { upload: "none", promote: false },
      },
      versionIds: activeVersionIds,
      bootstrapIdentityConfigs: {
        access: {
          configPath: "/release/access.bootstrap.wrangler.json",
          deploymentMainPath: "/release/alice-access-gateway/index.js",
        },
        runtimeHost: {
          configPath: "/release/runtimeHost.bootstrap.wrangler.json",
          deploymentMainPath: "/release/alice-runtime-container-host/index.js",
        },
        control: {
          configPath: "/release/control.bootstrap.wrangler.json",
          deploymentMainPath: "/release/alice-production-control/index.js",
        },
        statePlane: {
          configPath: "/release/statePlane.bootstrap.wrangler.json",
          deploymentMainPath: "/release/alice-state-plane/index.js",
        },
        connectorPlane: {
          configPath: "/release/connectorPlane.bootstrap.wrangler.json",
          deploymentMainPath: "/release/alice-connector-plane/index.js",
        },
      },
      wranglerBin: "/release/wrangler",
      sourceRoot: "/release/source",
      sourceCommit: "1".repeat(40),
      releaseRunId: "33244173579-1",
      expectedRuntimeHostApplicationImage: capturedRuntimeHostImage,
      commandEnv: {},
      runCommand: (_binary, argv) => {
        if (argv[0] === "deploy") {
          activeVersionIds.statePlane = statePlaneVersionId;
          return `Current Version ID: ${statePlaneVersionId}\n`;
        }
        if (argv[0] === "versions" && argv[1] === "upload") {
          return `Worker Version ID: ${stagedAccessVersionId}\n`;
        }
        if (argv[0] === "versions" && argv[1] === "deploy") {
          providerTraffic.routes[0].script = "unexpected-traffic-change";
          return "";
        }
        throw new Error("unexpected identity command");
      },
      fetchVersion: async ({ role, versionId }) =>
        selectedVersions[role]?.id === versionId
          ? selectedVersions[role]
          : null,
      fetchActiveVersionId: async (role) => activeVersionIds[role],
      verifyRuntimeHostBoundary: async ({ expectedApplicationImage }) => {
        assert.equal(expectedApplicationImage, capturedRuntimeHostImage);
        return {
          applicationId: "66666666-6666-4666-8666-666666666666",
        };
      },
      fetchTraffic: async () => structuredClone(providerTraffic),
      trafficBefore: observedTraffic,
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_INACTIVE_ACCESS_BOUNDARY_INVALID/,
  );
});

test("requires the staged Access upload to preserve the active version and traffic exactly", () => {
  assert.equal(
    typeof bootstrapModule.verifyAliceBootstrapInactiveAccessBoundary,
    "function",
  );
  assert.doesNotThrow(() =>
    bootstrapModule.verifyAliceBootstrapInactiveAccessBoundary({
      previousActiveVersionId: observedLegacyAccessVersionId,
      currentActiveVersionId: observedLegacyAccessVersionId,
      trafficBefore: observedTraffic,
      trafficAfter: structuredClone(observedTraffic),
    })
  );
  for (const changed of [
    {
      currentActiveVersionId: "11111111-1111-4111-8111-111111111111",
      trafficAfter: observedTraffic,
    },
    {
      currentActiveVersionId: observedLegacyAccessVersionId,
      trafficAfter: {
        ...observedTraffic,
        routes: [{ ...observedTraffic.routes[0], script: "other-worker" }],
      },
    },
  ]) {
    assert.throws(
      () => bootstrapModule.verifyAliceBootstrapInactiveAccessBoundary({
        previousActiveVersionId: observedLegacyAccessVersionId,
        currentActiveVersionId: changed.currentActiveVersionId,
        trafficBefore: observedTraffic,
        trafficAfter: changed.trafficAfter,
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INACTIVE_ACCESS_BOUNDARY_INVALID/,
    );
  }
});

test("fails closed instead of staging partial or wrong continuity bindings", () => {
  assert.equal(
    typeof bootstrapModule.planAliceBootstrapIdentityActions,
    "function",
  );
  for (const bindings of [
    [null],
    [{
      type: "durable_object_namespace",
      name: "ALICE_RUNTIME_CONTAINER",
      class_name: "AliceRuntimeContainer",
    }],
    [{
      type: "durable_object_namespace",
      name: "ALICE_RUNTIME_CONTAINER",
      class_name: "WrongRuntimeContainer",
      namespace_id: "5".repeat(32),
    }],
    [{
      type: "plain_text",
      name: "ALICE_RUNTIME_CONTAINER",
      text: "wrong-binding-type",
    }],
    [
      {
        type: "durable_object_namespace",
        name: "ALICE_RUNTIME_CONTAINER",
        class_name: "AliceRuntimeContainer",
        namespace_id: "5".repeat(32),
      },
      {
        type: "plain_text",
        name: "ALICE_RUNTIME_CONTAINER",
        text: "colliding-binding",
      },
    ],
  ]) {
    assert.throws(
      () => bootstrapModule.planAliceBootstrapIdentityActions({
        activeVersionIds: {
          access: observedLegacyAccessVersionId,
          runtimeHost: null,
          control: null,
          statePlane: null,
          connectorPlane: null,
        },
        activeVersions: {
          access: {
            ...observedLegacyAccessVersion,
            resources: { bindings },
          },
          runtimeHost: null,
          control: null,
          statePlane: null,
          connectorPlane: null,
        },
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
    );
  }
});

test("materializes only inert unrouted pre-release Worker identities", () => {
  assert.equal(
    typeof bootstrapModule.buildAliceBootstrapPrivateWorkerConfig,
    "function",
  );
  const exactRuntimeImage =
    `registry.cloudflare.com/${sourceConfig.account_id}/alice-runtime@sha256:${"a".repeat(64)}`;
  for (const [role, name, binding] of [
    [
      "access",
      "alice-access-gateway",
      {
        name: "ALICE_RUNTIME_CONTAINER",
        class_name: "AliceRuntimeContainer",
        script_name: "alice-runtime-container-host",
      },
    ],
    [
      "runtimeHost",
      "alice-runtime-container-host",
      { name: "ALICE_RUNTIME_CONTAINER", class_name: "AliceRuntimeContainer" },
    ],
    [
      "statePlane",
      "alice-state-plane",
      { name: "ALICE_COORDINATION", class_name: "AliceStateCoordination" },
    ],
    [
      "connectorPlane",
      "alice-connector-plane",
      {
        name: "ALICE_CONNECTOR_OUTBOUND",
        class_name: "AliceConnectorOutboundCoordination",
      },
    ],
  ]) {
    const config = bootstrapModule.buildAliceBootstrapPrivateWorkerConfig({
      role,
      ...(role === "runtimeHost" ? { runtimeImage: exactRuntimeImage } : {}),
      sourceConfig: {
        account_id: sourceConfig.account_id,
        name,
        main: "src/index.ts",
        routes: [{ pattern: "should-never-be-public.example/*" }],
        workers_dev: true,
        preview_urls: true,
        vars: { SAFE_STATIC_VALUE: "present" },
        secrets: { required: ["PRIVATE_SECRET"] },
        services: [{ binding: "UPSTREAM", service: "other-worker" }],
        containers: [{
          name: "alice-production-runtime",
          class_name: "AliceRuntimeContainer",
          image:
            `registry.cloudflare.com/${sourceConfig.account_id}/alice-runtime:REPLACED_BY_PRODUCTION_DEPLOY`,
          instance_type: "standard-1",
          max_instances: 1,
        }],
        d1_databases: [{ binding: "DB", database_id: "provider-id" }],
        vectorize: [{ binding: "VECTOR", index_name: "provider-index" }],
        r2_buckets: [{ binding: "OBJECTS", bucket_name: "provider-bucket" }],
        durable_objects: { bindings: [binding] },
        migrations: [{
          tag: `${role}-v1`,
          new_sqlite_classes: [binding.class_name],
        }],
      },
      deploymentMainPath: `/release/${name}/index.js`,
    });
    assert.equal(config.name, name);
    assert.equal(config.main, `/release/${name}/index.js`);
    assert.deepEqual(config.routes, []);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.deepEqual(config.secrets, { required: [] });
    assert.deepEqual(config.durable_objects.bindings, [binding]);
    assert.equal("services" in config, false);
    assert.equal("containers" in config, role === "runtimeHost");
    if (role === "runtimeHost") {
      assert.equal(config.containers[0].image, exactRuntimeImage);
    }
    assert.equal("d1_databases" in config, false);
    assert.equal("vectorize" in config, false);
    assert.equal("r2_buckets" in config, false);
  }
  for (const runtimeImage of [
    undefined,
    `registry.cloudflare.com/${sourceConfig.account_id}/alice-runtime:latest`,
    `registry.cloudflare.com/${sourceConfig.account_id}/other@sha256:${"a".repeat(64)}`,
  ]) {
    assert.throws(
      () => bootstrapModule.buildAliceBootstrapPrivateWorkerConfig({
        role: "runtimeHost",
        runtimeImage,
        sourceConfig: {
          account_id: sourceConfig.account_id,
          name: "alice-runtime-container-host",
          durable_objects: { bindings: [{
            name: "ALICE_RUNTIME_CONTAINER",
            class_name: "AliceRuntimeContainer",
          }] },
          containers: [{
            name: "alice-production-runtime",
            class_name: "AliceRuntimeContainer",
            image:
              `registry.cloudflare.com/${sourceConfig.account_id}/alice-runtime:REPLACED_BY_PRODUCTION_DEPLOY`,
            instance_type: "standard-1",
            max_instances: 1,
          }],
        },
        deploymentMainPath: "/release/alice-runtime-container-host/index.js",
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
    );
  }
});

test("retains bootstrap commands while pre-import never creates continuity resources", () => {
  assert.deepEqual(
    buildAliceBootstrapCreationCommand({
      controlMain: "/release/alice-production-control/index.js",
      configPath: "/release/control.bootstrap.wrangler.json",
      sourceCommit: "1".repeat(40),
      releaseRunId: "123-1",
    }),
    [
      "deploy",
      "/release/alice-production-control/index.js",
      "--config",
      "/release/control.bootstrap.wrangler.json",
      "--no-bundle",
      "--strict",
      "--tag",
      `alice-continuity-bootstrap-${"1".repeat(40)}-123-1`,
      "--message",
      `Alice unrouted fail-closed continuity bootstrap ${"1".repeat(40)}`,
    ],
  );
  assert.deepEqual(
    buildAliceBootstrapPromotionCommand({
      versionId: "11111111-1111-4111-8111-111111111111",
      configPath: "/release/control.bootstrap.wrangler.json",
    }),
    [
      "versions",
      "deploy",
      "--config",
      "/release/control.bootstrap.wrangler.json",
      "--version-id",
      "11111111-1111-4111-8111-111111111111",
      "--percentage",
      "100",
      "--message",
      "Alice fail-closed continuity bootstrap",
      "--yes",
    ],
  );
  const source = fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  );
  const main = source.slice(source.indexOf("async function main()"));
  assert.ok(main.indexOf("fetchAliceBootstrapResourceSnapshot") >= 0);
  assert.ok(main.indexOf("verifyProtectedRefStillExact") >= 0);
  assert.ok(main.indexOf("planAliceBootstrapIdentityActions") >= 0);
  assert.ok(
    main.indexOf("verifyAliceBootstrapPreimportContinuity") <
      main.indexOf("executeAliceBootstrapIdentityActions"),
  );
  assert.ok(main.indexOf("executeAliceBootstrapIdentityActions") >= 0);
  assert.doesNotMatch(
    main,
    /ensureAliceBootstrapQueue|ensureBucketAndSentinel|ensureConsumer/,
  );
  assert.ok(
    main.indexOf("executeAliceBootstrapIdentityActions") <
      main.indexOf("fetchAliceCloudflareContinuityState"),
  );
});

test("parses only one exact pinned-Wrangler first-deploy version", () => {
  const versionId = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    parseAliceWranglerDeployVersionId(
      `Uploaded alice-production-control (1.23 sec)\nCurrent Version ID: ${versionId}\n`,
    ),
    versionId,
  );
  for (const output of [
    `Worker Version ID: ${versionId}\n`,
    `Current version ID: ${versionId}\n`,
    `Current Version ID: not-a-version\n`,
    `Current Version ID: ${versionId}\nCurrent Version ID: ${versionId}\n`,
  ]) {
    assert.throws(
      () => parseAliceWranglerDeployVersionId(output),
      /ALICE_CLOUDFLARE_BOOTSTRAP_DEPLOY_VERSION_INVALID/,
    );
  }
});

const activeRecoveryVersionId = "12567b75-bc0e-4451-9e8c-52295ec7af2b";
const newerInactiveVersionId = "193bed86-48b7-4924-8d23-e123fa86ee9a";
const activeRecoveryVersion = {
  id: activeRecoveryVersionId,
  annotations: {
    "workers/tag": `alice-recovery-boundary-${"a".repeat(40)}`,
  },
  resources: {
    bindings: [
      {
        type: "durable_object_namespace",
        name: "ALICE_AUTHORITY",
        class_name: "AliceAuthority",
        namespace_id: "1".repeat(32),
      },
      {
        type: "durable_object_namespace",
        name: "ALICE_SESSIONS",
        class_name: "AliceSession",
        namespace_id: "2".repeat(32),
      },
    ],
  },
};

function activeDeployments(versions = [{
  percentage: 100,
  version_id: activeRecoveryVersionId,
}]) {
  return {
    deployments: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      versions,
    }],
  };
}

function deploymentFetch(result, calls = []) {
  return async (url, options) => {
    const parsed = new URL(url);
    calls.push(parsed);
    assert.equal(options.method, "GET");
    if (parsed.pathname.endsWith("/deployments")) {
      return Response.json({ success: true, result });
    }
    if (
      parsed.pathname.endsWith("/versions") &&
      parsed.searchParams.get("per_page") === "1"
    ) {
      return Response.json({
        success: true,
        result: { items: [{ id: newerInactiveVersionId }] },
      });
    }
    assert.fail(`unexpected provider request: ${parsed.pathname}${parsed.search}`);
  };
}

test("accepts the exact active recovery boundary when a newer upload is inactive", async () => {
  const calls = [];
  const activeVersionId = await fetchAliceActiveControlVersionId({
    fetchImpl: deploymentFetch(activeDeployments(), calls),
    apiToken: "provider-token-value",
  });
  assert.equal(activeVersionId, activeRecoveryVersionId);
  assert.deepEqual(
    verifyAliceBootstrapReentryBoundary({
      activeVersionId,
      expectedVersionId: activeRecoveryVersionId,
      version: activeRecoveryVersion,
    }),
    {
      versionId: activeRecoveryVersionId,
      namespaceIds: {
        access: [],
        runtimeHost: [],
        aiGateway: [],
        control: [
          {
            className: "AliceAuthority",
            name: "ALICE_AUTHORITY",
            namespaceId: "1".repeat(32),
            scriptName: null,
          },
          {
            className: "AliceSession",
            name: "ALICE_SESSIONS",
            namespaceId: "2".repeat(32),
            scriptName: null,
          },
        ],
        statePlane: [],
        connectorPlane: [],
      },
    },
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].pathname.endsWith("/deployments"));
  const main = fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  ).slice(fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  ).indexOf("async function main()"));
  assert.doesNotMatch(main, /latestUploadedControlVersionId/);
});

test("rejects multiple or malformed active control versions", async () => {
  for (const deployments of [
    activeDeployments([
      { percentage: 50, version_id: activeRecoveryVersionId },
      { percentage: 50, version_id: newerInactiveVersionId },
    ]),
    activeDeployments([{
      percentage: 99,
      version_id: activeRecoveryVersionId,
    }]),
    activeDeployments([{
      percentage: 100,
      version_id: "not-a-version",
    }]),
  ]) {
    await assert.rejects(
      fetchAliceActiveControlVersionId({
        fetchImpl: deploymentFetch(deployments),
        apiToken: "provider-token-value",
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
    );
  }
});

test("rejects malformed recovery/bootstrap tags and Durable Object bindings", () => {
  for (const tag of [
    "alice-recovery-boundary-main",
    `alice-continuity-bootstrap-${"a".repeat(40)}-123`,
  ]) {
    assert.throws(
      () => verifyAliceBootstrapReentryBoundary({
        activeVersionId: activeRecoveryVersionId,
        expectedVersionId: activeRecoveryVersionId,
        version: {
          ...activeRecoveryVersion,
          annotations: { "workers/tag": tag },
        },
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
    );
  }
  assert.throws(
    () => verifyAliceBootstrapReentryBoundary({
      activeVersionId: activeRecoveryVersionId,
      expectedVersionId: activeRecoveryVersionId,
      version: {
        ...activeRecoveryVersion,
        resources: {
          bindings: activeRecoveryVersion.resources.bindings.map((binding) =>
            binding.name === "ALICE_SESSIONS"
              ? { ...binding, class_name: "WrongSession" }
              : binding
          ),
        },
      },
    }),
    /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
  );
});

test("accepts only Cloudflare's unambiguous Queue consumer script field", () => {
  const consumer = {
    consumer_id: "a".repeat(32),
    queue_name: "alice-production-evidence-v1",
    script: "alice-production-control",
    type: "worker",
    dead_letter_queue: "alice-production-evidence-dlq-v1",
    settings: {
      batch_size: 10,
      max_concurrency: 1,
      max_retries: 3,
      max_wait_time_ms: 5_000,
      retry_delay: 10,
    },
  };
  assert.deepEqual(verifyAliceBootstrapQueueConsumer(consumer), consumer);
  const { script, ...legacyConsumer } = consumer;
  assert.deepEqual(
    verifyAliceBootstrapQueueConsumer({
      ...legacyConsumer,
      script_name: script,
    }),
    { ...legacyConsumer, script_name: script },
  );
  for (const substitution of [
    { ...consumer, script_name: consumer.script },
    { ...consumer, script: "other" },
    { ...consumer, script: undefined },
  ]) {
    assert.throws(
      () => verifyAliceBootstrapQueueConsumer(substitution),
      /ALICE_CLOUDFLARE_BOOTSTRAP_INVALID/,
    );
  }
});

test("requires the exact existing continuity resources before pre-import mutation", () => {
  const queue = (queue_name, id) => ({
    queue_id: id.repeat(32),
    queue_name,
    settings: {
      delivery_delay: 0,
      delivery_paused: true,
      message_retention_period: 86_400,
    },
  });
  const consumer = {
    consumer_id: "c".repeat(32),
    queue_name: "alice-production-evidence-v1",
    script: "alice-production-control",
    type: "worker",
    dead_letter_queue: "alice-production-evidence-dlq-v1",
    settings: {
      batch_size: 10,
      max_concurrency: 1,
      max_retries: 3,
      max_wait_time_ms: 5_000,
      retry_delay: 10,
    },
  };
  const preflight = {
    queues: {
      evidence: queue("alice-production-evidence-v1", "a"),
      deadLetter: queue("alice-production-evidence-dlq-v1", "b"),
    },
    consumers: { evidence: [consumer], deadLetter: [] },
    bucket: {
      name: "alice-production-evidence",
      jurisdiction: "default",
      location: "ENAM",
      storage_class: "Standard",
    },
    sentinelObjects: [{ key: "alice-continuity.json" }],
    sentinelBodyVerified: true,
  };

  assert.deepEqual(
    bootstrapModule.verifyAliceBootstrapPreimportContinuity(preflight),
    { evidenceQueue: preflight.queues.evidence },
  );
  for (const invalidPreflight of [
    { ...preflight, queues: { ...preflight.queues, evidence: null } },
    { ...preflight, consumers: { ...preflight.consumers, evidence: [] } },
    { ...preflight, bucket: null },
    { ...preflight, sentinelObjects: [] },
    { ...preflight, sentinelBodyVerified: false },
  ]) {
    assert.throws(
      () => bootstrapModule.verifyAliceBootstrapPreimportContinuity(invalidPreflight),
      /ALICE_CLOUDFLARE_BOOTSTRAP_PREIMPORT_CONTINUITY_INVALID/,
    );
  }
});

test("snapshots every Alice provider surface twice before the first mutation", () => {
  const source = fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  );
  const snapshot = source.slice(
    source.indexOf("export async function fetchAliceBootstrapResourceSnapshot"),
    source.indexOf("function verifyProtectedRefStillExact"),
  );
  for (const expected of [
    "/access/apps",
    "/access/identity_providers",
    "/devices/posture",
    "/ai-gateway/gateways/",
    "/workers/routes",
    "/workers/domains",
    "/workers/scripts/",
    "/event_subscriptions/subscriptions",
    "/workflows/",
    "/r2/buckets/",
    "/queues",
  ]) {
    assert.match(snapshot, new RegExp(expected.replaceAll("/", "\\/")));
  }
  for (const [role, worker] of [
    ["access", "accessWorker"],
    ["runtimeHost", "runtimeHostWorker"],
    ["control", "controlWorker"],
    ["aiGateway", "aiGatewayWorker"],
    ["statePlane", "statePlaneWorker"],
    ["connectorPlane", "connectorPlaneWorker"],
  ]) {
    assert.match(
      source,
      new RegExp(`${role}: ALICE_CLOUDFLARE_TARGET\\.${worker}`),
    );
  }
  assert.match(snapshot, /ROLES\.map\(\(role\) => ROLE_WORKERS\[role\]\)/);
  const main = source.slice(source.indexOf("async function main()"));
  const first = main.indexOf("const preflightFirst = await fetchAliceBootstrapResourceSnapshot");
  const second = main.indexOf("const preflightSecond = await fetchAliceBootstrapResourceSnapshot");
  const continuity = main.indexOf("verifyAliceBootstrapPreimportContinuity");
  const firstMutation = main.indexOf("executeAliceBootstrapIdentityActions");
  assert.ok(
    first >= 0 && second > first && continuity > second &&
      firstMutation > continuity,
  );
  assert.match(main, /ALICE_CLOUDFLARE_BOOTSTRAP_PREFLIGHT_DRIFT/);
});

function bootstrapSnapshotFetch(routeResponses) {
  let routeCalls = 0;
  const requests = [];
  const emptyList = () => Response.json({
    success: true,
    errors: [],
    messages: [],
    result: [],
  });
  return {
    get routeCalls() {
      return routeCalls;
    },
    get writeCalls() {
      return requests.filter(({ method }) => method !== "GET").length;
    },
    get requests() {
      return requests;
    },
    async fetchImpl(url, options = {}) {
      const pathname = new URL(url).pathname;
      requests.push({ method: options.method ?? "GET", pathname });
      if (pathname.endsWith("/workers/routes")) {
        const response = routeResponses[
          Math.min(routeCalls, routeResponses.length - 1)
        ];
        routeCalls += 1;
        return response();
      }
      if (
        pathname.endsWith("/queues") ||
        pathname.endsWith("/event_subscriptions/subscriptions") ||
        pathname.endsWith("/access/apps") ||
        pathname.endsWith("/access/identity_providers") ||
        pathname.endsWith("/devices/posture") ||
        pathname.endsWith("/workers/domains")
      ) {
        return emptyList();
      }
      return Response.json({
        success: false,
        errors: [{ code: 1001 }],
        messages: [],
        result: null,
      }, { status: 404 });
    },
  };
}

test("retries only a 503/CF_NONE Worker-route GET with deterministic delay and zero writes", async () => {
  const provider = bootstrapSnapshotFetch([
    () => new Response("private upstream detail", { status: 503 }),
    () => Response.json({ success: true, result: [] }),
  ]);
  const delays = [];
  const snapshot = await bootstrapModule.fetchAliceBootstrapResourceSnapshot({
    fetchImpl: provider.fetchImpl,
    apiToken: "provider-token-value-must-not-appear",
    deployCredentialIdSha256: `sha256:${"0".repeat(64)}`,
    transientRouteReadSleep: async (delayMs) => delays.push(delayMs),
  });
  assert.equal(provider.routeCalls, 2);
  assert.deepEqual(delays, [100]);
  assert.equal(provider.writeCalls, 0);
  assert.deepEqual(snapshot.traffic.routes, []);
});

test("exhausts exactly three 503/CF_NONE Worker-route GETs with the same sanitized error", async () => {
  const provider = bootstrapSnapshotFetch([
    () => new Response("private upstream detail", { status: 503 }),
  ]);
  const delays = [];
  await assert.rejects(
    bootstrapModule.fetchAliceBootstrapResourceSnapshot({
      fetchImpl: provider.fetchImpl,
      apiToken: "provider-token-value-must-not-appear",
      deployCredentialIdSha256: `sha256:${"0".repeat(64)}`,
      transientRouteReadSleep: async (delayMs) => delays.push(delayMs),
    }),
    (error) => error?.message ===
      "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_503:CF_NONE",
  );
  assert.equal(provider.routeCalls, 3);
  assert.deepEqual(delays, [100, 100]);
  assert.equal(provider.writeCalls, 0);
});

test("does not retry a 503 Worker-route GET carrying a numeric Cloudflare error", async () => {
  const provider = bootstrapSnapshotFetch([
    () => Response.json({
      success: false,
      errors: [{ code: 1000, message: "provider detail must stay private" }],
    }, { status: 503 }),
    () => Response.json({ success: true, result: [] }),
  ]);
  const delays = [];
  await assert.rejects(
    bootstrapModule.fetchAliceBootstrapResourceSnapshot({
      fetchImpl: provider.fetchImpl,
      apiToken: "provider-token-value-must-not-appear",
      deployCredentialIdSha256: `sha256:${"0".repeat(64)}`,
      transientRouteReadSleep: async (delayMs) => delays.push(delayMs),
    }),
    (error) => error?.message ===
      "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_503:CF_1000",
  );
  assert.equal(provider.routeCalls, 1);
  assert.deepEqual(delays, []);
});

test("fails every non-eligible Worker-route read error after one call", async () => {
  const cases = [
    {
      response: () => {
        throw new TypeError("private transport detail");
      },
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_NONE:CF_NONE",
    },
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 1015 }],
      }, { status: 429 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_429:CF_1015",
    },
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 9109 }],
      }, { status: 403 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_403:CF_9109",
    },
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 1001 }],
      }, { status: 404 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_404:CF_1001",
    },
    {
      response: () => new Response("private upstream detail", { status: 502 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_502:CF_NONE",
    },
    {
      response: () => new Response("not-json", { status: 200 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_200:CF_NONE",
    },
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 10000 }],
      }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_200:CF_10000",
    },
    {
      response: () => Response.json({ success: true, result: {} }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_WORKER_ROUTES:HTTP_200:CF_NONE",
    },
  ];
  for (const fixture of cases) {
    const provider = bootstrapSnapshotFetch([fixture.response]);
    await assert.rejects(
      bootstrapModule.fetchAliceBootstrapResourceSnapshot({
        fetchImpl: provider.fetchImpl,
        apiToken: "provider-token-value-must-not-appear",
        deployCredentialIdSha256: `sha256:${"0".repeat(64)}`,
      }),
      (error) => error?.message === fixture.expected,
    );
    assert.equal(provider.routeCalls, 1);
    assert.equal(provider.writeCalls, 0);
  }
});

test("does not retry a POST that returns 503/CF_NONE", async () => {
  const calls = [];
  await assert.rejects(
    ensureAliceBootstrapQueue({
      fetchImpl: async (_url, options) => {
        calls.push(options.method);
        if (options.method === "GET") {
          return Response.json({ success: true, result: [] });
        }
        return new Response("private upstream detail", { status: 503 });
      },
      apiToken: "provider-token-value-must-not-appear",
      name: "alice-production-evidence-v1",
    }),
    (error) => error?.message ===
      "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:CREATE_QUEUE:HTTP_503:CF_NONE",
  );
  assert.deepEqual(calls, ["GET", "POST"]);
});

test("reports only a static provider-read operation, HTTP status, and numeric Cloudflare code", async () => {
  const cases = [
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 9109, message: "provider detail must stay private" }],
      }, { status: 403 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_403:CF_9109",
    },
    {
      response: () => new Response("not-json", { status: 502 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_502:CF_NONE",
    },
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 1001 }],
      }, { status: 404 }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_404:CF_1001",
    },
    {
      response: () => Response.json({
        success: false,
        errors: [{ code: 10000 }],
      }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_200:CF_10000",
    },
    {
      response: () => Response.json({ success: true }),
      expected:
        "ALICE_CLOUDFLARE_BOOTSTRAP_API_INVALID:LIST_QUEUES:HTTP_200:CF_NONE",
    },
  ];
  for (const fixture of cases) {
    let calls = 0;
    let failure;
    try {
      await ensureAliceBootstrapQueue({
        fetchImpl: async () => {
          calls += 1;
          return fixture.response();
        },
        apiToken: "provider-token-value-must-not-appear",
        name: "alice-production-evidence-v1",
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.message, fixture.expected);
    assert.equal(calls, 1);
    assert.equal(failure.message.includes("provider-token-value"), false);
    assert.equal(failure.message.includes("provider detail"), false);
    assert.equal(failure.message.includes("/accounts/"), false);
  }
});

test("verifies and hashes the exact deploy token identity without retaining the token", async () => {
  const tokenId = "0123456789abcdef0123456789abcdef";
  const apiToken = "provider-token-value-must-not-appear";
  const calls = [];
  const credentialIdSha256 =
    await bootstrapModule.verifyAliceBootstrapDeployToken({
      apiToken,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return Response.json({
          success: true,
          errors: [],
          messages: [],
          result: { id: tokenId, status: "active" },
        });
      },
    });
  assert.equal(
    credentialIdSha256,
    `sha256:${crypto.createHash("sha256").update(tokenId).digest("hex")}`,
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url.endsWith(
      "/accounts/036df6c823669b8fa2f66cf4c16eeb29/tokens/verify",
    ),
    true,
  );
  assert.equal(JSON.stringify(credentialIdSha256).includes(apiToken), false);
});

test("rejects an inactive, malformed, or extended deploy-token identity", async () => {
  for (const result of [
    { id: "0".repeat(32), status: "disabled" },
    { id: "not-a-token-id", status: "active" },
    { id: "0".repeat(32), status: "active", secret: "provider-value" },
  ]) {
    await assert.rejects(
      bootstrapModule.verifyAliceBootstrapDeployToken({
        apiToken: "provider-token-value",
        fetchImpl: async () => Response.json({ success: true, result }),
      }),
      /ALICE_CLOUDFLARE_BOOTSTRAP_DEPLOY_TOKEN_INVALID/,
    );
  }
});

test("binds the verified deploy-token hash before the first provider snapshot", () => {
  const source = fs.readFileSync(
    new URL("./alice_cloudflare_bootstrap.mjs", import.meta.url),
    "utf8",
  );
  const snapshot = source.slice(
    source.indexOf("export async function fetchAliceBootstrapResourceSnapshot"),
    source.indexOf("function verifyProtectedRefStillExact"),
  );
  const main = source.slice(source.indexOf("async function main()"));
  const verify = main.indexOf(
    "const deployCredentialIdSha256 = await verifyAliceBootstrapDeployToken",
  );
  const first = main.indexOf(
    "const preflightFirst = await fetchAliceBootstrapResourceSnapshot",
  );
  assert.ok(verify >= 0 && first > verify);
  assert.match(snapshot, /deployCredentialIdSha256/);
  assert.match(snapshot, /alice\.cloudflare-bootstrap-preflight\.v3/);
});

test("finds the exact paused queue across every provider page without mutating", async () => {
  const calls = [];
  const filler = Array.from({ length: 100 }, (_, index) => ({
    queue_id: `${index}`.padStart(32, "0"),
    queue_name: `unrelated-${index}`,
  }));
  const expected = {
    queue_id: "a".repeat(32),
    queue_name: "alice-production-evidence-v1",
    settings: {
      delivery_delay: 0,
      delivery_paused: true,
      message_retention_period: 86_400,
    },
  };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ parsed, options });
    assert.equal(options.method, "GET");
    const page = Number(parsed.searchParams.get("page"));
    return Response.json({
      success: true,
      result: page === 1 ? filler : [expected],
      result_info: {
        page,
        per_page: 100,
        count: page === 1 ? 100 : 1,
        total_count: 101,
      },
    });
  };
  const result = await ensureAliceBootstrapQueue({
    fetchImpl,
    apiToken: "provider-token-value",
    name: expected.queue_name,
  });
  assert.deepEqual(result, { created: false, queue: expected });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].parsed.searchParams.get("page"), "2");
});

test("accepts Cloudflare's observed page-one metadata without total_pages", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ parsed, options });
    if (options.method === "POST") {
      return Response.json({ success: true, result: { queue_id: "a".repeat(32) } });
    }
    if (calls.length === 3) {
      return Response.json({
        success: true,
        result: [{
          queue_id: "a".repeat(32),
          queue_name: "alice-production-evidence-v1",
          settings: {
            delivery_delay: 0,
            delivery_paused: true,
            message_retention_period: 86_400,
          },
        }],
      });
    }
    return Response.json({
      success: true,
      result: [],
      result_info: {
        page: 1,
        per_page: 100,
        count: 0,
        total_count: 0,
      },
    });
  };
  const pending = ensureAliceBootstrapQueue({
    fetchImpl,
    apiToken: "provider-token-value",
    name: "alice-production-evidence-v1",
  });
  assert.deepEqual(await pending, {
    created: true,
    queue: {
      queue_id: "a".repeat(32),
      queue_name: "alice-production-evidence-v1",
      settings: {
        delivery_delay: 0,
        delivery_paused: true,
        message_retention_period: 86_400,
      },
    },
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].options.method, "GET");
});

test("accepts Cloudflare's canonical uppercase ENAM bucket readback", () => {
  assert.deepEqual(
    verifyAliceBootstrapBucket({
      name: "alice-production-evidence",
      jurisdiction: "default",
      location: "ENAM",
      storage_class: "Standard",
    }),
    {
      name: "alice-production-evidence",
      jurisdiction: "default",
      location: "ENAM",
      storage_class: "Standard",
    },
  );
});
