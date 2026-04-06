/**
 * Live LLM Identity & Roles scenario tests.
 *
 * Exercises the full pipeline with REAL LLM calls to verify:
 *  1. Identity extraction accuracy (evaluator → LLM → structured output)
 *  2. Action selection accuracy (does the agent pick the right action?)
 *  3. End-to-end conversation flows with real model responses
 *
 * Run:
 *   MILADY_LIVE_TEST=1 npx vitest run packages/agent/test/identity-live.test.ts
 *
 * Requires at least one LLM provider API key in env (checked in order):
 *   GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
 *
 * Outputs a benchmark report at the end with accuracy metrics.
 */

import path from "node:path";
import {
  type Action,
  type Entity,
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type Room,
  type State,
  type UUID,
  ModelType,
  stringToUuid,
} from "@elizaos/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Environment gate
// ---------------------------------------------------------------------------

const LIVE_TESTS_ENABLED =
  process.env.MILADY_LIVE_TEST === "1" || process.env.ELIZA_LIVE_TEST === "1";

// Load .env from repo root
try {
  const { config } = await import("dotenv");
  config({ path: path.resolve(import.meta.dirname, "..", "..", "..", ".env") });
} catch {
  // dotenv optional
}

// ---------------------------------------------------------------------------
// LLM provider detection
// ---------------------------------------------------------------------------

interface LLMProvider {
  name: string;
  call: (modelType: string, params: { prompt: string; schema?: unknown }) => Promise<unknown>;
}

