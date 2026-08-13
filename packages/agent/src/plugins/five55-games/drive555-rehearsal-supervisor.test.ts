import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  Drive555RehearsalSupervisor,
  type Drive555RehearsalDependencies,
} from "./drive555-rehearsal-supervisor.js";
import type { GameplayEvidenceHandlersPort } from "./gameplay-client-port.js";

const H = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
  d: "d".repeat(64),
  e: "e".repeat(64),
  f: "f".repeat(64),
  g: "0".repeat(64),
};

const TASK3 = {
  adapterManifestDigest: "8ccc180da4b040803dedbf13d1ba68bb0fdf62ff2ac3f09204ab1faab72f7362",
  controllerDigest: "30c6037daf09286f7d2c3171257b8786514c77c537be47a0845461575183b22e",
  initialFixtureDigest: "8c71295c3791e7ad062981fc852463beb241d2e3a40a885ff2ce18ab4a896bd5",
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite canonical number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("unsupported canonical value");
}

function sha256GameplayCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function digestWithout(value: Record<string, unknown>, field: string): string {
  const copy = { ...value };
  delete copy[field];
  return sha256GameplayCanonical(copy);
}

function withSelfDigest<T extends Record<string, unknown>>(
  value: T,
  field: string = "resultDigest",
): T {
  return { ...value, [field]: sha256GameplayCanonical(value) } as T;
}

function capabilityFixture() {
  return {
    protocolVersion: "gameplay.v1" as const,
    sessionId: "session-1",
    gameRunId: "run-1",
    binding: {
      bindingId: "binding-1",
      gameRunId: "run-1",
      sourceId: "source-1",
      gameId: "555drive",
      controlMode: "fenced_agent_v1" as const,
    },
    controlMode: "fenced_agent_v1" as const,
    manifest: {
      gameId: "555drive",
      adapterVersion: "1.0.0",
      observationSchemaVersion: "555drive.observation.v1",
      controlSchemaVersion: "555drive.controls.v1",
      observations: {
        stateSchemaId: "555drive.state.v1",
      },
      controls: {
        descriptors: [
          { id: "accelerate", kind: "analog" as const, minimum: 0, maximum: 1, neutral: 0 },
          { id: "brake", kind: "analog" as const, minimum: 0, maximum: 1, neutral: 0 },
          { id: "steer", kind: "analog" as const, minimum: -1, maximum: 1, neutral: 0 },
        ],
        commandSemantics: "complete_snapshot" as const,
        maximumIntentAgeMs: 250,
        maximumHoldMs: 300,
        maximumSilenceMs: 500,
      },
    },
    runtime: {
      bridgeId: "555drive.native.bridge",
      bridgeVersion: "555drive.native.v1",
      bridgeDigest: H.a,
      observationSchemaVersion: "555drive.observation.v1",
      controlSchemaVersion: "555drive.controls.v1",
      controls: [
        { id: "accelerate", kind: "analog" as const, minimum: 0, maximum: 1, neutral: 0 },
        { id: "brake", kind: "analog" as const, minimum: 0, maximum: 1, neutral: 0 },
        { id: "steer", kind: "analog" as const, minimum: -1, maximum: 1, neutral: 0 },
      ],
      commandSemantics: "complete_snapshot" as const,
      nativeFenceEnforcement: true,
      appliedControls: true,
      maximumIntentAgeMs: 250,
      maximumHoldMs: 300,
      maximumSilenceMs: 500,
    },
    runtimeProvenance: {
      bridgeId: "555drive.native.bridge",
      bridgeVersion: "555drive.native.v1",
      bridgeDigest: H.a,
      adapterManifestDigest: TASK3.adapterManifestDigest,
      adapterVersion: "1.0.0",
      gameAssetDigest: H.b,
      rawSchemaVersion: "555drive.state.v1",
      runtimeProvenanceDigest: H.c,
    },
    certificationCandidate: {
      gameId: "555drive",
      bridgeDigest: H.a,
      adapterManifestDigest: TASK3.adapterManifestDigest,
      controllerDigest: TASK3.controllerDigest,
      sourceAnchorDigest: H.e,
      initialFixtureDigest: TASK3.initialFixtureDigest,
      environment: "local-composition" as const,
      candidateDigest: H.g,
    },
  };
}

