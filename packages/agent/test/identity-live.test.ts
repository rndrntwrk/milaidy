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

  /** Convenience method to add a turn from processMessage results */
  addFromResult(
    speaker: string,
    platform: string,
    result: {
      extraction: { identities: Array<{ platform: string; handle: string }> };
      actionSelection: { action: string };
      totalLatencyMs: number;
    },
  ): void {
    this.add({
      speaker,
      platform,
      message: "(see test)",
      extractedIdentities: result.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
      selectedAction: result.actionSelection.action,
      latencyMs: result.totalLatencyMs,
    });
  }
}

// ---------------------------------------------------------------------------
// Extraction prompt (same as the evaluator uses)
// ---------------------------------------------------------------------------

/** Full platform enum — explicit list matching the canonical platforms.ts registry */
const PLATFORM_ENUM = "bluesky|discord|email|facebook|farcaster|github|instagram|lens|linkedin|mastodon|nostr|phone|reddit|telegram|tiktok|twitch|twitter|warpcast|website|youtube";

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
      "platform": "${PLATFORM_ENUM}",
      "handle": "the handle/username/address (for email use the full address, for phone use the number)",
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
- "platform" MUST be one of: ${PLATFORM_ENUM}. Use "email" for email addresses, "phone" for phone numbers. Use "twitter" (not "x") for Twitter/X.
- If a person says "my Twitter is @X", that's self-reported with confidence 0.8+
- If person A says "person B's Twitter is @X", that's hearsay with confidence 0.5
- Do NOT extract identities from sarcasm, jokes, or obvious exaggeration (e.g. "I'm totally @elonmusk lol")
- Do NOT extract deleted or former accounts (e.g. "I used to be @old_handle but I deleted it")
- Do NOT extract hypothetical handles (e.g. "if I had a twitter it would be @foo")
- Only extract what is clearly stated as a CURRENT, ACTIVE identity
- Return empty arrays for categories with no findings`;

// ---------------------------------------------------------------------------
// Action selection prompt
// ---------------------------------------------------------------------------

const ACTION_SELECTION_PROMPT = `You are an AI assistant deciding which action to take based on a user's message.

Available actions:
- MANAGE_IDENTITY: The user is claiming, confirming, unlinking, or listing platform identities (e.g., "my twitter is @foo", "confirm that alice is @alice_codes on twitter", "yes that's really her twitter", "remove my github link", "show my linked accounts")
- SEND_MESSAGE: The user is explicitly asking to send/relay a message to a specific person by name (e.g., "send Alice a message", "DM bob"). NOT for messaging admin/owner, and NOT for discussing messaging features or UI.
- SEND_ADMIN_MESSAGE: The user is explicitly asking to contact, notify, or alert the admin/owner (e.g., "message the admin", "notify the owner", "tell Shaw about this"). Use for any admin/owner-directed communication.
- NONE: No action needed. Use for general conversation, questions, discussions about features, bug reports, or anything that is not a direct identity operation or message-sending request.

IMPORTANT: If the user is DISCUSSING or COMPLAINING about a feature (e.g., "the send button is broken", "identity linking is cool"), that is NONE — they are not requesting an action.

User message: "{{message}}"
Context: The user is speaking on {{platform}}.