async function detectLLMProvider(): Promise<LLMProvider | null> {
  // Detect the actual provider from env. The OPENAI_API_KEY may actually be
  // a Groq key routed through OPENAI_API_URL, so check base URL first.
  const openaiBaseUrl = process.env.OPENAI_API_URL || process.env.OPENAI_BASE_URL || "";
  const isGroqViaOpenai = openaiBaseUrl.includes("groq.com");

  const candidates: Array<{
    name: string;
    check: () => boolean;
    setup: () => Promise<LLMProvider>;
  }> = [
    {
      name: "anthropic",
      check: () => !!process.env.ANTHROPIC_API_KEY?.trim(),
      setup: async () => ({
        name: "anthropic",
        call: async (modelType, params) => {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const isJson = modelType.startsWith("OBJECT");
          const systemPrompt = isJson
            ? "You must respond with valid JSON only. No markdown, no explanation, no code fences."
            : "";
          const message = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2048,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: "user", content: params.prompt }],
          });
          const text = message.content
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("");
          if (isJson) {
            try { return JSON.parse(text); } catch { return text; }
          }
          return text;
        },
      }),
    },
    {
      name: "groq (via openai sdk)",
      check: () => isGroqViaOpenai && !!process.env.OPENAI_API_KEY?.trim(),
      setup: async () => ({
        name: "groq",
        call: async (modelType, params) => {
          const OpenAI = (await import("openai")).default;
          const client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            baseURL: openaiBaseUrl,
          });
          const isJson = modelType.startsWith("OBJECT");
          const model = process.env.OPENAI_SMALL_MODEL || "llama-3.3-70b-versatile";
          const completion = await client.chat.completions.create({
            model,
            messages: [{ role: "user", content: params.prompt }],
            temperature: 0.1,
            max_tokens: 2048,
            ...(isJson ? { response_format: { type: "json_object" } } : {}),
          });
          const text = completion.choices[0]?.message?.content ?? "";
          if (isJson) {
            try { return JSON.parse(text); } catch { return text; }
          }
          return text;
        },
      }),
    },
    {
      name: "openai",
      check: () => !isGroqViaOpenai && !!process.env.OPENAI_API_KEY?.trim(),
      setup: async () => ({
        name: "openai",
        call: async (modelType, params) => {
          const OpenAI = (await import("openai")).default;
          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const isJson = modelType.startsWith("OBJECT");
          const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: params.prompt }],
            temperature: 0.1,
            max_tokens: 2048,
            ...(isJson ? { response_format: { type: "json_object" } } : {}),
          });
          const text = completion.choices[0]?.message?.content ?? "";
          if (isJson) {
            try { return JSON.parse(text); } catch { return text; }
          }
          return text;
        },
      }),
    },
  ];

  for (const candidate of candidates) {
    if (candidate.check()) {
      try {
        return await candidate.setup();
      } catch (err) {
        console.warn(`[live-test] Failed to set up ${candidate.name}: ${err}`);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Accuracy Tracker
// ---------------------------------------------------------------------------

interface TestCase {
  name: string;
  category: "extraction" | "action_selection" | "e2e_flow";
  passed: boolean;
  latencyMs: number;
  details: string;
  expected: string;
  actual: string;
}

class AccuracyTracker {
  private cases: TestCase[] = [];

  record(tc: TestCase): void {
    this.cases.push(tc);
  }

  getReport(): string {
    const total = this.cases.length;
    if (total === 0) return "No test cases recorded.";

    const passed = this.cases.filter((c) => c.passed).length;
    const failed = this.cases.filter((c) => !c.passed);
    const avgLatency = this.cases.reduce((s, c) => s + c.latencyMs, 0) / total;

    const byCategory = new Map<string, { total: number; passed: number }>();
    for (const c of this.cases) {
      const entry = byCategory.get(c.category) ?? { total: 0, passed: 0 };
      entry.total++;
      if (c.passed) entry.passed++;
      byCategory.set(c.category, entry);
    }

    const lines: string[] = [
      "",
      "╔══════════════════════════════════════════════════════════╗",
      "║           LIVE LLM IDENTITY TEST BENCHMARK              ║",
      "╠══════════════════════════════════════════════════════════╣",
      `║  Total tests:     ${String(total).padStart(4)}                                ║`,
      `║  Passed:          ${String(passed).padStart(4)} (${((passed / total) * 100).toFixed(1)}%)                         ║`,
      `║  Failed:          ${String(failed.length).padStart(4)}                                ║`,
      `║  Avg latency:     ${avgLatency.toFixed(0).padStart(4)}ms                              ║`,
      "╠══════════════════════════════════════════════════════════╣",
    ];

    for (const [cat, stats] of byCategory.entries()) {
      const pct = ((stats.passed / stats.total) * 100).toFixed(1);
      lines.push(
        `║  ${cat.padEnd(20)} ${String(stats.passed).padStart(3)}/${String(stats.total).padStart(3)} (${pct.padStart(5)}%)             ║`,
      );
    }

    if (failed.length > 0) {
      lines.push("╠══════════════════════════════════════════════════════════╣");
      lines.push("║  FAILURES:                                              ║");
      for (const f of failed) {
        lines.push(`║  ✗ ${f.name.slice(0, 52).padEnd(52)} ║`);
        lines.push(`║    Expected: ${f.expected.slice(0, 43).padEnd(43)} ║`);
        lines.push(`║    Actual:   ${f.actual.slice(0, 43).padEnd(43)} ║`);
      }
    }

    lines.push("╚══════════════════════════════════════════════════════════╝");
    return lines.join("\n");
  }
}

// ---------------------------------------------------------------------------
// Conversation transcript
// ---------------------------------------------------------------------------

interface TranscriptTurn {
  speaker: string;
  platform: string;
  message: string;
  llmResponse?: string;
  extractedIdentities?: Array<{ platform: string; handle: string }>;
  selectedAction?: string;
  stateChanges?: string[];
  latencyMs?: number;
}

class ConversationTranscript {
  private turns: TranscriptTurn[] = [];
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  add(turn: TranscriptTurn): void {
    this.turns.push(turn);
  }

  print(): string {
    const lines = [`\n━━━ ${this.name} ━━━`];
    for (const [i, turn] of this.turns.entries()) {
      lines.push(`\n  [${i + 1}] ${turn.speaker} (${turn.platform}):`);
      lines.push(`      "${turn.message}"`);
      if (turn.extractedIdentities?.length) {
        lines.push(`      → Extracted: ${turn.extractedIdentities.map((id) => `${id.platform}:${id.handle}`).join(", ")}`);
      }
      if (turn.selectedAction) {
        lines.push(`      → Action: ${turn.selectedAction}`);
      }
      if (turn.stateChanges?.length) {
        for (const sc of turn.stateChanges) {
          lines.push(`      → ${sc}`);
        }
      }
      if (turn.latencyMs != null) {
        lines.push(`      (${turn.latencyMs}ms)`);
      }
    }
    return lines.join("\n");
  }
}

// ---------------------------------------------------------------------------
// Extraction prompt (same as the evaluator uses)
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are analyzing a conversation to extract social and identity information.

## Participants in this room:
{{participants}}

## Recent conversation:
{{recentMessages}}

## Your task:
Analyze the conversation and extract ALL of the following. Be precise and conservative — only extract what is clearly stated or strongly implied. Do not hallucinate.

Return a JSON object with these fields:

{
  "platformIdentities": [
    {
      "platform": "twitter|discord|github|telegram|etc",
      "handle": "the handle/username",
      "belongsTo": "name of the person this handle belongs to",
      "confidence": 0.0-1.0,
      "reportedBy": "self|other"
    }
  ],
  "relationships": [],
  "mentionedPeople": [],
  "disputes": [],
  "privacyBoundaries": [],
  "trustSignals": []
}

IMPORTANT RULES:
- If a person says "my Twitter is @X", that's self-reported with confidence 0.8+
- If person A says "person B's Twitter is @X", that's hearsay with confidence 0.5
- Only extract what is clearly stated
- Return empty arrays for categories with no findings`;

// ---------------------------------------------------------------------------
// Action selection prompt
// ---------------------------------------------------------------------------

const ACTION_SELECTION_PROMPT = `You are an AI assistant deciding which action to take based on a user's message.

Available actions:
- MANAGE_IDENTITY: Claim, confirm, unlink, or list platform identities (e.g., "my twitter is @foo", "confirm alice's twitter", "remove my github link", "show my linked accounts")
- SEND_MESSAGE: Send a message to someone or to the admin/owner
- NONE: No action needed (general conversation, questions, etc.)

User message: "{{message}}"
Context: The user is speaking on {{platform}}.

Respond with a JSON object:
{
  "action": "MANAGE_IDENTITY" | "SEND_MESSAGE" | "NONE",
  "intent": "claim" | "confirm" | "unlink" | "list" | null,
  "parameters": {
    "platform": "extracted platform name or null",
    "handle": "extracted handle or null"
  },
  "reasoning": "brief explanation"
}`;

// ---------------------------------------------------------------------------
// Live test runner
// ---------------------------------------------------------------------------

type RolesMetadata = {
  ownership?: { ownerId?: string };
  roles?: Record<string, string>;
};

type MockWorld = {
  id: UUID;
  name: string;
  agentId: UUID;
  serverId: string;
  metadata: RolesMetadata & Record<string, unknown>;
};

interface IdentityClaim {
  platform: string;
  handle: string;
  status: "proposed" | "accepted" | "rejected";
  claimTier: "ground_truth" | "admin_verified" | "self_reported";
  claimedAt: number;
  claimedBy: string;
}

const KNOWN_PLATFORMS = new Set([
  "discord", "telegram", "twitter", "github", "email", "mail", "etc", "e-mail", "phone",
  "farcaster", "lens", "bluesky", "mastodon", "linkedin", "reddit",
  "youtube", "twitch", "tiktok", "instagram", "facebook",
]);

class LiveScenarioRunner {
  private entities = new Map<string, Entity>();
  private worlds = new Map<string, MockWorld>();
  private rooms = new Map<string, Room>();
  private memories = new Map<string, Memory[]>();
  private platformWorldMap = new Map<string, UUID>();

  private agentId: UUID;
  private defaultWorldId: UUID;
  private defaultRoomId: UUID;
  private llmProvider: LLMProvider;

  runtime: IAgentRuntime;

  constructor(llmProvider: LLMProvider) {
    this.llmProvider = llmProvider;
    this.agentId = stringToUuid("live-scenario-agent");
    this.defaultWorldId = stringToUuid("live-scenario-world");
    this.defaultRoomId = stringToUuid("live-scenario-room");

    this.worlds.set(this.defaultWorldId, {
      id: this.defaultWorldId,
      name: "App World",
      agentId: this.agentId,
      serverId: "",
      metadata: { ownership: {}, roles: {} },
    });
    this.platformWorldMap.set("client_chat", this.defaultWorldId);

    this.rooms.set(this.defaultRoomId, {
      id: this.defaultRoomId,
      worldId: this.defaultWorldId,
      agentId: this.agentId,
      source: "client_chat",
      type: "GROUP" as never,
    } as Room);

    this.runtime = this.buildRuntime();
  }

  setupOwner(entityId: UUID | string, opts: { name: string }): void {
    const eid = entityId as UUID;
    this.entities.set(eid, {
      id: eid,
      agentId: this.agentId,
      names: [opts.name],
      metadata: { identityClaims: [] as never },
    });
    const world = this.worlds.get(this.defaultWorldId);
    if (world) {
      world.metadata.ownership = { ownerId: eid };
      world.metadata.roles = { ...world.metadata.roles, [eid]: "OWNER" };
    }
  }

  setupEntity(entityId: UUID | string, opts: { name: string; platform: string; role?: string }): void {
    const eid = entityId as UUID;
    this.entities.set(eid, {
      id: eid,
      agentId: this.agentId,
      names: [opts.name],
      metadata: { [opts.platform]: {}, identityClaims: [] as never },
    });
    if (opts.role) {
      const world = this.worlds.get(this.defaultWorldId);
      if (world) {
        world.metadata.roles = { ...world.metadata.roles, [eid]: opts.role };
      }
    }
  }

  setupWorld(platform: string, opts?: { ownerId?: string }): UUID {
    const worldId = stringToUuid(`world-${platform}`);
    this.worlds.set(worldId, {
      id: worldId,
      name: `${platform} World`,
      agentId: this.agentId,
      serverId: `server-${platform}`,
      metadata: {
        ownership: opts?.ownerId ? { ownerId: opts.ownerId } : {},
        roles: opts?.ownerId ? { [opts.ownerId]: "OWNER" } : {},
      },
    });
    this.platformWorldMap.set(platform, worldId);
    const roomId = stringToUuid(`room-${platform}`);
    this.rooms.set(roomId, {
      id: roomId,
      worldId,
      agentId: this.agentId,
      source: platform,
      type: "GROUP" as never,
    } as Room);
    return worldId;
  }

  getClaims(entityId: UUID | string): IdentityClaim[] {
    const entity = this.entities.get(entityId as string);
    return ((entity?.metadata as Record<string, unknown>)?.identityClaims as IdentityClaim[]) ?? [];
  }

  /**
   * Run identity extraction via the real LLM.
   * Returns the extracted identities.
   */
  async extractIdentities(
    speakerName: string,
    speakerEntityId: string,
    messageText: string,
    platform: string,
  ): Promise<{
    identities: Array<{ platform: string; handle: string; belongsTo: string; confidence: number; reportedBy: string }>;
    latencyMs: number;
    rawResponse: unknown;
  }> {
    const participants = `- ${speakerName} (ID: ${speakerEntityId})\n- ScenarioAgent (ID: ${this.agentId})`;
    const recentMessages = `[${speakerName}]: ${messageText}`;

    const prompt = EXTRACTION_PROMPT
      .replace("{{participants}}", participants)
      .replace("{{recentMessages}}", recentMessages);

    const start = performance.now();
    const response = await this.llmProvider.call("OBJECT_SMALL", { prompt });
    const latencyMs = Math.round(performance.now() - start);

    const parsed = response as {
      platformIdentities?: Array<{
        platform: string;
        handle: string;
        belongsTo: string;
        confidence: number;
        reportedBy: string;
      }>;
    };

    return {
      identities: parsed?.platformIdentities ?? [],
      latencyMs,
      rawResponse: response,
    };
  }

  /**
   * Run action selection via the real LLM.
   */
  async selectAction(
    messageText: string,
    platform: string,
  ): Promise<{
    action: string;
    intent: string | null;
    parameters: { platform?: string; handle?: string };
    reasoning: string;
    latencyMs: number;
    rawResponse: unknown;
  }> {
    const prompt = ACTION_SELECTION_PROMPT
      .replace("{{message}}", messageText)
      .replace("{{platform}}", platform);

    const start = performance.now();
    const response = await this.llmProvider.call("OBJECT_SMALL", { prompt });
    const latencyMs = Math.round(performance.now() - start);

    const parsed = response as {
      action?: string;
      intent?: string;
      parameters?: { platform?: string; handle?: string };
      reasoning?: string;
    };

    return {
      action: parsed?.action ?? "NONE",
      intent: parsed?.intent ?? null,
      parameters: parsed?.parameters ?? {},
      reasoning: parsed?.reasoning ?? "",
      latencyMs,
      rawResponse: response,
    };
  }

  /**
   * Full pipeline: extract identities + select action + apply state.
   */
  async processMessage(
    speakerName: string,
    speakerEntityId: string,
    messageText: string,
    platform: string,
    role: string,
  ): Promise<{
    extraction: Awaited<ReturnType<LiveScenarioRunner["extractIdentities"]>>;
    actionSelection: Awaited<ReturnType<LiveScenarioRunner["selectAction"]>>;
    claimsStored: IdentityClaim[];
    totalLatencyMs: number;
  }> {
    const extraction = await this.extractIdentities(speakerName, speakerEntityId, messageText, platform);
    const actionSelection = await this.selectAction(messageText, platform);

    // Apply extracted identities to entity state (simulating evaluator)
    const entity = this.entities.get(speakerEntityId);
    if (entity && extraction.identities.length > 0) {
      const existing = ((entity.metadata as Record<string, unknown>)?.identityClaims as IdentityClaim[]) ?? [];
      const autoAccept = role === "OWNER" || role === "ADMIN";

      for (const identity of extraction.identities) {
        const normalizedHandle = identity.handle.replace(/^@/, "");
        if (!KNOWN_PLATFORMS.has(identity.platform)) continue;
        if (!normalizedHandle || normalizedHandle.trim().length === 0) continue;

        const existingIdx = existing.findIndex(
          (e) => e.platform === identity.platform && e.handle === normalizedHandle,
        );

        const claim: IdentityClaim = {
          platform: identity.platform,
          handle: normalizedHandle,
          status: autoAccept ? "accepted" : "proposed",
          claimTier: role === "OWNER" ? "ground_truth" : role === "ADMIN" ? "admin_verified" : "self_reported",
          claimedAt: Date.now(),
          claimedBy: speakerEntityId,
        };

        if (existingIdx >= 0) {
          existing[existingIdx] = claim;
        } else {
          existing.push(claim);
        }
      }

      (entity.metadata as Record<string, unknown>).identityClaims = existing;
    }

    return {
      extraction,
      actionSelection,
      claimsStored: this.getClaims(speakerEntityId),
      totalLatencyMs: extraction.latencyMs + actionSelection.latencyMs,
    };
  }

  private buildRuntime(): IAgentRuntime {
    const self = this;
    return {
      agentId: this.agentId,
      character: { name: "ScenarioAgent", postExamples: [] },
      getEntityById: vi.fn(async (id: UUID) => self.entities.get(id) ?? null),
      getEntity: vi.fn(async (id: UUID) => self.entities.get(id) ?? null),
      updateEntity: vi.fn(async (entity: Entity) => { self.entities.set(entity.id, entity); }),
      getRoom: vi.fn(async (id: UUID) => self.rooms.get(id) ?? null),
      getWorld: vi.fn(async (id: UUID) => self.worlds.get(id) ?? null),
      getAllWorlds: vi.fn(async () => Array.from(self.worlds.values())),
      useModel: vi.fn(async (modelType: string, params: { prompt: string }) => {
        return self.llmProvider.call(modelType, params);
      }),
      getMemories: vi.fn(async () => []),
      getService: vi.fn(() => null),
      getSetting: vi.fn(() => undefined),
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      emitEvent: vi.fn(),
    } as unknown as IAgentRuntime;
  }
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

const tracker = new AccuracyTracker();
let llmProvider: LLMProvider | null = null;

describe.skipIf(!LIVE_TESTS_ENABLED)("Live LLM Identity Scenarios", () => {
  beforeAll(async () => {
    llmProvider = await detectLLMProvider();
    if (!llmProvider) {
      console.warn("[live-test] No LLM provider found. Skipping live tests.");
      return;
    }
    console.log(`[live-test] Using LLM provider: ${llmProvider.name}`);
  });

  afterAll(() => {
    console.log(tracker.getReport());
  });

  // =========================================================================
  // Category 1: Identity Extraction Accuracy
  // =========================================================================

  describe("Identity Extraction", () => {
    const extractionCases: Array<{
      name: string;
      input: string;
      speakerName: string;
      expectedPlatforms: string[];
      expectedHandles: string[];
    }> = [
      {
        name: "single twitter claim",
        input: "my twitter is @alice_codes",
        speakerName: "Alice",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["alice_codes"],
      },
      {
        name: "multi-platform in one message",
        input: "I'm shawwalters on Discord, @shaw_w on Telegram, and @shawmakesmagic on Twitter",
        speakerName: "Shaw",
        expectedPlatforms: ["discord", "telegram", "twitter"],
        expectedHandles: ["shawwalters", "shaw_w", "shawmakesmagic"],
      },
      {
        name: "github handle claim",
        input: "check my PR on github, I'm alice-dev there",
        speakerName: "Alice",
        expectedPlatforms: ["github"],
        expectedHandles: ["alice-dev"],
      },
      {
        name: "email claim",
        input: "my email address is shaw@example.com",
        speakerName: "Shaw",
        // LLMs may return "email", "mail", or "etc" for email platform
        expectedPlatforms: ["email"],
        expectedHandles: ["shaw@example.com"],
      },
      {
        name: "x normalized to twitter",
        input: "my X is @cooldev",
        speakerName: "Dev",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["cooldev"],
      },
      {
        name: "no identity in greeting",
        input: "hey everyone, how's it going?",
        speakerName: "Bob",
        expectedPlatforms: [],
        expectedHandles: [],
      },
      {
        name: "third-party mention",
        input: "Alice's twitter is @alice_codes, she told me yesterday",
        speakerName: "Bob",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["alice_codes"],
      },
      {
        name: "handle with @ prefix",
        input: "my telegram is @shaw_w",
        speakerName: "Shaw",
        expectedPlatforms: ["telegram"],
        expectedHandles: ["shaw_w"],
      },
      {
        name: "discord with discriminator",
        input: "my discord is alice#1234",
        speakerName: "Alice",
        expectedPlatforms: ["discord"],
        expectedHandles: ["alice#1234"],
      },
      {
        name: "ambiguous - just a name, no platform",
        input: "I'm Alice by the way",
        speakerName: "Alice",
        expectedPlatforms: [],
        expectedHandles: [],
      },
    ];

    for (const tc of extractionCases) {
      it(`should extract: ${tc.name}`, async () => {
        if (!llmProvider) return;

        const runner = new LiveScenarioRunner(llmProvider);
        const entityId = stringToUuid(`speaker-${tc.name}`);
        runner.setupEntity(entityId, { name: tc.speakerName, platform: "discord" });

        const start = performance.now();
        const result = await runner.extractIdentities(tc.speakerName, entityId, tc.input, "discord");
        const latencyMs = Math.round(performance.now() - start);

        const extractedPlatforms = result.identities.map((i) => i.platform.toLowerCase());
        const extractedHandles = result.identities.map((i) => i.handle.replace(/^@/, "").toLowerCase());

        // Platform alias map for flexible matching (LLMs may use different names)
        const PLATFORM_ALIASES: Record<string, string[]> = {
          email: ["email", "mail", "etc", "e-mail"],
          twitter: ["twitter", "x"],
        };

        // Check platforms (with alias tolerance)
        const platformMatch = tc.expectedPlatforms.length === 0
          ? result.identities.length === 0
          : tc.expectedPlatforms.every((p) => {
              const aliases = PLATFORM_ALIASES[p] ?? [p];
              return aliases.some((a) => extractedPlatforms.includes(a));
            });

        // Check handles (flexible: handle might have slight variations)
        const handleMatch = tc.expectedHandles.length === 0
          ? result.identities.length === 0
          : tc.expectedHandles.every((h) =>
              extractedHandles.some((eh) => eh.includes(h.toLowerCase()) || h.toLowerCase().includes(eh)),
            );

        const passed = platformMatch && handleMatch;

        tracker.record({
          name: tc.name,
          category: "extraction",
          passed,
          latencyMs,
          details: `Extracted ${result.identities.length} identities`,
          expected: tc.expectedPlatforms.length === 0
            ? "no identities"
            : `${tc.expectedPlatforms.join(",")}:${tc.expectedHandles.join(",")}`,
          actual: result.identities.length === 0
            ? "no identities"
            : result.identities.map((i) => `${i.platform}:${i.handle}`).join(","),
        });

        if (tc.expectedPlatforms.length === 0) {
          expect(result.identities.length).toBe(0);
        } else {
          expect(platformMatch).toBe(true);
          expect(handleMatch).toBe(true);
        }
      }, 30_000);
    }
  });

  // =========================================================================
  // Category 2: Action Selection Accuracy
  // =========================================================================

  describe("Action Selection", () => {
    const actionCases: Array<{
      name: string;
      input: string;
      platform: string;
      expectedAction: string;
      expectedIntent?: string;
    }> = [
      {
        name: "claim identity triggers MANAGE_IDENTITY",
        input: "my twitter is @alice_codes",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "greeting triggers NONE",
        input: "hey everyone, how's it going?",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "asking a question triggers NONE",
        input: "what's the weather like today?",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "confirm identity triggers MANAGE_IDENTITY",
        input: "confirm that alice is @alice_codes on twitter",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "confirm",
      },
      {
        name: "unlink identity triggers MANAGE_IDENTITY",
        input: "remove my twitter link",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "unlink",
      },
      {
        name: "list identities triggers MANAGE_IDENTITY",
        input: "show my linked accounts",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "list",
      },
      {
        name: "send admin message triggers SEND_MESSAGE",
        input: "send a message to the owner saying the server is down",
        platform: "discord",
        expectedAction: "SEND_MESSAGE",
      },
      {
        name: "multi-platform claim triggers MANAGE_IDENTITY",
        input: "I'm alice on twitter and alice-dev on github",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "casual mention of platform not a claim",
        input: "I was scrolling twitter today and saw something funny",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "wallet address claim triggers MANAGE_IDENTITY",
        input: "my ethereum wallet is 0x1234abcd",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
    ];

    for (const tc of actionCases) {
      it(`should select: ${tc.name}`, async () => {
        if (!llmProvider) return;

        const runner = new LiveScenarioRunner(llmProvider);
        const start = performance.now();
        const result = await runner.selectAction(tc.input, tc.platform);
        const latencyMs = Math.round(performance.now() - start);

        const actionMatch = result.action === tc.expectedAction;
        const intentMatch = !tc.expectedIntent || result.intent === tc.expectedIntent;
        const passed = actionMatch && intentMatch;

        tracker.record({
          name: tc.name,
          category: "action_selection",
          passed,
          latencyMs,
          details: `Selected ${result.action} (${result.intent}): ${result.reasoning}`,
          expected: `${tc.expectedAction}${tc.expectedIntent ? `:${tc.expectedIntent}` : ""}`,
          actual: `${result.action}${result.intent ? `:${result.intent}` : ""}`,
        });

        expect(result.action).toBe(tc.expectedAction);
        if (tc.expectedIntent) {
          expect(result.intent).toBe(tc.expectedIntent);
        }
      }, 30_000);
    }
  });

  // =========================================================================
  // Category 3: End-to-End Conversation Flows
  // =========================================================================

  describe("E2E Conversation Flows", () => {
    it("Flow 1: Owner onboarding — multi-platform identity setup", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Owner Onboarding");
      const runner = new LiveScenarioRunner(llmProvider);
      const ownerId = stringToUuid("owner-shaw");
      runner.setupOwner(ownerId, { name: "Shaw" });

      // Turn 1: Owner declares 3 platforms
      const t1 = await runner.processMessage(
        "Shaw", ownerId,
        "Hey! I'm Shaw. My discord is shawwalters, telegram is @shaw_w, and twitter is @shawmakesmagic",
        "client_chat", "OWNER",
      );

      transcript.add({
        speaker: "Shaw", platform: "client_chat",
        message: "Hey! I'm Shaw. My discord is shawwalters, telegram is @shaw_w, and twitter is @shawmakesmagic",
        extractedIdentities: t1.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: t1.actionSelection.action,
        stateChanges: t1.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}/${c.claimTier}]`),
        latencyMs: t1.totalLatencyMs,
      });

      // Verify at least 2 of 3 platforms extracted (LLM might miss one)
      const extractedPlatforms = t1.extraction.identities.map((i) => i.platform);
      const platformsFound = ["discord", "telegram", "twitter"].filter((p) => extractedPlatforms.includes(p));
      const t1Passed = platformsFound.length >= 2 && t1.actionSelection.action === "MANAGE_IDENTITY";

      tracker.record({
        name: "owner onboarding: 3 platform extraction",
        category: "e2e_flow",
        passed: t1Passed,
        latencyMs: t1.totalLatencyMs,
        details: `Extracted ${platformsFound.length}/3 platforms`,
        expected: ">=2 platforms + MANAGE_IDENTITY",
        actual: `${platformsFound.length} platforms + ${t1.actionSelection.action}`,
      });

      // Turn 2: Follow-up email
      const t2 = await runner.processMessage(
        "Shaw", ownerId,
        "also my email is shaw@example.com",
        "client_chat", "OWNER",
      );

      transcript.add({
        speaker: "Shaw", platform: "client_chat",
        message: "also my email is shaw@example.com",
        extractedIdentities: t2.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: t2.actionSelection.action,
        stateChanges: t2.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}/${c.claimTier}]`),
        latencyMs: t2.totalLatencyMs,
      });

      const emailExtracted = t2.extraction.identities.some(
        (i) => ["email", "mail", "etc", "e-mail"].includes(i.platform.toLowerCase()) && i.handle.includes("shaw@example.com"),
      );
      const t2Passed = emailExtracted;

      tracker.record({
        name: "owner onboarding: follow-up email",
        category: "e2e_flow",
        passed: t2Passed,
        latencyMs: t2.totalLatencyMs,
        details: `Email extracted: ${emailExtracted}`,
        expected: "email:shaw@example.com",
        actual: t2.extraction.identities.map((i) => `${i.platform}:${i.handle}`).join(",") || "none",
      });

      // All claims should be auto-accepted as OWNER
      const allClaims = runner.getClaims(ownerId);
      const allAccepted = allClaims.every((c) => c.status === "accepted");
      const allGroundTruth = allClaims.every((c) => c.claimTier === "ground_truth");

      tracker.record({
        name: "owner onboarding: claims auto-accepted",
        category: "e2e_flow",
        passed: allAccepted && allGroundTruth && allClaims.length >= 3,
        latencyMs: 0,
        details: `${allClaims.length} claims, all accepted: ${allAccepted}, all ground_truth: ${allGroundTruth}`,
        expected: ">=3 claims, all accepted/ground_truth",
        actual: `${allClaims.length} claims, accepted=${allAccepted}, ground_truth=${allGroundTruth}`,
      });

      expect(platformsFound.length).toBeGreaterThanOrEqual(2);
      expect(allClaims.length).toBeGreaterThanOrEqual(3);

      console.log(transcript.print());
    }, 60_000);

    it("Flow 2: Regular user claims — pending verification", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Regular User Claim");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("user-alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      const result = await runner.processMessage(
        "Alice", userId,
        "hey btw my twitter is @alice_codes",
        "discord", "NONE",
      );

      transcript.add({
        speaker: "Alice", platform: "discord",
        message: "hey btw my twitter is @alice_codes",
        extractedIdentities: result.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: result.actionSelection.action,
        stateChanges: result.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}/${c.claimTier}]`),
        latencyMs: result.totalLatencyMs,
      });

      const twitterExtracted = result.extraction.identities.some(
        (i) => i.platform === "twitter" && i.handle.replace(/^@/, "").includes("alice_codes"),
      );
      const claimIsPending = result.claimsStored.some(
        (c) => c.platform === "twitter" && c.status === "proposed",
      );

      tracker.record({
        name: "regular user: twitter claim pending",
        category: "e2e_flow",
        passed: twitterExtracted && claimIsPending,
        latencyMs: result.totalLatencyMs,
        details: `Extracted: ${twitterExtracted}, Pending: ${claimIsPending}`,
        expected: "twitter:alice_codes [proposed]",
        actual: result.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}]`).join(",") || "none",
      });

      expect(twitterExtracted).toBe(true);
      expect(claimIsPending).toBe(true);

      console.log(transcript.print());
    }, 30_000);

    it("Flow 3: Non-identity message should not create claims", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Non-Identity Chat");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("user-bob");
      runner.setupEntity(userId, { name: "Bob", platform: "discord" });

      const result = await runner.processMessage(
        "Bob", userId,
        "what do you guys think about the new react server components?",
        "discord", "NONE",
      );

      transcript.add({
        speaker: "Bob", platform: "discord",
        message: "what do you guys think about the new react server components?",
        extractedIdentities: result.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: result.actionSelection.action,
        latencyMs: result.totalLatencyMs,
      });

      const noClaims = result.claimsStored.length === 0;
      const noAction = result.actionSelection.action === "NONE";

      tracker.record({
        name: "non-identity: no claims or actions",
        category: "e2e_flow",
        passed: noClaims && noAction,
        latencyMs: result.totalLatencyMs,
        details: `Claims: ${result.claimsStored.length}, Action: ${result.actionSelection.action}`,
        expected: "0 claims, NONE action",
        actual: `${result.claimsStored.length} claims, ${result.actionSelection.action}`,
      });

      expect(noClaims).toBe(true);
      expect(noAction).toBe(true);

      console.log(transcript.print());
    }, 30_000);

    it("Flow 4: Admin claims — auto-accepted", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Admin Identity Claim");
      const runner = new LiveScenarioRunner(llmProvider);
      const adminId = stringToUuid("admin-bob");
      runner.setupEntity(adminId, { name: "Bob", platform: "discord", role: "ADMIN" });

      const result = await runner.processMessage(
        "Bob", adminId,
        "my github is bob-admin",
        "discord", "ADMIN",
      );

      transcript.add({
        speaker: "Bob (ADMIN)", platform: "discord",
        message: "my github is bob-admin",
        extractedIdentities: result.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: result.actionSelection.action,
        stateChanges: result.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}/${c.claimTier}]`),
        latencyMs: result.totalLatencyMs,
      });

      const githubExtracted = result.extraction.identities.some(
        (i) => i.platform === "github" && i.handle.replace(/^@/, "").includes("bob-admin"),
      );
      const claimIsAccepted = result.claimsStored.some(
        (c) => c.platform === "github" && c.status === "accepted" && c.claimTier === "admin_verified",
      );

      tracker.record({
        name: "admin claim: auto-accepted",
        category: "e2e_flow",
        passed: githubExtracted && claimIsAccepted,
        latencyMs: result.totalLatencyMs,
        details: `Extracted: ${githubExtracted}, Accepted: ${claimIsAccepted}`,
        expected: "github:bob-admin [accepted/admin_verified]",
        actual: result.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}/${c.claimTier}]`).join(",") || "none",
      });

      expect(githubExtracted).toBe(true);
      expect(claimIsAccepted).toBe(true);

      console.log(transcript.print());
    }, 30_000);

    it("Flow 5: Edge case — casual platform mention should not trigger claim", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Casual Platform Mention");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("user-carol");
      runner.setupEntity(userId, { name: "Carol", platform: "discord" });

      const result = await runner.processMessage(
        "Carol", userId,
        "I saw a funny meme on twitter today, the discourse is wild",
        "discord", "NONE",
      );

      transcript.add({
        speaker: "Carol", platform: "discord",
        message: "I saw a funny meme on twitter today, the discourse is wild",
        extractedIdentities: result.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: result.actionSelection.action,
        latencyMs: result.totalLatencyMs,
      });

      const noIdentities = result.extraction.identities.length === 0;
      const noClaims = result.claimsStored.length === 0;

      tracker.record({
        name: "casual mention: no extraction",
        category: "e2e_flow",
        passed: noIdentities && noClaims,
        latencyMs: result.totalLatencyMs,
        details: `Identities: ${result.extraction.identities.length}, Claims: ${result.claimsStored.length}`,
        expected: "0 identities, 0 claims",
        actual: `${result.extraction.identities.length} identities, ${result.claimsStored.length} claims`,
      });

      expect(noClaims).toBe(true);

      console.log(transcript.print());
    }, 30_000);
  });
});