function rawObservation(overrides: Record<string, unknown> = {}) {
  const raw: Record<string, unknown> = {
    gameRunId: "run-1",
    sourceId: "source-1",
    fence: 0,
    controlOwnerType: null,
    bridgeVersion: "555drive.native.v1",
    bridgeDigest: H.a,
    rawSchemaVersion: "555drive.state.v1",
    relaySequence: 10,
    sourceObservationSequence: 41,
    observedAtAuthorityMs: 10_000,
    rawState: { playerZ: 2_000 },
    appliedControls: { accelerate: 0, brake: 0, steer: 0 },
    ...overrides,
  };
  if (!Object.hasOwn(overrides, "rawStateDigest")) {
    raw.rawStateDigest = sha256GameplayCanonical(raw.rawState);
  }
  const hasControls = Object.hasOwn(raw, "appliedControls");
  if (hasControls && !Object.hasOwn(overrides, "appliedControlsDigest")) {
    raw.appliedControlsDigest = sha256GameplayCanonical(raw.appliedControls);
  }
  if (!hasControls) delete raw.appliedControlsDigest;
  if (!Object.hasOwn(overrides, "rawEnvelopeDigest")) {
    const envelope = { ...raw };
    delete envelope.rawEnvelopeDigest;
    delete envelope.relaySequence;
    raw.rawEnvelopeDigest = sha256GameplayCanonical(envelope);
  }
  return raw;
}

type ReceiptStage = "accepted" | "enqueued" | "injected" | "reflected";
type ControlReceiptOverride = Partial<{
  relaySequence: number;
  stageSequence: number;
  mappedControlsDigest: string;
  observationSequence: number;
}>;
type ReleaseReceiptOverride = Partial<{
  relaySequence: number;
  stageSequence: number;
  observationSequence: number;
}>;