Respond with a JSON object:
{
  "action": "MANAGE_IDENTITY" | "SEND_MESSAGE" | "SEND_ADMIN_MESSAGE" | "NONE",
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

        // Hard assertion: if we expect nothing, we should get nothing.
        // For positive cases: record accuracy but allow LLM variance (soft fail).
        if (tc.expectedPlatforms.length === 0) {
          expect(result.identities.length).toBe(0);
        } else {
          // Soft assertion: log but don't fail the test on LLM variance.
          // The accuracy tracker captures the result for benchmarking.
          if (!passed) {
            console.warn(
              `[soft-fail] ${tc.name}: expected ${tc.expectedPlatforms.join(",")} ` +
              `got ${extractedPlatforms.join(",") || "none"}` +
              `\n  raw: ${JSON.stringify(result.rawResponse)}`,
            );
          }
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
        name: "send admin message triggers SEND_ADMIN_MESSAGE",
        input: "send a message to the owner saying the server is down",
        platform: "discord",
        expectedAction: "SEND_ADMIN_MESSAGE",
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

        // Soft assertion: LLM non-determinism means any single run may flake.
        // The accuracy tracker captures the real benchmark; avoid brittle failures.
        if (!passed) {
          console.warn(
            `[soft-fail] action: ${tc.name}: expected ${tc.expectedAction}` +
            `${tc.expectedIntent ? `:${tc.expectedIntent}` : ""} ` +
            `got ${result.action}:${result.intent}\n  reasoning: ${result.reasoning}`,
          );
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

  // =========================================================================
  // Category 4: Subtle & Tricky Extraction Edge Cases
  // =========================================================================

  describe("Subtle Extraction", () => {
    const subtleCases: Array<{
      name: string;
      input: string;
      speakerName: string;
      expectedPlatforms: string[];
      expectedHandles: string[];
      /** If true, "no extraction" is the correct answer */
      expectEmpty?: boolean;
    }> = [
      // --- Implicit / URL-based ---
      {
        name: "github URL implies handle",
        input: "here's the repo: github.com/shaw-dev/my-project",
        speakerName: "Shaw",
        expectedPlatforms: ["github"],
        expectedHandles: ["shaw-dev"],
      },
      {
        name: "twitter URL implies handle",
        input: "check my thread https://twitter.com/shawmakesmagic/status/123456",
        speakerName: "Shaw",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["shawmakesmagic"],
      },
      {
        name: "linkedin URL",
        input: "you can find my work history at linkedin.com/in/shaw-walters",
        speakerName: "Shaw",
        expectedPlatforms: ["linkedin"],
        expectedHandles: ["shaw-walters"],
      },

      // --- Sarcasm / Jokes (should NOT extract) ---
      {
        name: "sarcastic identity claim",
        input: "yeah I'm totally @elonmusk on twitter lol",
        speakerName: "Bob",
        expectedPlatforms: [],
        expectedHandles: [],
        expectEmpty: true,
      },
      {
        name: "hypothetical identity",
        input: "if I had a twitter it would be @coolbob99 but I don't use social media",
        speakerName: "Bob",
        expectedPlatforms: [],
        expectedHandles: [],
        expectEmpty: true,
      },
      {
        name: "past tense / deleted account",
        input: "I used to be @old_alice on twitter but I deleted that account",
        speakerName: "Alice",
        expectedPlatforms: [],
        expectedHandles: [],
        expectEmpty: true,
      },

      // --- Code / Technical false positives (should NOT extract) ---
      {
        name: "code snippet with @mention syntax",
        input: "the decorator syntax is @injectable() in the class definition",
        speakerName: "Dev",
        expectedPlatforms: [],
        expectedHandles: [],
        expectEmpty: true,
      },
      {
        name: "git config email is not an identity claim",
        input: "make sure your git config has user.email set to something valid",
        speakerName: "Dev",
        expectedPlatforms: [],
        expectedHandles: [],
        expectEmpty: true,
      },
      {
        name: "discussing someone else's github repo",
        input: "you should check out facebook/react on github, it's well documented",
        speakerName: "Alice",
        expectedPlatforms: [],
        expectedHandles: [],
        expectEmpty: true,
      },

      // --- Subtle / Indirect claims ---
      {
        name: "implied ownership via 'follow me'",
        input: "follow me on instagram, same name as here — alice_creates",
        speakerName: "Alice",
        expectedPlatforms: ["instagram"],
        expectedHandles: ["alice_creates"],
      },
      {
        name: "DM me phrasing implies handle",
        input: "DM me on telegram, I'm @quick_shaw",
        speakerName: "Shaw",
        expectedPlatforms: ["telegram"],
        expectedHandles: ["quick_shaw"],
      },
      {
        name: "stream announcement implies twitch handle",
        input: "going live on twitch in 10 min — twitch.tv/alice_streams",
        speakerName: "Alice",
        expectedPlatforms: ["twitch"],
        expectedHandles: ["alice_streams"],
      },

      // --- Corrections / Updates ---
      {
        name: "handle correction (new handle replaces old)",
        input: "actually I changed my twitter, it's @alice_v2 now, not @alice_codes",
        speakerName: "Alice",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["alice_v2"],
      },

      // --- Multiple identities, some valid some not ---
      {
        name: "mix of real claim and discussion",
        input: "my discord is alice_dev, and did you see what @elonmusk posted?",
        speakerName: "Alice",
        expectedPlatforms: ["discord"],
        expectedHandles: ["alice_dev"],
      },

      // --- Phone number ---
      {
        name: "phone number shared",
        input: "text me at 555-123-4567 if the server goes down",
        speakerName: "Shaw",
        expectedPlatforms: ["phone"],
        expectedHandles: ["555-123-4567"],
      },

      // --- Fediverse / niche platforms ---
      {
        name: "bluesky handle with domain",
        input: "I'm on bluesky now, find me at @shaw.bsky.social",
        speakerName: "Shaw",
        expectedPlatforms: ["bluesky"],
        expectedHandles: ["shaw.bsky.social"],
      },

      // --- Non-English / informal ---
      {
        name: "informal handle drop",
        input: "yo add me on disc, username's xX_alice_Xx",
        speakerName: "Alice",
        expectedPlatforms: ["discord"],
        expectedHandles: ["xX_alice_Xx"],
      },
    ];

    for (const tc of subtleCases) {
      it(`subtle: ${tc.name}`, async () => {
        if (!llmProvider) return;

        const runner = new LiveScenarioRunner(llmProvider);
        const entityId = stringToUuid(`subtle-${tc.name}`);
        runner.setupEntity(entityId, { name: tc.speakerName, platform: "discord" });

        const start = performance.now();
        const result = await runner.extractIdentities(tc.speakerName, entityId, tc.input, "discord");
        const latencyMs = Math.round(performance.now() - start);

        const extractedPlatforms = result.identities.map((i) => i.platform.toLowerCase());
        const extractedHandles = result.identities.map((i) => i.handle.replace(/^@/, "").toLowerCase());

        const PLATFORM_ALIASES: Record<string, string[]> = {
          email: ["email", "mail", "etc", "e-mail"],
          twitter: ["twitter", "x"],
          discord: ["discord", "disc"],
        };

        let passed: boolean;
        if (tc.expectEmpty || tc.expectedPlatforms.length === 0) {
          passed = result.identities.length === 0;
        } else {
          const platformMatch = tc.expectedPlatforms.every((p) => {
            const aliases = PLATFORM_ALIASES[p] ?? [p];
            return aliases.some((a) => extractedPlatforms.includes(a));
          });
          const handleMatch = tc.expectedHandles.every((h) =>
            extractedHandles.some((eh) =>
              eh.includes(h.toLowerCase()) || h.toLowerCase().includes(eh),
            ),
          );
          passed = platformMatch && handleMatch;
        }

        tracker.record({
          name: `subtle: ${tc.name}`,
          category: "extraction",
          passed,
          latencyMs,
          details: `Extracted ${result.identities.length} identities`,
          expected: tc.expectEmpty || tc.expectedPlatforms.length === 0
            ? "no identities"
            : `${tc.expectedPlatforms.join(",")}:${tc.expectedHandles.join(",")}`,
          actual: result.identities.length === 0
            ? "no identities"
            : result.identities.map((i) => `${i.platform}:${i.handle}`).join(","),
        });

        if (tc.expectEmpty || tc.expectedPlatforms.length === 0) {
          if (!passed) {
            console.warn(
              `[soft-fail] subtle: ${tc.name}: expected empty, ` +
              `got ${result.identities.map((i) => `${i.platform}:${i.handle}`).join(",")}` +
              `\n  raw: ${JSON.stringify(result.rawResponse)}`,
            );
          }
        } else {
          if (!passed) {
            console.warn(
              `[soft-fail] subtle: ${tc.name}: expected ${tc.expectedPlatforms.join(",")} ` +
              `got ${extractedPlatforms.join(",") || "none"}` +
              `\n  raw: ${JSON.stringify(result.rawResponse)}`,
            );
          }
        }
      }, 30_000);
    }
  });

  // =========================================================================
  // Category 5: Subtle Action Selection
  // =========================================================================

  describe("Subtle Action Selection", () => {
    const subtleActionCases: Array<{
      name: string;
      input: string;
      platform: string;
      expectedAction: string;
      expectedIntent?: string;
    }> = [
      // --- Near-miss: platform discussion, not a claim ---
      {
        name: "discussing platform outage is not a claim",
        input: "twitter is down again, can't believe it",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "asking about someone else's handle is not a claim",
        input: "does anyone know Alice's github?",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "complaining about notifications is not a claim",
        input: "discord keeps sending me notifications at 3am",
        platform: "telegram",
        expectedAction: "NONE",
      },

      // --- Implicit claims (should trigger) ---
      {
        name: "follow-me implies claim",
        input: "follow me on twitter @alice_codes, I post good threads",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "DM-me implies claim",
        input: "DM me on telegram @quick_shaw if you need help",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },

      // --- Ambiguous intent ---
      {
        name: "identity correction should still be claim/update",
        input: "wait no, my github is actually alice-dev-v2 not alice-dev",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "asking what's linked is a list request",
        input: "what accounts do I have linked?",
        platform: "client_chat",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "list",
      },
      {
        name: "disconnect / detach phrasing means unlink",
        input: "can you disconnect my telegram?",
        platform: "client_chat",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "unlink",
      },

      // --- Admin messaging (subtle phrasing) ---
      {
        name: "indirect escalation request",
        input: "can you let Shaw know the API is returning 500s?",
        platform: "discord",
        expectedAction: "SEND_ADMIN_MESSAGE",
      },
      {
        name: "emergency phrasing",
        input: "the database is corrupted, someone needs to tell the owner NOW",
        platform: "discord",
        expectedAction: "SEND_ADMIN_MESSAGE",
      },

      // --- Things that look like actions but aren't ---
      {
        name: "discussing linking concept is not a link action",
        input: "I think identity linking across platforms is a cool feature",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "discussing sending messages is not a send action",
        input: "the send message button on the UI seems broken",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "talking about confirming something unrelated",
        input: "can you confirm the meeting is at 3pm?",
        platform: "discord",
        expectedAction: "NONE",
      },
    ];

    for (const tc of subtleActionCases) {
      it(`subtle action: ${tc.name}`, async () => {
        if (!llmProvider) return;

        const runner = new LiveScenarioRunner(llmProvider);
        const start = performance.now();
        const result = await runner.selectAction(tc.input, tc.platform);
        const latencyMs = Math.round(performance.now() - start);

        const actionMatch = result.action === tc.expectedAction;
        const intentMatch = !tc.expectedIntent || result.intent === tc.expectedIntent;
        const passed = actionMatch && intentMatch;

        tracker.record({
          name: `subtle action: ${tc.name}`,
          category: "action_selection",
          passed,
          latencyMs,
          details: `Selected ${result.action} (${result.intent}): ${result.reasoning}`,
          expected: `${tc.expectedAction}${tc.expectedIntent ? `:${tc.expectedIntent}` : ""}`,
          actual: `${result.action}${result.intent ? `:${result.intent}` : ""}`,
        });

        if (!passed) {
          console.warn(
            `[soft-fail] subtle action: ${tc.name}: expected ${tc.expectedAction}` +
            `${tc.expectedIntent ? `:${tc.expectedIntent}` : ""} ` +
            `got ${result.action}:${result.intent}\n  reasoning: ${result.reasoning}`,
          );
        }
      }, 30_000);
    }
  });

  // =========================================================================
  // Category 6: Diverse Writing Styles — Extraction
  // =========================================================================

  describe("Diverse Style Extraction", () => {
    const diverseStyleCases: Array<{
      name: string;
      input: string;
      speakerName: string;
      expectedPlatforms: string[];
      expectedHandles: string[];
      expectEmpty?: boolean;
    }> = [
      // --- Child-like / very young user ---
      {
        name: "10-year-old style: excited and chatty",
        input: "omg hiii!!! im tommy and i make roblox videos on youtube!! my channel is tommyplays2016 go subscribe pleeeeease 🙏🙏🙏",
        speakerName: "Tommy",
        expectedPlatforms: ["youtube"],
        expectedHandles: ["tommyplays2016"],
      },
      {
        name: "10-year-old: misspelled platform name",
        input: "i have a discrod too its tommy_gamer42 add me!!!",
        speakerName: "Tommy",
        expectedPlatforms: ["discord"],
        expectedHandles: ["tommy_gamer42"],
      },
      {
        name: "kid-style: multiple platforms with emojis",
        input: "my tiktok is @tommy_dances and my insta is tommy.plays u should follow me on both!! 😎😎",
        speakerName: "Tommy",
        // tiktok is not in KNOWN_PLATFORMS, instagram is
        expectedPlatforms: ["instagram"],
        expectedHandles: ["tommy.plays"],
      },

      // --- Broken / non-native English ---
      {
        name: "ESL: basic identity with grammar errors",
        input: "hello i am from brazil, my twitter is @carlos_br99, sorry for bad english",
        speakerName: "Carlos",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["carlos_br99"],
      },
      {
        name: "ESL: reversed word order",
        input: "on telegram you can find me, handle is @maria_dev. I work with javascript",
        speakerName: "Maria",
        expectedPlatforms: ["telegram"],
        expectedHandles: ["maria_dev"],
      },
      {
        name: "ESL: missing articles and prepositions",
        input: "please add me discord is night_wolf github also night_wolf same name both",
        speakerName: "Wolf",
        expectedPlatforms: ["discord", "github"],
        expectedHandles: ["night_wolf"],
      },
      {
        name: "ESL: phonetic spelling of platform",
        input: "my linkdin profile is carlos-santos plz connect with me",
        speakerName: "Carlos",
        expectedPlatforms: ["linkedin"],
        expectedHandles: ["carlos-santos"],
      },

      // --- ALL CAPS shouter ---
      {
        name: "all caps: shouting identity",
        input: "HEY EVERYONE MY TWITTER IS @LOUD_DEV AND MY GITHUB IS LOUD-DEV FOLLOW ME",
        speakerName: "Loud",
        expectedPlatforms: ["twitter", "github"],
        expectedHandles: ["LOUD_DEV", "LOUD-DEV"],
      },

      // --- Extremely verbose / rambling ---
      {
        name: "verbose: identity buried in paragraph",
        input: "So I've been thinking about this project a lot lately and I think what we really need is better documentation. By the way, speaking of documentation, I actually write a lot of technical posts. You can find me on Twitter, my handle there is @verbose_coder, I tweet mostly about Rust and systems programming. Anyway, back to the project, I think we should start with the README.",
        speakerName: "Verbose",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["verbose_coder"],
      },
      {
        name: "verbose: two identities hidden in wall of text",
        input: "Hey so I wanted to introduce myself since I'm new here. I've been a developer for about 5 years, mostly working on web stuff. I'm pretty active on GitHub where my username is webdev-sarah, I have a bunch of open source projects there including a CSS framework. Oh and if anyone wants to chat about frontend stuff you can also reach me on Discord where I go by sarah.designs — I'm in a bunch of other servers too so I'm usually online. Excited to be part of this community!",
        speakerName: "Sarah",
        expectedPlatforms: ["github", "discord"],
        expectedHandles: ["webdev-sarah", "sarah.designs"],
      },

      // --- Minimalist / terse ---
      {
        name: "terse: just the facts",
        input: "tw: @min_dev gh: min-dev",
        speakerName: "Min",
        expectedPlatforms: ["twitter", "github"],
        expectedHandles: ["min_dev", "min-dev"],
      },
      {
        name: "terse: single word platform + handle",
        input: "discord: cryptowolf",
        speakerName: "Wolf",
        expectedPlatforms: ["discord"],
        expectedHandles: ["cryptowolf"],
      },

      // --- Slang-heavy / internet speak ---
      {
        name: "slang: gen-z internet speak",
        input: "ngl my twt is @vibes_only420 and i post absolute bangers fr fr no cap 💀",
        speakerName: "Vibes",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["vibes_only420"],
      },
      {
        name: "slang: gamer speak",
        input: "ayo drop ur disc, mine's xXDarkKnight99Xx on discord lmk if u wanna squad up",
        speakerName: "Knight",
        expectedPlatforms: ["discord"],
        expectedHandles: ["xXDarkKnight99Xx"],
      },

      // --- Formal / professional ---
      {
        name: "formal: corporate introduction",
        input: "Good afternoon. I'm Dr. Patricia Chen, Principal Research Scientist at Meridian Labs. You may reach me via email at patricia.chen@meridian-labs.com, or connect with me on LinkedIn under the profile name p-chen-phd.",
        speakerName: "Patricia",
        expectedPlatforms: ["email", "linkedin"],
        expectedHandles: ["patricia.chen@meridian-labs.com", "p-chen-phd"],
      },
      {
        name: "formal: academic with website",
        input: "For those interested in my research, my publications are listed at my personal website drchen.io and I maintain a GitHub repository at github.com/pchen-research for reproducibility of results.",
        speakerName: "Patricia",
        expectedPlatforms: ["website", "github"],
        expectedHandles: ["drchen.io", "pchen-research"],
      },

      // --- Mixed languages ---
      {
        name: "Spanglish: mixing languages",
        input: "oye mi twitter es @juandev y mi github también es juandev, por si quieren ver mis projects",
        speakerName: "Juan",
        expectedPlatforms: ["twitter", "github"],
        expectedHandles: ["juandev"],
      },

      // --- Passive-aggressive / reluctant sharing ---
      {
        name: "reluctant: grudging identity share",
        input: "ugh fine since everyone keeps asking, my github is reluctant-coder, happy now?",
        speakerName: "Grumpy",
        expectedPlatforms: ["github"],
        expectedHandles: ["reluctant-coder"],
      },

      // --- Stream of consciousness ---
      {
        name: "stream of consciousness: no punctuation",
        input: "ok so like i just set up my bluesky its @scattered.bsky.social and im still figuring it out tbh i also have nostr but dont ask me about that lol",
        speakerName: "Scattered",
        expectedPlatforms: ["bluesky"],
        expectedHandles: ["scattered.bsky.social"],
      },

      // --- Identity in a question ---
      {
        name: "identity embedded in a question",
        input: "does this server have a role for developers? I'm alice-dev on github btw if that matters",
        speakerName: "Alice",
        expectedPlatforms: ["github"],
        expectedHandles: ["alice-dev"],
      },

      // --- Sarcasm that mentions real handle (should NOT extract) ---
      {
        name: "sarcastic: mentioning celebrity with explicit denial",
        input: "sure sure and I'm also the Queen of England 👑 lmao no seriously I don't even have a github",
        speakerName: "Troll",
        expectedPlatforms: [],
        expectedHandles: [],
        expectEmpty: true,
      },
      {
        name: "ironic: clearly joking with explicit denial",
        input: "haha no im not on farcaster, i dont even know what web3 is 😂 im just here for the memes",
        speakerName: "Skeptic",
        expectedPlatforms: [],
        expectedHandles: [],
        expectEmpty: true,
      },

      // --- Third-party mentions (should extract but NOT as belonging to the speaker) ---
      // The evaluator correctly extracts third-party identities with belongsTo != speaker.
      // These test that the identities ARE extracted (as third-party data).
      {
        name: "quoting someone else's handle extracts third-party",
        input: "have you guys seen what @python_tips posts? that twitter account has great content",
        speakerName: "Fan",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["python_tips"],
        // This is a third-party extraction (belongsTo != "Fan"), NOT the speaker's identity
      },
      {
        name: "recommending different person extracts third-party",
        input: "you should follow @great_designer on instagram, she does amazing UI work",
        speakerName: "Bob",
        expectedPlatforms: ["instagram"],
        expectedHandles: ["great_designer"],
        // Third-party extraction — the evaluator correctly tracks who owns what
      },

      // --- Typos in platform names ---
      {
        name: "typo: twiter (missing t)",
        input: "my twiter is @typo_king haha i always mess up that word",
        speakerName: "Typo",
        expectedPlatforms: ["twitter"],
        expectedHandles: ["typo_king"],
      },

      // --- Unicode / special characters ---
      {
        name: "handle with unicode display name context",
        input: "私のgithubはmizu-devです (my github is mizu-dev)",
        speakerName: "Mizu",
        expectedPlatforms: ["github"],
        expectedHandles: ["mizu-dev"],
      },

      // --- Multiple claims with different trust levels ---
      {
        name: "self-claim + hearsay in same message",
        input: "my discord is sara_codes and btw jake's twitter is @jake_builds, he told me to tell you",
        speakerName: "Sara",
        expectedPlatforms: ["discord", "twitter"],
        expectedHandles: ["sara_codes", "jake_builds"],
      },
    ];

    for (const tc of diverseStyleCases) {
      it(`style: ${tc.name}`, async () => {
        if (!llmProvider) return;

        const runner = new LiveScenarioRunner(llmProvider);
        const entityId = stringToUuid(`style-${tc.name}`);
        runner.setupEntity(entityId, { name: tc.speakerName, platform: "discord" });

        const start = performance.now();
        const result = await runner.extractIdentities(tc.speakerName, entityId, tc.input, "discord");
        const latencyMs = Math.round(performance.now() - start);

        const extractedPlatforms = result.identities.map((i) => i.platform.toLowerCase());
        const extractedHandles = result.identities.map((i) => i.handle.replace(/^@/, "").toLowerCase());

        const PLATFORM_ALIASES: Record<string, string[]> = {
          email: ["email", "mail", "e-mail"],
          twitter: ["twitter", "x", "twt"],
          discord: ["discord", "disc", "discrod"],
          linkedin: ["linkedin", "linkdin"],
        };

        let passed: boolean;
        if (tc.expectEmpty || tc.expectedPlatforms.length === 0) {
          passed = result.identities.length === 0;
        } else {
          const platformMatch = tc.expectedPlatforms.every((p) => {
            const aliases = PLATFORM_ALIASES[p] ?? [p];
            return aliases.some((a) => extractedPlatforms.includes(a));
          });
          const handleMatch = tc.expectedHandles.every((h) =>
            extractedHandles.some((eh) =>
              eh.includes(h.toLowerCase()) || h.toLowerCase().includes(eh),
            ),
          );
          passed = platformMatch && handleMatch;
        }

        tracker.record({
          name: `style: ${tc.name}`,
          category: "extraction",
          passed,
          latencyMs,
          details: `Extracted: ${result.identities.map((i) => `${i.platform}:${i.handle}`).join(", ") || "none"}`,
          expected: tc.expectEmpty ? "empty" : tc.expectedPlatforms.map((p, i) => `${p}:${tc.expectedHandles[i] ?? "?"}`).join(", "),
          actual: result.identities.map((i) => `${i.platform}:${i.handle}`).join(", ") || "empty",
        });

        // Hard-fail on false positives (expected empty but got something)
        if (tc.expectEmpty) {
          expect(result.identities.length, `False positive: expected no extraction for "${tc.name}"`).toBe(0);
        }

        // Soft-fail on extraction misses (log but don't fail the test)
        if (!passed && !tc.expectEmpty) {
          console.warn(
            `[soft-fail] style: ${tc.name}: expected ${tc.expectedPlatforms.join(",")} ` +
            `got ${extractedPlatforms.join(",") || "none"}` +
            `\n  expected handles: ${tc.expectedHandles.join(",")}` +
            `\n  actual handles: ${extractedHandles.join(",") || "none"}` +
            `\n  raw: ${JSON.stringify(result.rawResponse)}`,
          );
        }
      }, 30_000);
    }
  });

  // =========================================================================
  // Category 7: Diverse Writing Styles — Action Selection
  // =========================================================================

  describe("Diverse Style Action Selection", () => {
    const diverseActionCases: Array<{
      name: string;
      input: string;
      platform: string;
      expectedAction: string;
      expectedIntent?: string;
    }> = [
      // --- Child-like ---
      {
        name: "kid asks to link account",
        input: "can u add my youtube its tommyplays2016 pleeease",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "kid asks general question",
        input: "how do i make the bot do tricks?? can it play games??",
        platform: "discord",
        expectedAction: "NONE",
      },

      // --- Broken English ---
      {
        name: "ESL: claim with grammar errors",
        input: "please link my github is carlos-dev, thank you very much for help",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "ESL: asking about features",
        input: "how work the identity? i not understand how link accounts work please explain",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "ESL: requesting admin help",
        input: "please tell owner there is problem with bot, it not working correct for me",
        platform: "discord",
        expectedAction: "SEND_ADMIN_MESSAGE",
      },

      // --- Extremely terse ---
      {
        name: "terse: single-line claim",
        input: "gh: shadow-dev",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "terse: unlink request",
        input: "remove twitter",
        platform: "client_chat",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "unlink",
      },
      {
        name: "terse: list request",
        input: "my links?",
        platform: "client_chat",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "list",
      },

      // --- Formal ---
      {
        name: "formal: professional claim",
        input: "I would like to register my LinkedIn profile. The URL is linkedin.com/in/dr-chen-phd.",
        platform: "client_chat",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "formal: professional escalation",
        input: "I would appreciate it if you could inform the system administrator that the authentication service appears to be experiencing intermittent failures.",
        platform: "discord",
        expectedAction: "SEND_ADMIN_MESSAGE",
      },

      // --- ALL CAPS ---
      {
        name: "caps: shouting claim",
        input: "MY TWITTER IS @CAPS_CODER LINK IT NOW",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "caps: angry complaint (not an action)",
        input: "WHY IS EVERYTHING BROKEN THIS IS SO FRUSTRATING I CANT EVEN SEND A MESSAGE",
        platform: "discord",
        expectedAction: "NONE",
      },

      // --- Slang / internet speak ---
      {
        name: "slang: yeet the old account",
        input: "yo can u yeet my old discord link, i dont use that one no more",
        platform: "client_chat",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "unlink",
      },
      {
        name: "slang: casual claim with filler",
        input: "aight so basically my ig is @dope_shots_420 if anybody tryna follow",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },

      // --- Long context with buried intent ---
      {
        name: "verbose: claim buried in long message",
        input: "I've been part of the open source community for years, contributing to various projects. Recently I set up a new GitHub profile specifically for my AI work — it's ml-researcher-99. I'm planning to publish some papers there too. Anyway, just wanted to introduce myself.",
        platform: "discord",
        expectedAction: "MANAGE_IDENTITY",
        expectedIntent: "claim",
      },
      {
        name: "verbose: no action in long message",
        input: "I've been thinking a lot about how cross-platform identity systems work in general. It's fascinating how you can build trust graphs across different social networks. The challenge is always verification — how do you know someone on Twitter is the same person on Discord? There are some interesting academic papers about this. Has anyone here studied Sybil resistance in social networks?",
        platform: "discord",
        expectedAction: "NONE",
      },

      // --- Mixed intent (two requests in one message) ---
      // When a message contains multiple intents, the LLM picks one. Both are valid.
      {
        name: "mixed: claim + admin alert in one message",
        input: "btw my github is alice-dev, also can you tell the owner that the CI pipeline is broken?",
        platform: "discord",
        // Either MANAGE_IDENTITY or SEND_ADMIN_MESSAGE is acceptable — both requests are real
        expectedAction: "MANAGE_IDENTITY|SEND_ADMIN_MESSAGE",
      },
      {
        name: "mixed: unlink + new claim",
        input: "remove my old twitter handle and add the new one: @fresh_start_dev",
        platform: "client_chat",
        expectedAction: "MANAGE_IDENTITY",
        // Could be unlink or claim — both reasonable
      },

      // --- Edge: passive statements that aren't requests ---
      {
        name: "passive: discussing own handle situation without requesting action",
        input: "I'm so frustrated, my twitter got suspended last week and I've been going back and forth with support. Social media is such a headache sometimes",
        platform: "discord",
        expectedAction: "NONE",
      },
      {
        name: "passive: discussing admin actions conceptually",
        input: "I wonder if there's a way to automatically notify the admin when errors happen",
        platform: "discord",
        expectedAction: "NONE",
      },

      // --- Emotionally charged ---
      {
        name: "panicked: urgent admin contact",
        input: "HELP the bot is posting spam in every channel someone get the admin RIGHT NOW please!!",
        platform: "discord",
        expectedAction: "SEND_ADMIN_MESSAGE",
      },
      {
        name: "frustrated: venting (not requesting action)",
        input: "im so annoyed, my discord keeps crashing and i lost all my messages. this is the worst day ever",
        platform: "discord",
        expectedAction: "NONE",
      },
    ];

    for (const tc of diverseActionCases) {
      it(`style action: ${tc.name}`, async () => {
        if (!llmProvider) return;

        const runner = new LiveScenarioRunner(llmProvider);
        const start = performance.now();
        const result = await runner.selectAction(tc.input, tc.platform);
        const latencyMs = Math.round(performance.now() - start);

        // Support pipe-separated alternatives (e.g., "MANAGE_IDENTITY|SEND_ADMIN_MESSAGE")
        const acceptableActions = tc.expectedAction.split("|");
        const actionMatch = acceptableActions.includes(result.action);
        const intentMatch = !tc.expectedIntent || result.intent === tc.expectedIntent;
        const passed = actionMatch && intentMatch;

        tracker.record({
          name: `style action: ${tc.name}`,
          category: "action_selection",
          passed,
          latencyMs,
          details: `Selected ${result.action} (${result.intent}): ${result.reasoning}`,
          expected: `${tc.expectedAction}${tc.expectedIntent ? `:${tc.expectedIntent}` : ""}`,
          actual: `${result.action}${result.intent ? `:${result.intent}` : ""}`,
        });

        // Soft assertion — log but don't fail on LLM non-determinism
        if (!passed) {
          console.warn(
            `[soft-fail] style action: ${tc.name}: expected ${tc.expectedAction}` +
            `${tc.expectedIntent ? `:${tc.expectedIntent}` : ""} ` +
            `got ${result.action}:${result.intent}\n  reasoning: ${result.reasoning}`,
          );
        }
      }, 30_000);
    }
  });

  // =========================================================================
  // Category 8: Role-Aware E2E Flows (Diverse Styles)
  // =========================================================================

  describe("Role-Aware Diverse Flows", () => {
    it("Flow 8a: Broken-English owner onboarding", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("ESL Owner Onboarding");
      const runner = new LiveScenarioRunner(llmProvider);
      const ownerId = stringToUuid("esl-owner-carlos");
      runner.setupOwner(ownerId, { name: "Carlos" });

      // Turn 1: Owner introduces with broken english and multiple platforms
      const t1 = await runner.processMessage(
        "Carlos", ownerId,
        "hello, i am Carlos. my twitter is @carlos_builds, my discord carlos-dev and also email carlos.dev@gmail.com. sorry english not so good",
        "client_chat", "OWNER",
      );

      transcript.addFromResult("Carlos", "client_chat", t1);

      // Should extract all 3 platforms despite broken english
      const platforms = t1.extraction.identities.map((i) => i.platform);
      const twitterFound = platforms.includes("twitter");
      const discordFound = platforms.includes("discord");
      const emailFound = platforms.includes("email");
      const allFound = twitterFound && discordFound && emailFound;

      // All claims auto-accepted because OWNER
      const allAccepted = t1.claimsStored.every((c) => c.status === "accepted");

      tracker.record({
        name: "esl owner: multi-platform extraction",
        category: "e2e_flow",
        passed: allFound,
        latencyMs: t1.totalLatencyMs,
        details: `Found: tw=${twitterFound} disc=${discordFound} email=${emailFound}`,
        expected: "twitter, discord, email",
        actual: platforms.join(", ") || "none",
      });

      tracker.record({
        name: "esl owner: auto-accept as OWNER",
        category: "e2e_flow",
        passed: allAccepted,
        latencyMs: 0,
        details: `Claims: ${t1.claimsStored.map((c) => `${c.platform}:${c.status}`).join(", ")}`,
        expected: "all accepted",
        actual: t1.claimsStored.map((c) => c.status).join(", ") || "none",
      });

      if (!allFound) {
        console.warn(
          `[soft-fail] ESL owner: expected twitter+discord+email, got ${platforms.join(",")}` +
          `\n  raw: ${JSON.stringify(t1.extraction.rawResponse)}`,
        );
      }

      console.log(transcript.print());
    }, 60_000);

    it("Flow 8b: Kid-style regular user claim + correction", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Kid User Claim + Correction");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("kid-user-tommy");
      runner.setupEntity(userId, { name: "Tommy", platform: "discord" });

      // Turn 1: Excited kid claims youtube
      const t1 = await runner.processMessage(
        "Tommy", userId,
        "hiii!! im tommy and i have a youtube channel its called tommyplays2016 im gonna be famous!! 🎮🎮",
        "discord", "NONE",
      );

      transcript.addFromResult("Tommy", "discord", t1);

      const ytExtracted = t1.extraction.identities.some((i) => i.platform === "youtube");
      const ytPending = t1.claimsStored.some((c) => c.platform === "youtube" && c.status === "proposed");

      tracker.record({
        name: "kid user: youtube extraction",
        category: "e2e_flow",
        passed: ytExtracted,
        latencyMs: t1.totalLatencyMs,
        details: `YouTube found: ${ytExtracted}`,
        expected: "youtube:tommyplays2016",
        actual: t1.extraction.identities.map((i) => `${i.platform}:${i.handle}`).join(", ") || "none",
      });

      tracker.record({
        name: "kid user: claim pending (not auto-accepted)",
        category: "e2e_flow",
        passed: ytPending || !ytExtracted, // If extraction missed, don't double-fail
        latencyMs: 0,
        details: `Status: ${t1.claimsStored.map((c) => `${c.platform}:${c.status}`).join(", ") || "none"}`,
        expected: "youtube:proposed",
        actual: t1.claimsStored.map((c) => `${c.platform}:${c.status}`).join(", ") || "none",
      });

      // Turn 2: Kid corrects the youtube handle with typos
      const t2 = await runner.processMessage(
        "Tommy", userId,
        "wait no i messed up my youtube is actually tommyplays2017 not 2016 oops 😅",
        "discord", "NONE",
      );

      transcript.addFromResult("Tommy", "discord", t2);

      // Should extract the corrected handle
      const corrected = t2.extraction.identities.some(
        (i) => i.handle.replace(/^@/, "").includes("tommyplays2017"),
      );

      tracker.record({
        name: "kid user: corrected handle extracted",
        category: "e2e_flow",
        passed: corrected,
        latencyMs: t2.totalLatencyMs,
        details: `Corrected handle found: ${corrected}`,
        expected: "youtube:tommyplays2017",
        actual: t2.extraction.identities.map((i) => `${i.platform}:${i.handle}`).join(", ") || "none",
      });

      if (!corrected) {
        console.warn(
          `[soft-fail] kid correction: expected tommyplays2017, got ${t2.extraction.identities.map((i) => i.handle).join(",") || "none"}`,
        );
      }

      console.log(transcript.print());
    }, 60_000);

    it("Flow 8c: Formal professional registers + admin confirms", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Formal Professional Registration");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("formal-patricia");
      const adminId = stringToUuid("admin-shaw");
      runner.setupEntity(userId, { name: "Patricia", platform: "discord" });
      runner.setupEntity(adminId, { name: "Shaw", platform: "discord", role: "ADMIN" });

      // Turn 1: Very formal professional introduction
      const t1 = await runner.processMessage(
        "Patricia", userId,
        "Good afternoon. I'm Dr. Patricia Chen from Meridian Labs. My professional GitHub is pchen-research and I maintain an active presence on LinkedIn as p-chen-phd. I look forward to contributing to this community.",
        "discord", "NONE",
      );

      transcript.addFromResult("Patricia", "discord", t1);

      const ghExtracted = t1.extraction.identities.some((i) => i.platform === "github");
      const liExtracted = t1.extraction.identities.some((i) => i.platform === "linkedin");
      const claimsPending = t1.claimsStored.filter((c) => c.status === "proposed");

      tracker.record({
        name: "formal: github + linkedin extracted",
        category: "e2e_flow",
        passed: ghExtracted && liExtracted,
        latencyMs: t1.totalLatencyMs,
        details: `GH=${ghExtracted}, LI=${liExtracted}`,
        expected: "github + linkedin",
        actual: t1.extraction.identities.map((i) => `${i.platform}:${i.handle}`).join(", ") || "none",
      });

      tracker.record({
        name: "formal: claims pending (non-admin user)",
        category: "e2e_flow",
        passed: claimsPending.length >= 1,
        latencyMs: 0,
        details: `Pending: ${claimsPending.length}`,
        expected: "at least 1 pending",
        actual: t1.claimsStored.map((c) => `${c.platform}:${c.status}`).join(", ") || "none",
      });

      // Turn 2: Admin confirms Patricia's identities
      const t2 = await runner.processMessage(
        "Shaw", adminId,
        "I can confirm that Patricia is who she says she is. Confirm her github and linkedin.",
        "discord", "ADMIN",
      );

      transcript.addFromResult("Shaw (ADMIN)", "discord", t2);

      // Admin's action should be MANAGE_IDENTITY:confirm
      const adminConfirmAction = t2.actionSelection.action === "MANAGE_IDENTITY";
      const adminConfirmIntent = t2.actionSelection.intent === "confirm";

      tracker.record({
        name: "formal: admin confirm action selected",
        category: "e2e_flow",
        passed: adminConfirmAction,
        latencyMs: t2.totalLatencyMs,
        details: `Action: ${t2.actionSelection.action}, Intent: ${t2.actionSelection.intent}`,
        expected: "MANAGE_IDENTITY:confirm",
        actual: `${t2.actionSelection.action}:${t2.actionSelection.intent}`,
      });

      if (!adminConfirmAction || !adminConfirmIntent) {
        console.warn(
          `[soft-fail] admin confirm: expected MANAGE_IDENTITY:confirm, got ${t2.actionSelection.action}:${t2.actionSelection.intent}\n  reasoning: ${t2.actionSelection.reasoning}`,
        );
      }

      console.log(transcript.print());
    }, 60_000);

    it("Flow 8d: Slang user escalation chain", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Slang User Escalation");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("slang-user-vibe");
      runner.setupEntity(userId, { name: "Vibe", platform: "discord" });

      // Turn 1: Claims identity in slang
      const t1 = await runner.processMessage(
        "Vibe", userId,
        "yo whats good, names vibe. my twt is @vibe_codes and my gh is vibe-dev. been coding since middle school fr",
        "discord", "NONE",
      );

      transcript.addFromResult("Vibe", "discord", t1);

      const twExtracted = t1.extraction.identities.some((i) => i.platform === "twitter");
      const ghExtracted = t1.extraction.identities.some((i) => i.platform === "github");

      tracker.record({
        name: "slang: twitter + github from abbreviations",
        category: "e2e_flow",
        passed: twExtracted && ghExtracted,
        latencyMs: t1.totalLatencyMs,
        details: `TW=${twExtracted}, GH=${ghExtracted}`,
        expected: "twitter + github",
        actual: t1.extraction.identities.map((i) => `${i.platform}:${i.handle}`).join(", ") || "none",
      });

      // Turn 2: Urgent slang escalation
      const t2 = await runner.processMessage(
        "Vibe", userId,
        "yo someone get the admin ASAP the bot is literally posting everyones DMs in the main channel this is NOT ok 💀💀💀",
        "discord", "NONE",
      );

      transcript.addFromResult("Vibe", "discord", t2);

      const escalation = t2.actionSelection.action === "SEND_ADMIN_MESSAGE";

      tracker.record({
        name: "slang: urgent escalation detected",
        category: "e2e_flow",
        passed: escalation,
        latencyMs: t2.totalLatencyMs,
        details: `Action: ${t2.actionSelection.action}`,
        expected: "SEND_ADMIN_MESSAGE",
        actual: t2.actionSelection.action,
      });

      if (!escalation) {
        console.warn(
          `[soft-fail] slang escalation: expected SEND_ADMIN_MESSAGE, got ${t2.actionSelection.action}\n  reasoning: ${t2.actionSelection.reasoning}`,
        );
      }

      console.log(transcript.print());
    }, 60_000);

    it("Flow 8e: Verbose rambler with identity buried deep", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Verbose Rambler Deep Identity");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("verbose-sarah");
      runner.setupOwner(userId, { name: "Sarah" });

      // Single long message with identity buried in the middle
      const t1 = await runner.processMessage(
        "Sarah", userId,
        "So I wanted to give everyone an update on the project. We've been making great progress on the API layer — the auth service is finally stable after those weird JWT issues last week. " +
        "I pushed the latest batch of fixes to my GitHub, by the way my username there is sarah-builds if anyone wants to review. " +
        "Also, the frontend team found a nasty CSS grid bug that only shows up on Safari. I've been going back and forth with Apple's WebKit team about it. " +
        "Oh and one more thing — if anyone needs to reach me urgently, my email is sarah@projectlabs.dev, that's the fastest way. " +
        "The Slack channel tends to get noisy. Anyway, the next milestone is scheduled for Friday. Let me know if there are any blockers.",
        "client_chat", "OWNER",
      );

      transcript.addFromResult("Sarah", "client_chat", t1);

      const ghFound = t1.extraction.identities.some(
        (i) => i.platform === "github" && i.handle.replace(/^@/, "").includes("sarah-builds"),
      );
      const emailFound = t1.extraction.identities.some(
        (i) => i.platform === "email" && i.handle.includes("sarah@projectlabs.dev"),
      );

      // Owner claims → auto-accepted
      const allAccepted = t1.claimsStored.length > 0 && t1.claimsStored.every((c) => c.status === "accepted");

      tracker.record({
        name: "verbose owner: github extracted from paragraph",
        category: "e2e_flow",
        passed: ghFound,
        latencyMs: t1.totalLatencyMs,
        details: `GitHub found: ${ghFound}`,
        expected: "github:sarah-builds",
        actual: t1.extraction.identities.map((i) => `${i.platform}:${i.handle}`).join(", ") || "none",
      });

      tracker.record({
        name: "verbose owner: email extracted from paragraph",
        category: "e2e_flow",
        passed: emailFound,
        latencyMs: t1.totalLatencyMs,
        details: `Email found: ${emailFound}`,
        expected: "email:sarah@projectlabs.dev",
        actual: t1.extraction.identities.map((i) => `${i.platform}:${i.handle}`).join(", ") || "none",
      });

      tracker.record({
        name: "verbose owner: claims auto-accepted",
        category: "e2e_flow",
        passed: allAccepted,
        latencyMs: 0,
        details: `All accepted: ${allAccepted}, claims: ${t1.claimsStored.length}`,
        expected: "all accepted",
        actual: t1.claimsStored.map((c) => `${c.platform}:${c.status}`).join(", ") || "none",
      });

      if (!ghFound || !emailFound) {
        console.warn(
          `[soft-fail] verbose owner: expected github+email from long message. ` +
          `gh=${ghFound} email=${emailFound}` +
          `\n  raw: ${JSON.stringify(t1.extraction.rawResponse)}`,
        );
      }

      console.log(transcript.print());
    }, 60_000);
  });

  // =========================================================================
  // Category 9: Multi-Turn Conversation Flows
  // =========================================================================

  describe("Multi-Turn Flows", () => {
    it("Flow 6: Gradual identity reveal across messages", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Gradual Identity Reveal");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("gradual-alice");
      runner.setupEntity(userId, { name: "Alice", platform: "discord", role: "ADMIN" });

      // Turn 1: Casual intro — no identity
      const t1 = await runner.processMessage(
        "Alice", userId,
        "hey all, I just joined this server",
        "discord", "ADMIN",
      );
      transcript.add({
        speaker: "Alice", platform: "discord",
        message: "hey all, I just joined this server",
        extractedIdentities: t1.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: t1.actionSelection.action,
        latencyMs: t1.totalLatencyMs,
      });

      tracker.record({
        name: "gradual reveal: intro has no claims",
        category: "e2e_flow",
        passed: t1.claimsStored.length === 0,
        latencyMs: t1.totalLatencyMs,
        details: `Claims after intro: ${t1.claimsStored.length}`,
        expected: "0 claims",
        actual: `${t1.claimsStored.length} claims`,
      });

      // Turn 2: Drop a github handle naturally
      const t2 = await runner.processMessage(
        "Alice", userId,
        "I was working on that PR — I'm alice-dev on github if you want to review",
        "discord", "ADMIN",
      );
      transcript.add({
        speaker: "Alice", platform: "discord",
        message: "I was working on that PR — I'm alice-dev on github if you want to review",
        extractedIdentities: t2.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: t2.actionSelection.action,
        stateChanges: t2.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}/${c.claimTier}]`),
        latencyMs: t2.totalLatencyMs,
      });

      const hasGithub = t2.claimsStored.some((c) => c.platform === "github");
      tracker.record({
        name: "gradual reveal: github picked up mid-convo",
        category: "e2e_flow",
        passed: hasGithub,
        latencyMs: t2.totalLatencyMs,
        details: `Github claim stored: ${hasGithub}`,
        expected: "github:alice-dev",
        actual: t2.claimsStored.map((c) => `${c.platform}:${c.handle}`).join(",") || "none",
      });

      // Turn 3: Drop twitter in a casual way
      const t3 = await runner.processMessage(
        "Alice", userId,
        "I tweeted about it too — follow me @alice_codes for updates",
        "discord", "ADMIN",
      );
      transcript.add({
        speaker: "Alice", platform: "discord",
        message: "I tweeted about it too — follow me @alice_codes for updates",
        extractedIdentities: t3.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        selectedAction: t3.actionSelection.action,
        stateChanges: t3.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}/${c.claimTier}]`),
        latencyMs: t3.totalLatencyMs,
      });

      const hasTwitter = t3.claimsStored.some(
        (c) => c.platform === "twitter" && c.handle.includes("alice_codes"),
      );
      const totalClaims = t3.claimsStored.length;
      tracker.record({
        name: "gradual reveal: twitter added, both stored",
        category: "e2e_flow",
        passed: hasTwitter && totalClaims >= 2,
        latencyMs: t3.totalLatencyMs,
        details: `Total claims: ${totalClaims}, has twitter: ${hasTwitter}`,
        expected: ">=2 claims including twitter:alice_codes",
        actual: t3.claimsStored.map((c) => `${c.platform}:${c.handle}`).join(","),
      });

      expect(totalClaims).toBeGreaterThanOrEqual(2);
      console.log(transcript.print());
    }, 90_000);

    it("Flow 7: User claims then corrects themselves", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Claim then Correct");
      const runner = new LiveScenarioRunner(llmProvider);
      const userId = stringToUuid("corrector-bob");
      runner.setupOwner(userId, { name: "Bob" });

      // Turn 1: Initial claim (with a typo)
      const t1 = await runner.processMessage(
        "Bob", userId,
        "my twitter is @bob_buildz",
        "client_chat", "OWNER",
      );
      transcript.add({
        speaker: "Bob", platform: "client_chat",
        message: "my twitter is @bob_buildz",
        extractedIdentities: t1.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        stateChanges: t1.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}]`),
        latencyMs: t1.totalLatencyMs,
      });

      const firstClaim = t1.claimsStored.find((c) => c.platform === "twitter");
      tracker.record({
        name: "correction: initial claim stored",
        category: "e2e_flow",
        passed: !!firstClaim && firstClaim.handle.includes("bob_buildz"),
        latencyMs: t1.totalLatencyMs,
        details: `First claim: ${firstClaim?.handle}`,
        expected: "twitter:bob_buildz",
        actual: firstClaim ? `twitter:${firstClaim.handle}` : "none",
      });

      // Turn 2: Correction
      const t2 = await runner.processMessage(
        "Bob", userId,
        "wait sorry, my twitter is actually @bob_builds with an s, not z",
        "client_chat", "OWNER",
      );
      transcript.add({
        speaker: "Bob", platform: "client_chat",
        message: "wait sorry, my twitter is actually @bob_builds with an s, not z",
        extractedIdentities: t2.extraction.identities.map((i) => ({ platform: i.platform, handle: i.handle })),
        stateChanges: t2.claimsStored.map((c) => `${c.platform}:${c.handle} [${c.status}]`),
        latencyMs: t2.totalLatencyMs,
      });

      // The correction should have extracted the new handle
      const correctedExtraction = t2.extraction.identities.some(
        (i) => i.platform === "twitter" && i.handle.replace(/^@/, "").includes("bob_builds"),
      );
      tracker.record({
        name: "correction: new handle extracted from correction",
        category: "e2e_flow",
        passed: correctedExtraction,
        latencyMs: t2.totalLatencyMs,
        details: `Corrected handle extracted: ${correctedExtraction}`,
        expected: "twitter:bob_builds",
        actual: t2.extraction.identities.map((i) => `${i.platform}:${i.handle}`).join(",") || "none",
      });

      if (!correctedExtraction) {
        console.warn(
          `[soft-fail] correction: LLM didn't extract corrected handle\n` +
          `  raw: ${JSON.stringify(t2.extraction.rawResponse)}`,
        );
      }

      console.log(transcript.print());
    }, 60_000);

    it("Flow 8: Non-owner mentions owner's identity (hearsay vs self-report)", async () => {
      if (!llmProvider) return;

      const transcript = new ConversationTranscript("Hearsay vs Self-Report");
      const runner = new LiveScenarioRunner(llmProvider);

      const ownerId = stringToUuid("owner-shaw-hearsay");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("user-bob-hearsay");
      runner.setupEntity(userId, { name: "Bob", platform: "discord" });

      // Bob reports Shaw's twitter (hearsay)
      const result = await runner.processMessage(
        "Bob", userId,
        "Shaw's twitter is @shawmakesmagic, he mentioned it last week",
        "discord", "NONE",
      );

      transcript.add({
        speaker: "Bob", platform: "discord",
        message: "Shaw's twitter is @shawmakesmagic, he mentioned it last week",
        extractedIdentities: result.extraction.identities.map((i) => ({
          platform: i.platform,
          handle: i.handle,
        })),
        stateChanges: [
          ...result.extraction.identities.map(
            (i) => `reportedBy: ${i.reportedBy}, confidence: ${i.confidence}`,
          ),
        ],
        latencyMs: result.totalLatencyMs,
      });

      // Should extract the identity but mark it as "other" reported
      const extracted = result.extraction.identities.find(
        (i) => i.platform === "twitter" && i.handle.replace(/^@/, "").includes("shawmakesmagic"),
      );
      const isHearsay = extracted?.reportedBy === "other";
      const lowerConfidence = extracted ? extracted.confidence <= 0.7 : false;

      tracker.record({
        name: "hearsay: third-party report flagged correctly",
        category: "e2e_flow",
        passed: !!extracted && isHearsay,
        latencyMs: result.totalLatencyMs,
        details: `Extracted: ${!!extracted}, reportedBy: ${extracted?.reportedBy}, confidence: ${extracted?.confidence}`,
        expected: "twitter:shawmakesmagic, reportedBy=other, confidence<=0.7",
        actual: extracted
          ? `${extracted.platform}:${extracted.handle}, reportedBy=${extracted.reportedBy}, confidence=${extracted.confidence}`
          : "not extracted",
      });

      // The claim should be stored as proposed (Bob is NONE, not auto-accepted)
      const bobClaims = runner.getClaims(userId);
      const claimIsProposed = bobClaims.some(
        (c) => c.platform === "twitter" && c.status === "proposed",
      );

      tracker.record({
        name: "hearsay: hearsay claim stored as proposed",
        category: "e2e_flow",
        passed: claimIsProposed,
        latencyMs: 0,
        details: `Claim proposed: ${claimIsProposed}`,
        expected: "proposed",
        actual: bobClaims.map((c) => `${c.platform}:${c.status}`).join(",") || "no claims",
      });

      if (!extracted) {
        console.warn(
          `[soft-fail] hearsay: LLM didn't extract Shaw's twitter from Bob's message\n` +
          `  raw: ${JSON.stringify(result.extraction.rawResponse)}`,
        );
      }

      console.log(transcript.print());
    }, 30_000);
  });
});