function makeDependencies(options: {
  gapAfterLease?: boolean;
  baseline?: Record<string, unknown>;
  corruptEvidenceWindowDigest?: boolean;
  corruptBaselineRawStateDigest?: boolean;
  controlReceiptOverrides?: Partial<Record<ReceiptStage, ControlReceiptOverride>>;
  releaseReceiptOverrides?: Partial<Record<ReceiptStage, ReleaseReceiptOverride>>;
  badPolicyDigest?: boolean;
} = {}): {
  dependencies: Drive555RehearsalDependencies;
  calls: string[];
  sentControls: Array<Record<string, unknown>>;
  releases: Array<Record<string, unknown>>;
  evidence: { reflectedRawEnvelopeDigest: string };
} {
  const calls: string[] = [];
  const sentControls: Array<Record<string, unknown>> = [];
  const releases: Array<Record<string, unknown>> = [];
  const evidence = { reflectedRawEnvelopeDigest: "" };
  let handlers: GameplayEvidenceHandlersPort | undefined;
  const capabilities = capabilityFixture();
  const baseline = rawObservation({
    ...options.baseline,
    ...(options.corruptBaselineRawStateDigest ? { rawStateDigest: H.e } : {}),
  });

  const dependencies: Drive555RehearsalDependencies = {
    client: {
      async subscribeGameEvidence(_input, nextHandlers) {
        calls.push("subscribe");
        handlers = nextHandlers;
        return {
          ready: Promise.resolve({
            protocolVersion: "gameplay.v1",
            sessionId: "session-1",
            gameRunId: "run-1",
            firstRelaySequence: 1,
            firstSourceObservationSequence: 1,
            neutralSnapshotDigest: H.g,
            acceptedAtAuthorityMs: 1,
            resultDigest: H.a,
          }),
          async close(reason) {
            calls.push(`close:${reason}`);
          },
        };
      },
      async getGameCapabilities() {
        calls.push("capabilities");
        return capabilities;
      },
      async getGameState() {
        calls.push("state");
        return {
          protocolVersion: "gameplay.v1",
          sessionId: "session-1",
          gameRunId: "run-1",
          bindingId: "binding-1",
          sourceId: "source-1",
          state: "neutral_preflight" as const,
          bridgeReadyRecordDigest: H.e,
          neutralPreflightResultDigest: H.f,
        };
      },
      async startInitialGameLifecycle(_sessionId, request) {
        calls.push("initial-start");
        expect(request.gameRunId).toBe("run-1");
        expect(request.bindingId).toBe("binding-1");
        expect(request.requestDigest).toBe(digestWithout(request, "requestDigest"));
        const lifecycleResult = withSelfDigest({
          status: "applied" as const,
          transitionId: request.transitionId,
          requestDigest: request.requestDigest,
          command: "start" as const,
          lifecycleRevision: 1,
          runtimeRevision: 1,
          certificationFixtureRevision: 1,
          runBinding: {
            externalGameRunId: "run-1",
            nativeGameRunId: "native-run-1",
            nativeRunGeneration: 1,
            pageInstanceId: "page-1",
          },
          completedAtPageMonotonicMs: 1,
          pageClockDomainId: "page.performance.v1",
        });
        const fixture = withSelfDigest({
          lifecycle: "playing" as const,
          trackSeed: 1,
          playerX: 0,
          playerZ: 2_000,
          playerVelocityX: 0,
          playerVelocityZ: 0,
          physicsFrameSequence: 1,
          observedAtPageMonotonicMs: 1,
          pageClockDomainId: "page.performance.v1",
          appliedControlSnapshotDigest: H.d,
          neutral: true as const,
        }, "fixtureDigest");
        const result = withSelfDigest({
          protocolVersion: "gameplay.v1",
          transitionId: request.transitionId,
          requestDigest: request.requestDigest,
          state: "game_started" as const,
          gameRunId: "run-1",
          bindingId: "binding-1",
          lifecycleResult,
          sourceObservationSequence: 41,
          sourceObservationDigest: H.f,
          fixture,
          startedAtAuthorityMs: 1,
        });
        queueMicrotask(() => {
          calls.push("lifecycle:initial_start");
          void handlers?.onLifecycleResult({
            protocolVersion: "gameplay.v1",
            event: "game.lifecycle.result",
            resultKind: "initial_start",
            relaySequence: 8,
            sessionId: "session-1",
            gameRunId: "run-1",
            result,
          });
        });
        return result;
      },
      async acquireGameLease(_sessionId, request) {
        calls.push("lease");
        expect(request.requestDigest).toBe(digestWithout(request, "requestDigest"));
        queueMicrotask(() => {
          if (options.gapAfterLease) {
            void handlers?.onObservationGap({
              gameRunId: "run-1",
              relaySequence: 9,
              expectedSourceSequence: 41,
              resumedAtSourceSequence: 43,
              gapMs: 301,
            });
            return;
          }
          void handlers?.onRawObservation(baseline);
        });
        return withSelfDigest({
          protocolVersion: "gameplay.v1",
          transitionId: request.transitionId,
          requestDigest: request.requestDigest,
          lease: {
            leaseId: "lease-1",
            gameRunId: "run-1",
            ownerType: "agent" as const,
            fence: 7,
            acquiredAtAuthorityMs: 1,
            expiresAtAuthorityMs: 60_001,
            renewalIntervalMs: 60_000,
            state: "active" as const,
          },
          completedAtAuthorityMs: 1,
        });
      },
      async renewGameLease(_sessionId, request) {
        calls.push("renew");
        expect(request.requestDigest).toBe(digestWithout(request, "requestDigest"));
        return withSelfDigest({
          protocolVersion: "gameplay.v1",
          renewalId: request.renewalId,
          requestDigest: request.requestDigest,
          lease: {
            leaseId: "lease-1",
            gameRunId: "run-1",
            ownerType: "agent" as const,
            fence: 7,
            acquiredAtAuthorityMs: 1,
            expiresAtAuthorityMs: 60_001,
            renewalIntervalMs: 60_000,
            state: "active" as const,
          },
          renewedAtAuthorityMs: 2,
        });
      },
      async openGameplayEvidenceWindow(_sessionId, request) {
        calls.push("evidence-window");
        expect(request.requestDigest).toBe(digestWithout(request, "requestDigest"));
        expect(request.controllerArtifact.artifactDigest).toBe(TASK3.controllerDigest);
        expect(request.certificationCandidateDigest).toBe(H.g);
        const execution = withSelfDigest({
          controllerId: "racing_line",
          controllerVersion: "1.0.0",
          controllerDigest: TASK3.controllerDigest,
          gameplayPolicyId: request.directive.gameplayPolicyId,
          gameplayPolicyVersion: request.directive.gameplayPolicyVersion,
          gameplayPolicyDigest: request.directive.gameplayPolicyDigest,
          directiveId: request.directive.directiveId,
          directiveDigest: request.directive.directiveDigest,
        }, "executionProvenanceDigest");
        const context = withSelfDigest({
          binding: capabilities.binding,
          runtime: capabilities.runtimeProvenance,
          execution,
          certificationCandidateDigest: H.g,
        }, "contextDigest");
        const ack = withSelfDigest({
          protocolVersion: "gameplay.v1" as const,
          transitionId: request.transitionId,
          requestDigest: request.requestDigest,
          state: "controlling" as const,
          sessionId: "session-1",
          gameRunId: "run-1",
          bindingId: "binding-1",
          leaseId: "lease-1",
          ownerType: "agent" as const,
          fence: 7,
          context,
          firstRelaySequence: 1,
          firstSourceObservationSequence: 1,
          openedAtAuthorityMs: 1,
        });
        return options.corruptEvidenceWindowDigest
          ? { ...ack, resultDigest: H.a }
          : ack;
      },
      async sendGameControl(_sessionId, intent) {
        calls.push("control");
        sentControls.push(intent);
        queueMicrotask(() => {
          const reflectedControls = { accelerate: 1, brake: 0, steer: 0 };
          const reflectedControlsDigest = sha256GameplayCanonical(reflectedControls);
          const reflectedRaw = rawObservation({
            relaySequence: 14,
            sourceObservationSequence: 42,
            rawState: { playerZ: 2_025 },
            fence: 7,
            controlOwnerType: "agent",
            appliedControls: reflectedControls,
            appliedDecision: {
              leaseId: "lease-1",
              fence: 7,
              ownerType: "agent",
              directiveId: intent.directiveId,
              decisionId: intent.decisionId,
              semanticIntentDigest: intent.semanticIntentDigest,
              mappedControlsDigest: H.b,
              appliedControlsDigest: reflectedControlsDigest,
            },
          });
          evidence.reflectedRawEnvelopeDigest = String(reflectedRaw.rawEnvelopeDigest);
          const receiptBase = {
            gameRunId: "run-1",
            leaseId: "lease-1",
            fence: 7,
            ownerType: "agent" as const,
            directiveId: intent.directiveId,
            decisionId: intent.decisionId,
            semanticIntentDigest: intent.semanticIntentDigest,
            mappedControlsDigest: H.b,
            observationSequence: 41,
            sourceId: "source-1",
          };
          calls.push("control:enqueued");
          void handlers?.onReceipt({
            ...receiptBase,
            receiptId: "enqueued-1",
            state: "enqueued",
            relaySequence: 11,
            stageSequence: 2,
            ...options.controlReceiptOverrides?.enqueued,
          });
          calls.push("control:injected");
          void handlers?.onReceipt({
            ...receiptBase,
            receiptId: "injected-1",
            state: "injected",
            relaySequence: 12,
            stageSequence: 3,
            ...options.controlReceiptOverrides?.injected,
          });
          calls.push("control:reflected");
          void handlers?.onReceipt({
            ...receiptBase,
            receiptId: "reflected-1",
            state: "reflected",
            relaySequence: 13,
            stageSequence: 4,
            reflectedObservationSequence: 42,
            appliedControls: reflectedControls,
            appliedControlsDigest: reflectedControlsDigest,
            ...options.controlReceiptOverrides?.reflected,
          });
          void handlers?.onRawObservation(reflectedRaw);
        });
        return [{
          receiptId: "accepted-1",
          gameRunId: "run-1",
          leaseId: "lease-1",
          fence: 7,
          ownerType: "agent" as const,
          directiveId: intent.directiveId,
          decisionId: intent.decisionId,
          semanticIntentDigest: intent.semanticIntentDigest,
          mappedControlsDigest: H.b,
          observationSequence: 41,
          sourceId: "source-1",
          state: "accepted" as const,
          relaySequence: 10,
          stageSequence: 1,
          ...options.controlReceiptOverrides?.accepted,
        }];
      },
      async releaseGameControls(_sessionId, request) {
        calls.push("release");
        releases.push(request);
        expect(request.releaseDigest).toBe(digestWithout(request, "releaseDigest"));
        queueMicrotask(() => {
          const neutralControls = { accelerate: 0, brake: 0, steer: 0 };
          const neutralRaw = rawObservation({
            relaySequence: 19,
            sourceObservationSequence: 43,
            rawState: { playerZ: 2_025 },
            fence: 7,
            controlOwnerType: "agent",
            appliedControls: neutralControls,
          });
          const neutralControlsDigest = String(neutralRaw.appliedControlsDigest);
          const releaseReceiptBase = {
            gameRunId: "run-1",
            leaseId: "lease-1",
            ownerType: "agent" as const,
            fence: 7,
            directiveId: request.directiveId,
            releaseId: request.releaseId,
            releaseDigest: request.releaseDigest,
            observationSequence: request.observationSequence,
            neutralSemanticIntentDigest: request.neutralSemanticIntentDigest,
            neutralMappedControlsDigest: request.neutralMappedControlsDigest,
            sourceId: "source-1",
          };
          calls.push("release:enqueued");
          void handlers?.onReceipt({
            ...releaseReceiptBase,
            receiptId: "release-enqueued-1",
            state: "enqueued",
            relaySequence: 16,
            stageSequence: 6,
            ...options.releaseReceiptOverrides?.enqueued,
          });
          calls.push("release:injected");
          void handlers?.onReceipt({
            ...releaseReceiptBase,
            receiptId: "release-injected-1",
            state: "injected",
            relaySequence: 17,
            stageSequence: 7,
            ...options.releaseReceiptOverrides?.injected,
          });
          calls.push("release:reflected");
          void handlers?.onReceipt({
            ...releaseReceiptBase,
            receiptId: "release-reflected-1",
            state: "reflected",
            relaySequence: 18,
            stageSequence: 8,
            reflectedObservationSequence: 43,
            neutralAppliedControlsDigest: neutralControlsDigest,
            neutralSnapshotDigest: H.e,
            ...options.releaseReceiptOverrides?.reflected,
          });
          void handlers?.onRawObservation(neutralRaw);
        });
        return [{
          receiptId: "release-accepted-1",
          releaseId: request.releaseId,
          releaseDigest: request.releaseDigest,
          gameRunId: "run-1",
          leaseId: "lease-1",
          ownerType: "agent" as const,
          fence: 7,
          directiveId: request.directiveId,
          observationSequence: request.observationSequence,
          neutralSemanticIntentDigest: request.neutralSemanticIntentDigest,
          neutralMappedControlsDigest: request.neutralMappedControlsDigest,
          sourceId: "source-1",
          state: "accepted" as const,
          relaySequence: 15,
          stageSequence: 5,
          ...options.releaseReceiptOverrides?.accepted,
        }];
      },
    },
    gameplay: {
      adapter: {
        normalizeObservation(raw, _binding, _runtime, evidence) {
          calls.push("normalize");
          expect(evidence?.contextDigest).toMatch(/^[a-f0-9]{64}$/);
          return {
            ...raw,
            gameState: {
              lifecycle: "playing",
              player: { x: 0, z: Number(raw.rawState.playerZ) },
              hazards: [],
            },
          };
        },
      },
      controller: {
        initialState(policySnapshot) {
          expect(policySnapshot).toEqual({ riskTolerance: 0.4 });
          return { previousSteer: 0 };
        },
        decide({ observation, directive }) {
          calls.push("decide");
          expect(observation.fence).toBe(baseline.fence);
          expect(observation.controlOwnerType).toBe(baseline.controlOwnerType);
          expect(observation.sourceObservationSequence).toBe(baseline.sourceObservationSequence);
          const unsignedIntent = {
              gameRunId: observation.gameRunId,
              leaseId: directive.leaseId,
              fence: directive.fence,
              directiveId: directive.directiveId,
              decisionId: "decision-1",
              observationSequence: observation.sourceObservationSequence,
              decidedAtAgentMonotonicMs: 77,
              maximumAgeMs: 250,
              agentClockDomainId: "alice.performance.v1",
              commands: [
                { kind: "analog", controlId: "accelerate", value: 1 },
                { kind: "analog", controlId: "brake", value: 0 },
                { kind: "analog", controlId: "steer", value: 0 },
              ],
              reasonCode: "pursue_objective",
            };
          return {
            intent: {
              ...unsignedIntent,
              semanticIntentDigest: sha256GameplayCanonical(unsignedIntent),
            },
            nextState: { previousSteer: 0 },
          };
        },
      },
    },
    policy: {
      policyId: "alice.555drive.racing-line",
      policyVersion: 1,
      policyDigest: options.badPolicyDigest ? "not-a-digest" : H.d,
      strategyFamily: "racing-line",
      snapshot: { riskTolerance: 0.4 },
      recoveryPolicy: { action: "stop" },
    },
    expectedArtifacts: {
      bridgeDigest: H.a,
      adapterManifestDigest: TASK3.adapterManifestDigest,
      controllerDigest: TASK3.controllerDigest,
      sourceAnchorDigest: H.e,
      initialFixtureDigest: TASK3.initialFixtureDigest,
    },
    controllerArtifact: {
      schemaVersion: "gameplay-controller-artifact.v1",
      packageName: "@rndrntwrk/plugin-555arcade",
      controllerId: "racing_line",
      controllerVersion: "1.0.0",
      entrypoint: "racing-line.js",
      files: [{
        path: "racing-line.js",
        sha256: "583add96f83945c3ee56d18cbc760dec6cca5647ee70548305e6c0dc577c316a",
      }],
      artifactDigest: TASK3.controllerDigest,
    },
    sha256GameplayCanonical,
    persistence: {
      async persistControlReflection(value) {
        calls.push(`reflect:${value.decisionId}:${value.rawObservationDigest}`);
      },
      async persistVerifiedMasteryOutcome(value) {
        calls.push(`mastery:${value.decisionId}:${value.rawObservationDigest}`);
      },
    },
    reactions: {
      async persistThenBroadcast(sessionId, value) {
        calls.push(`react:${sessionId}:${value.reactionKind}:${value.rawObservationDigest}`);
      },
    },
    ads: {
      async triggerAdBreak(adId, options, sessionId) {
        calls.push(`ad:${sessionId}:${adId}:${options.duration}`);
        return { graphicId: "graphic-1", layout: "squeeze-back", duration: options.duration };
      },
    },
    createId: (() => {
      let value = 0;
      return () => `id-${++value}`;
    })(),
    nowMs: () => 77,
    observationTimeoutMs: 1_000,
  };

  return { dependencies, calls, sentControls, releases, evidence };
}

describe("Drive555RehearsalSupervisor", () => {
  it("requires native receipt and matching authoritative raw reflection before Alice persists and reacts", async () => {
    const fixture = makeDependencies();
    const result = await new Drive555RehearsalSupervisor(fixture.dependencies).run({
      sessionId: "session-1",
      gameRunId: "run-1",
      goal: "keep Alice on the racing line",
      ad: { adId: "sponsor-1", duration: 12_000 },
    });

    expect(fixture.calls.slice(0, 9)).toEqual([
      "subscribe",
      "capabilities",
      "state",
      "initial-start",
      "lifecycle:initial_start",
      "lease",
      "evidence-window",
      "normalize",
      "decide",
    ]);
    expect(fixture.calls).toContain("control");
    expect(fixture.calls).toContain("lifecycle:initial_start");
    expect(fixture.calls).toContain("control:enqueued");
    expect(fixture.calls).toContain("control:injected");
    expect(fixture.calls).toContain("control:reflected");
    expect(fixture.calls).toContain(`reflect:decision-1:${fixture.evidence.reflectedRawEnvelopeDigest}`);
    expect(fixture.calls).toContain(`mastery:decision-1:${fixture.evidence.reflectedRawEnvelopeDigest}`);
    expect(fixture.calls).toContain(`react:session-1:progress:${fixture.evidence.reflectedRawEnvelopeDigest}`);
    expect(fixture.calls).toContain("ad:session-1:sponsor-1:12000");
    expect(fixture.calls.indexOf(`reflect:decision-1:${fixture.evidence.reflectedRawEnvelopeDigest}`)).toBeLessThan(
      fixture.calls.indexOf(`mastery:decision-1:${fixture.evidence.reflectedRawEnvelopeDigest}`),
    );
    expect(fixture.calls.indexOf(`mastery:decision-1:${fixture.evidence.reflectedRawEnvelopeDigest}`)).toBeLessThan(
      fixture.calls.indexOf(`react:session-1:progress:${fixture.evidence.reflectedRawEnvelopeDigest}`),
    );
    expect(fixture.calls.indexOf("control")).toBeLessThan(
      fixture.calls.indexOf(`reflect:decision-1:${fixture.evidence.reflectedRawEnvelopeDigest}`),
    );
    expect(fixture.calls).toContain("release");
    expect(fixture.calls).toContain("release:enqueued");
    expect(fixture.calls).toContain("release:injected");
    expect(fixture.calls).toContain("release:reflected");
    expect(fixture.calls).toContain("close:rehearsal-complete");
    expect(fixture.sentControls).toHaveLength(1);
    expect(fixture.releases).toHaveLength(1);
    expect(fixture.releases[0]?.observationSequence).toBe(42);
    expect(result).toEqual({
      gameRunId: "run-1",
      decisionId: "decision-1",
      reflectedObservationSequence: 42,
      ad: { graphicId: "graphic-1", layout: "squeeze-back", duration: 12_000 },
    });
  });

  it("fails closed and releases neutral controls after an observation gap", async () => {
    const fixture = makeDependencies({ gapAfterLease: true });

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("observation gap");

    expect(fixture.calls).toContain("lease");
    expect(fixture.calls).toContain("release");
    expect(fixture.calls).toContain("close:observation-gap");
    expect(fixture.sentControls).toHaveLength(0);
  });

  it("uses a cursor-qualified neutral prior-fence raw as the next rehearsal baseline", async () => {
    const fixture = makeDependencies({
      baseline: {
        fence: 6,
        controlOwnerType: "agent",
        appliedControls: { accelerate: 0, brake: 0, steer: 0 },
      },
    });

    await new Drive555RehearsalSupervisor(fixture.dependencies).run({
      sessionId: "session-1",
      gameRunId: "run-1",
      goal: "resume the verified racing line",
    });

    expect(fixture.sentControls).toHaveLength(1);
    expect(fixture.sentControls[0]?.observationSequence).toBe(41);
    expect(fixture.calls).toContain("close:rehearsal-complete");
  });

  it("rejects a same-fence baseline and fails closed before control", async () => {
    const fixture = makeDependencies({
      baseline: {
        fence: 7,
        controlOwnerType: "agent",
        appliedControls: { accelerate: 0, brake: 0, steer: 0 },
      },
    });
    fixture.dependencies.observationTimeoutMs = 10;

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("timed out waiting for authoritative raw observation");

    expect(fixture.sentControls).toHaveLength(0);
    expect(fixture.calls).toContain("release");
    expect(fixture.calls).toContain("close:rehearsal-failed");
  });

  it("rejects a neutral raw sample from a different native bridge before control", async () => {
    const fixture = makeDependencies({
      baseline: {
        fence: 6,
        controlOwnerType: "agent",
        bridgeDigest: H.b,
        appliedControls: { accelerate: 0, brake: 0, steer: 0 },
      },
    });
    fixture.dependencies.observationTimeoutMs = 10;

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("timed out waiting for authoritative raw observation");

    expect(fixture.sentControls).toHaveLength(0);
    expect(fixture.calls).toContain("close:rehearsal-failed");
  });

  it("rejects an evidence-window acknowledgement whose canonical result digest is malformed", async () => {
    const fixture = makeDependencies({ corruptEvidenceWindowDigest: true });

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("evidence-window acknowledgement resultDigest does not bind its canonical payload");

    expect(fixture.sentControls).toHaveLength(0);
    expect(fixture.calls).toContain("release");
    expect(fixture.calls).toContain("close:rehearsal-failed");
  });

  it("rejects a raw envelope whose rawStateDigest was not canonically bound before control", async () => {
    const fixture = makeDependencies({ corruptBaselineRawStateDigest: true });

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("rawStateDigest does not bind rawState");

    expect(fixture.sentControls).toHaveLength(0);
    expect(fixture.calls).toContain("release");
    expect(fixture.calls).toContain("close:rehearsal-failed");
  });

  it("accepts the frozen zero-relay admission receipt while requiring later relay stages to increase", async () => {
    const fixture = makeDependencies({
      controlReceiptOverrides: { accepted: { relaySequence: 0 } },
      releaseReceiptOverrides: { accepted: { relaySequence: 0 } },
    });

    const result = await new Drive555RehearsalSupervisor(fixture.dependencies).run({
      sessionId: "session-1",
      gameRunId: "run-1",
      goal: "keep Alice on the racing line",
    });

    expect(result.decisionId).toBe("decision-1");
    expect(fixture.calls).toContain("close:rehearsal-complete");
    expect(fixture.sentControls).toHaveLength(1);
    expect(fixture.releases).toHaveLength(1);
  });

  it("rejects control proof when a receipt stage changes the mapped controls digest", async () => {
    const fixture = makeDependencies({
      controlReceiptOverrides: { enqueued: { mappedControlsDigest: H.c } },
    });

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("mapped controls digest changes between stages");

    expect(fixture.sentControls).toHaveLength(1);
    expect(fixture.calls.some((call) => call.startsWith("reflect:"))).toBe(false);
    expect(fixture.calls).toContain("release");
  });

  it("rejects control proof when relay receipt ordering is not strictly increasing", async () => {
    const fixture = makeDependencies({
      controlReceiptOverrides: { injected: { relaySequence: 11 } },
    });

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("control receipt relay stages are not strictly ordered");

    expect(fixture.calls.some((call) => call.startsWith("reflect:"))).toBe(false);
    expect(fixture.calls).toContain("release");
  });

  it("rejects successful work when neutral-release receipt relay ordering is not strictly increasing", async () => {
    const fixture = makeDependencies({
      releaseReceiptOverrides: { enqueued: { relaySequence: 15 } },
    });

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("neutral release receipt relay stages are not strictly ordered");

    expect(fixture.calls).toContain("release");
    expect(fixture.calls).toContain("close:rehearsal-failed");
  });

  it("attempts a bounded neutral release if directive construction fails after lease admission", async () => {
    const fixture = makeDependencies({ badPolicyDigest: true });

    await expect(
      new Drive555RehearsalSupervisor(fixture.dependencies).run({
        sessionId: "session-1",
        gameRunId: "run-1",
        goal: "keep Alice on the racing line",
      }),
    ).rejects.toThrow("gameplay policy digest must be a lowercase SHA-256 digest");

    expect(fixture.calls).toContain("lease");
    expect(fixture.calls).toContain("release");
    expect(fixture.sentControls).toHaveLength(0);
    expect(fixture.calls).toContain("close:rehearsal-failed");
  });
});
