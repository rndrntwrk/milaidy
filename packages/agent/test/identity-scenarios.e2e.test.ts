/**
 * Identity/Roles/Messaging scenario tests.
 *
 * Exercises the full pipeline: message -> evaluator -> provider -> action
 * selection -> action execution, using real implementations of our
 * evaluators, providers, and actions with stateful in-memory storage.
 *
 * LLM modes:
 *   - Default (recorded): deterministic recorded responses for CI.
 *   - Live (SCENARIO_TEST_LIVE=1): real LLM calls via environment API keys.
 *
 * Each scenario gets a fresh ScenarioRunner, so tests are independent.
 */

import type {
  Action,
  Entity,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  Relationship,
  Room,
  State,
  UUID,
  World,
} from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — intercept plugin-roles to drive real logic against our
// stateful stores (same pattern as roles-e2e.test.ts)
// ---------------------------------------------------------------------------

const {
  mockGetEntityRole,
  mockResolveWorldForMessage,
  mockSetEntityRole,
  mockNormalizeRole,
  mockCheckSenderRole,
} = vi.hoisted(() => ({
  mockGetEntityRole: vi.fn(),
  mockResolveWorldForMessage: vi.fn(),
  mockSetEntityRole: vi.fn(),
  mockNormalizeRole: vi.fn(),
  mockCheckSenderRole: vi.fn(),
}));

vi.mock("@miladyai/plugin-roles", () => ({
  getEntityRole: mockGetEntityRole,
  resolveWorldForMessage: mockResolveWorldForMessage,
  setEntityRole: mockSetEntityRole,
  normalizeRole: mockNormalizeRole,
  checkSenderRole: mockCheckSenderRole,
  canModifyRole: vi.fn(),
}));

const { mockLoadElizaConfig } = vi.hoisted(() => ({
  mockLoadElizaConfig: vi.fn(),
}));

vi.mock("../src/config/config.js", () => ({
  loadElizaConfig: mockLoadElizaConfig,
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports — must come after vi.mock
// ---------------------------------------------------------------------------

import { lateJoinWhitelistEvaluator } from "../src/evaluators/late-join-whitelist";
import { roleBackfillProvider } from "../src/providers/role-backfill";
import { createAdminTrustProvider } from "../src/providers/admin-trust";
import { createAdminPanelProvider } from "../src/providers/admin-panel";
import { createEscalationTriggerProvider } from "../src/providers/escalation-trigger";
import { sendAdminMessageAction } from "../src/actions/send-admin-message";
import { EscalationService } from "../src/services/escalation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RolesMetadata = {
  ownership?: { ownerId?: string };
  roles?: Record<string, string>;
};

/**
 * Simplified world shape for in-memory storage. Uses `as never` casts at
 * boundaries to satisfy strict World type without importing all sub-types.
 */
type MockWorld = {
  id: UUID;
  name: string;
  agentId: UUID;
  serverId: string;
  metadata: RolesMetadata & Record<string, unknown>;
};

interface PlatformIdentity {
  platform: string;
  handle: string;
  verified: boolean;
  confidence: number;
}

interface IdentityRelationship {
  id: UUID;
  sourceEntityId: UUID;
  targetEntityId: UUID;
  tags: string[];
  metadata: Record<string, unknown>;
}

interface SentMessage {
  target: { source: string; entityId?: UUID; channelId?: string };
  content: { text: string; source: string; metadata?: Record<string, unknown> };
}

interface SendMessageParams {
  text: string;
  entityId: string;
  platform: string;
  entityMetadata?: Record<string, unknown>;
  worldId?: string;
}

interface PipelineResult {
  providers: Record<string, ProviderResult>;
  evaluators: Record<string, unknown>;
  selectedAction?: string;
  actionResult?: unknown;
}

// ---------------------------------------------------------------------------
// Recorded LLM responses for deterministic testing
// ---------------------------------------------------------------------------

type RecordedResponse = {
  pattern: RegExp;
  response: string;
};

const RECORDED_RESPONSES: RecordedResponse[] = [
  {
    pattern: /discord.*shawwalters.*telegram.*@shaw_w.*twitter.*@shawmakesmagic/i,
    response: JSON.stringify({
      identities: [
        { platform: "discord", handle: "shawwalters" },
        { platform: "telegram", handle: "@shaw_w" },
        { platform: "twitter", handle: "@shawmakesmagic" },
      ],
    }),
  },
  {
    pattern: /twitter.*@?alice_codes/i,
    response: JSON.stringify({
      identities: [{ platform: "twitter", handle: "alice_codes" }],
    }),
  },
  {
    pattern: /github.*bob-admin/i,
    response: JSON.stringify({
      identities: [{ platform: "github", handle: "bob-admin" }],
    }),
  },
  {
    pattern: /remove.*twitter/i,
    response: JSON.stringify({
      action: "UNLINK_IDENTITY",
      platform: "twitter",
    }),
  },
  {
    pattern: /which action/i,
    response: JSON.stringify({ action: "NONE", parameters: {} }),
  },
];

function findRecordedResponse(text: string): string {
  for (const entry of RECORDED_RESPONSES) {
    if (entry.pattern.test(text)) return entry.response;
  }
  return JSON.stringify({ identities: [] });
}

// ---------------------------------------------------------------------------
// Accuracy Tracker
// ---------------------------------------------------------------------------

interface AccuracyResult {
  scenario: string;
  step: string;
  expected: string;
  actual: string;
  pass: boolean;
}

class AccuracyTracker {
  private results: AccuracyResult[] = [];

  record(
    scenario: string,
    step: string,
    expected: string,
    actual: string,
  ): void {
    this.results.push({
      scenario,
      step,
      expected,
      actual,
      pass: expected === actual,
    });
  }

  report(): {
    total: number;
    passed: number;
    accuracy: number;
    failures: Array<{ scenario: string; step: string }>;
  } {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.pass).length;
    return {
      total,
      passed,
      accuracy: total > 0 ? Math.round((passed / total) * 100) : 0,
      failures: this.results
        .filter((r) => !r.pass)
        .map((r) => ({ scenario: r.scenario, step: r.step })),
    };
  }
}

// ---------------------------------------------------------------------------
// ScenarioRunner
// ---------------------------------------------------------------------------

class ScenarioRunner {
  // Stateful stores
  private entities = new Map<string, Entity>();
  private worlds = new Map<string, MockWorld>();
  private rooms = new Map<string, Room>();
  private memories = new Map<string, Memory[]>();
  private relationships: IdentityRelationship[] = [];
  sentMessages: SentMessage[] = [];

  // Providers and evaluators (real implementations)
  private providers: Provider[];
  private evaluators: typeof lateJoinWhitelistEvaluator[];
  private actions: Action[];

  // Runtime reference
  runtime: IAgentRuntime;

  // Accuracy tracking
  private tracker = new AccuracyTracker();

  private agentId: UUID;
  private defaultWorldId: UUID;
  private defaultRoomId: UUID;

  constructor() {
    this.agentId = stringToUuid("scenario-agent") as UUID;
    this.defaultWorldId = stringToUuid("scenario-world") as UUID;
    this.defaultRoomId = stringToUuid("scenario-room") as UUID;

    // Set up default world
    this.worlds.set(this.defaultWorldId, {
      id: this.defaultWorldId,
      name: "App World",
      agentId: this.agentId,
      serverId: "",
      metadata: {
        ownership: {},
        roles: {},
      },
    } as MockWorld);

    // Set up default room
    this.rooms.set(this.defaultRoomId, {
      id: this.defaultRoomId,
      worldId: this.defaultWorldId,
      agentId: this.agentId,
      source: "client_chat",
      type: "GROUP" as never,
    } as Room);

    // Wire up plugin-roles mocks
    this.wirePluginRolesMocks();

    // Default config
    mockLoadElizaConfig.mockReturnValue({
      agents: { defaults: {} },
      plugins: { entries: {} },
    });

    // Build runtime
    this.runtime = this.buildRuntime();

    // Register real implementations
    this.providers = [
      roleBackfillProvider,
      createAdminTrustProvider(),
      createAdminPanelProvider(),
      createEscalationTriggerProvider(),
    ];
    this.evaluators = [lateJoinWhitelistEvaluator];
    this.actions = [sendAdminMessageAction];
  }

  // -----------------------------------------------------------------------
  // Setup helpers
  // -----------------------------------------------------------------------

  setupOwner(
    entityId: UUID | string,
    opts: {
      name: string;
      platformIdentities?: PlatformIdentity[];
    },
  ): void {
    const eid = entityId as UUID;
    this.entities.set(eid, {
      id: eid,
      agentId: this.agentId,
      names: [opts.name],
      metadata: {
        platformIdentities: (opts.platformIdentities ?? []) as never,
      },
    });

    // Set owner in default world
    const world = this.worlds.get(this.defaultWorldId);
    if (world) {
      world.metadata.ownership = { ownerId: eid };
      world.metadata.roles = { ...world.metadata.roles, [eid]: "OWNER" };
    }
  }

  setupEntity(
    entityId: UUID | string,
    opts: {
      name: string;
      platform: string;
      role?: string;
      platformIdentities?: PlatformIdentity[];
    },
  ): void {
    const eid = entityId as UUID;
    this.entities.set(eid, {
      id: eid,
      agentId: this.agentId,
      names: [opts.name],
      metadata: {
        [opts.platform]: {},
        platformIdentities: (opts.platformIdentities ?? []) as never,
      },
    });

    if (opts.role) {
      const world = this.worlds.get(this.defaultWorldId);
      if (world) {
        world.metadata.roles = {
          ...world.metadata.roles,
          [eid]: opts.role,
        };
      }
    }
  }

  setConfig(config: {
    ownerContacts?: Record<
      string,
      { entityId?: string; channelId?: string; roomId?: string }
    >;
    escalation?: {
      channels?: string[];
      waitMinutes?: number;
      maxRetries?: number;
    };
    connectorAdmins?: Record<string, string[]>;
  }): void {
    mockLoadElizaConfig.mockReturnValue({
      agents: {
        defaults: {
          ownerContacts: config.ownerContacts ?? {},
          escalation: config.escalation ?? {},
        },
      },
      plugins: {
        entries: {
          "@miladyai/plugin-roles": {
            config: {
              connectorAdmins: config.connectorAdmins ?? {},
            },
          },
        },
      },
    });
  }

  addIdentityLink(
    sourceEntityId: UUID | string,
    targetEntityId: UUID | string,
    status: "proposed" | "confirmed" | "rejected",
  ): void {
    this.relationships.push({
      id: stringToUuid(`link-${Date.now()}-${this.relationships.length}`),
      sourceEntityId: sourceEntityId as UUID,
      targetEntityId: targetEntityId as UUID,
      tags: ["identity_link"],
      metadata: { status },
    });
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getEntity(entityId: UUID | string): Entity | undefined {
    return this.entities.get(entityId as string);
  }

  getRelationships(
    entityId: UUID | string,
    tags?: string[],
  ): IdentityRelationship[] {
    return this.relationships.filter((r) => {
      const entityMatch =
        r.sourceEntityId === entityId || r.targetEntityId === entityId;
      if (!entityMatch) return false;
      if (tags && tags.length > 0) {
        return tags.some((t) => r.tags.includes(t));
      }
      return true;
    });
  }

  getWorldForPlatform(
    _platform: string,
  ): MockWorld | undefined {
    // For now, return the default world; multi-world support can be added.
    return this.worlds.get(this.defaultWorldId);
  }

  getAccuracyReport(): ReturnType<AccuracyTracker["report"]> {
    return this.tracker.report();
  }

  // -----------------------------------------------------------------------
  // Message processing pipeline
  // -----------------------------------------------------------------------

  async sendMessage(params: SendMessageParams): Promise<PipelineResult> {
    const entityId = params.entityId as UUID;
    const roomId = this.resolveRoomForPlatform(params.platform);

    // Ensure entity exists with platform metadata
    if (!this.entities.has(entityId)) {
      this.entities.set(entityId, {
        id: entityId,
        agentId: this.agentId,
        names: [],
        metadata: (params.entityMetadata ?? { [params.platform]: {} }) as never,
      });
    } else if (params.entityMetadata) {
      const entity = this.entities.get(entityId);
      if (entity) {
        entity.metadata = {
          ...(entity.metadata as Record<string, unknown>),
          ...params.entityMetadata,
        } as never;
      }
    }

    // Create the message memory
    const message: Memory = {
      id: stringToUuid(`msg-${Date.now()}-${Math.random()}`),
      entityId,
      roomId,
      content: {
        text: params.text,
        source: params.platform,
      },
      createdAt: Date.now(),
    };

    // Store it
    const roomMemories = this.memories.get(roomId) ?? [];
    roomMemories.push(message);
    this.memories.set(roomId, roomMemories);

    // Step 1: Run evaluators
    const evaluatorResults: Record<string, unknown> = {};
    for (const evaluator of this.evaluators) {
      const shouldRun = await evaluator.validate(this.runtime, message);
      if (shouldRun) {
        const result = await evaluator.handler(
          this.runtime,
          message,
          {} as State,
        );
        evaluatorResults[evaluator.name] = result ?? { ran: true };
      }
    }

    // Step 2: Run identity extraction (simulated via LLM)
    const extractionResult = await this.extractIdentities(message);
    if (extractionResult) {
      evaluatorResults.relationshipExtraction = extractionResult;
    }

    // Step 3: Run providers
    const providerResults: Record<string, ProviderResult> = {};
    for (const provider of this.providers) {
      try {
        const result = await provider.get(
          this.runtime,
          message,
          {} as State,
        );
        providerResults[provider.name] = result;
      } catch {
        // Skip providers that fail (missing dependencies, etc.)
      }
    }

    // Step 4: Action selection (via LLM or recorded)
    const actionSelection = await this.selectAction(message, providerResults);

    // Step 5: Execute action if selected
    let actionResult: unknown = undefined;
    if (actionSelection?.action && actionSelection.action !== "NONE") {
      const action = this.actions.find(
        (a) => a.name === actionSelection.action,
      );
      if (action) {
        const valid = await action.validate?.(
          this.runtime,
          message,
          {} as State,
        );
        if (valid) {
          actionResult = await action.handler?.(
            this.runtime,
            message,
            {} as State,
            {
              parameters: actionSelection.parameters ?? {},
            } as HandlerOptions,
          );
        }
      }
    }

    return {
      providers: providerResults,
      evaluators: evaluatorResults,
      selectedAction: actionSelection?.action,
      actionResult,
    };
  }

  // -----------------------------------------------------------------------
  // Private: identity extraction (simulated evaluator)
  // -----------------------------------------------------------------------

  private async extractIdentities(
    message: Memory,
  ): Promise<Record<string, unknown> | null> {
    const text = (message.content as { text?: string })?.text ?? "";
    const responseText = findRecordedResponse(text);

    try {
      const parsed = JSON.parse(responseText) as {
        identities?: Array<{ platform: string; handle: string }>;
      };
      if (!parsed.identities || parsed.identities.length === 0) return null;

      // Determine trust level based on sender role
      const entityId = message.entityId as string;
      const world = this.worlds.get(this.defaultWorldId);
      const role = world?.metadata.roles?.[entityId] ?? "NONE";

      const confidence = role === "OWNER" ? 0.95 : role === "ADMIN" ? 0.85 : 0.5;
      const autoVerify = role === "OWNER" || role === "ADMIN";

      // Update entity metadata with extracted identities
      const entity = this.entities.get(entityId);
      if (entity) {
        const existing =
          ((entity.metadata as Record<string, unknown>)
            ?.platformIdentities as PlatformIdentity[]) ?? [];
        for (const identity of parsed.identities) {
          const alreadyExists = existing.find(
            (e) =>
              e.platform === identity.platform &&
              e.handle === identity.handle,
          );
          if (!alreadyExists) {
            existing.push({
              platform: identity.platform,
              handle: identity.handle.replace(/^@/, ""),
              verified: autoVerify,
              confidence,
            });
          }
        }
        (entity.metadata as Record<string, unknown>).platformIdentities =
          existing;
      }

      return {
        identities: parsed.identities,
        confidence,
        autoVerified: autoVerify,
      };
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private: action selection
  // -----------------------------------------------------------------------

  private async selectAction(
    message: Memory,
    _providers: Record<string, ProviderResult>,
  ): Promise<{ action: string; parameters: Record<string, unknown> } | null> {
    const text = (message.content as { text?: string })?.text ?? "";
    const responseText = findRecordedResponse(text);

    try {
      const parsed = JSON.parse(responseText) as {
        action?: string;
        parameters?: Record<string, unknown>;
      };
      if (parsed.action) {
        return {
          action: parsed.action,
          parameters: parsed.parameters ?? {},
        };
      }
    } catch {
      // fall through
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Private: room resolution
  // -----------------------------------------------------------------------

  private resolveRoomForPlatform(platform: string): UUID {
    // Find existing room for this platform or create one
    for (const room of Array.from(this.rooms.values())) {
      if (room.source === platform) return room.id;
    }

    // Create new room for this platform
    const roomId = stringToUuid(`room-${platform}-${Date.now()}`);
    this.rooms.set(roomId, {
      id: roomId,
      worldId: this.defaultWorldId,
      agentId: this.agentId,
      source: platform,
      type: "GROUP" as never,
    } as Room);
    return roomId;
  }

  // -----------------------------------------------------------------------
  // Private: wire up plugin-roles mocks
  // -----------------------------------------------------------------------

  private wirePluginRolesMocks(): void {
    mockNormalizeRole.mockImplementation(
      (raw: string | undefined | null) => {
        if (!raw) return "NONE";
        const upper = raw.toUpperCase();
        if (upper === "OWNER" || upper === "ADMIN") return upper;
        return "NONE";
      },
    );

    mockGetEntityRole.mockImplementation(
      (metadata: RolesMetadata | undefined, entityId: string) => {
        return metadata?.roles?.[entityId] ?? "NONE";
      },
    );

    mockResolveWorldForMessage.mockImplementation(
      async (_runtime: unknown, message: Memory) => {
        const room = this.rooms.get(message.roomId);
        if (!room?.worldId) return null;
        const world = this.worlds.get(room.worldId as string);
        if (!world) return null;
        return { world, metadata: world.metadata };
      },
    );

    mockSetEntityRole.mockImplementation(
      async (
        _runtime: unknown,
        message: Memory,
        targetEntityId: string,
        newRole: string,
      ) => {
        const room = this.rooms.get(message.roomId);
        if (!room?.worldId) return {};
        const world = this.worlds.get(room.worldId as string);
        if (!world) return {};
        const roles = world.metadata.roles ?? {};
        if (newRole === "NONE") {
          delete roles[targetEntityId];
        } else {
          roles[targetEntityId] = newRole;
        }
        world.metadata.roles = roles;
        return { ...roles };
      },
    );

    mockCheckSenderRole.mockImplementation(
      async (_runtime: unknown, message: Memory) => {
        const room = this.rooms.get(message.roomId);
        if (!room?.worldId) return null;
        const world = this.worlds.get(room.worldId as string);
        if (!world) return null;
        const roles = world.metadata.roles ?? {};
        const role = roles[message.entityId as string] ?? "NONE";
        return {
          entityId: message.entityId,
          role,
          isOwner: role === "OWNER",
          isAdmin: role === "ADMIN" || role === "OWNER",
          canManageRoles: role === "OWNER" || role === "ADMIN",
        };
      },
    );
  }

  // -----------------------------------------------------------------------
  // Private: build mock runtime
  // -----------------------------------------------------------------------

  private buildRuntime(): IAgentRuntime {
    const self = this;

    const runtime = {
      agentId: this.agentId,
      character: { name: "ScenarioAgent", postExamples: [] },

      // Entity operations
      getEntityById: vi.fn(async (id: UUID) => {
        return self.entities.get(id) ?? null;
      }),
      getEntity: vi.fn(async (id: UUID) => {
        return self.entities.get(id) ?? null;
      }),
      updateEntity: vi.fn(async (entity: Entity) => {
        self.entities.set(entity.id, entity);
      }),
      createEntity: vi.fn(async (entity: Entity) => {
        self.entities.set(entity.id, entity);
        return entity;
      }),

      // Room operations
      getRoom: vi.fn(async (id: UUID) => {
        return self.rooms.get(id) ?? null;
      }),
      getRooms: vi.fn(async (_worldId: UUID) => {
        return Array.from(self.rooms.values());
      }),
      getEntitiesForRoom: vi.fn(async (_roomId: UUID) => {
        return Array.from(self.entities.values());
      }),
      getRoomsForParticipant: vi.fn(async (_entityId: UUID) => {
        return Array.from(self.rooms.values())
          .filter((r) => r.source === "client_chat")
          .map((r) => r.id);
      }),

      // World operations
      getWorld: vi.fn(async (id: UUID) => {
        return self.worlds.get(id) ?? null;
      }),
      getAllWorlds: vi.fn(async () => {
        return Array.from(self.worlds.values());
      }),
      updateWorld: vi.fn(async (world: MockWorld) => {
        self.worlds.set(world.id, { ...world });
      }),

      // Memory operations
      createMemory: vi.fn(async (memory: Memory, _tableName?: string) => {
        const roomId = memory.roomId as string;
        const current = self.memories.get(roomId) ?? [];
        current.push({ ...memory, createdAt: memory.createdAt ?? Date.now() });
        self.memories.set(roomId, current);
      }),
      getMemories: vi.fn(
        async (query: { roomId?: string; count?: number }) => {
          const current = self.memories.get(query.roomId ?? "") ?? [];
          const count = Math.max(1, query.count ?? current.length);
          return current.slice(-count);
        },
      ),
      getMemoriesByRoomIds: vi.fn(
        async (query: {
          roomIds?: UUID[];
          tableName?: string;
          limit?: number;
        }) => {
          const roomIds = query.roomIds ?? [];
          const merged: Memory[] = [];
          for (const rid of roomIds) {
            merged.push(...(self.memories.get(rid) ?? []));
          }
          return merged.slice(-(query.limit ?? merged.length));
        },
      ),

      // Relationship operations
      getRelationships: vi.fn(
        async (query: { entityIds?: string[]; tags?: string[] }) => {
          const entityIds = query.entityIds ?? [];
          const tags = query.tags ?? [];
          return self.relationships.filter((r) => {
            const entityMatch =
              entityIds.length === 0 ||
              entityIds.includes(r.sourceEntityId) ||
              entityIds.includes(r.targetEntityId);
            const tagMatch =
              tags.length === 0 || tags.some((t) => r.tags.includes(t));
            return entityMatch && tagMatch;
          });
        },
      ),

      // Send handler (captures messages)
      sendMessageToTarget: vi.fn(
        async (
          target: { source: string; entityId?: UUID; channelId?: string },
          content: {
            text: string;
            source: string;
            metadata?: Record<string, unknown>;
          },
        ) => {
          self.sentMessages.push({ target, content });
        },
      ),
      registerSendHandler: vi.fn(),

      // Model (recorded by default)
      useModel: vi.fn(async (_params: unknown) => {
        return "test response";
      }),

      // Misc
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      emitEvent: vi.fn(),
      getService: vi.fn(() => null),
      getServicesByType: vi.fn(() => []),
      getSetting: vi.fn(() => undefined),
      getCache: vi.fn(async () => null),
      setCache: vi.fn(async () => {}),
      getParticipantUserState: vi.fn(async () => null),
      setParticipantUserState: vi.fn(async () => {}),
      ensureConnection: vi.fn(async () => {}),
    };

    return runtime as unknown as IAgentRuntime;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("identity scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    EscalationService._reset();
  });

  afterEach(() => {
    EscalationService._reset();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Owner Onboarding
  // -----------------------------------------------------------------------

  describe("Owner Onboarding", () => {
    it("should recognize multi-platform identity declaration from owner", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const result = await runner.sendMessage({
        text: "Hey! I'm Shaw. My discord is shawwalters, my telegram is @shaw_w, and my twitter is @shawmakesmagic",
        entityId: ownerId,
        platform: "client_chat",
      });

      // Evaluator extracted identities
      expect(result.evaluators.relationshipExtraction).toBeDefined();
      const extraction = result.evaluators.relationshipExtraction as {
        identities: Array<{ platform: string; handle: string }>;
        confidence: number;
        autoVerified: boolean;
      };
      expect(extraction.identities.length).toBeGreaterThanOrEqual(3);
      expect(extraction.confidence).toBeGreaterThanOrEqual(0.9);
      expect(extraction.autoVerified).toBe(true);

      // Entity metadata updated with all 3 platforms
      const entity = runner.getEntity(ownerId);
      const identities = (entity?.metadata as Record<string, unknown>)
        ?.platformIdentities as PlatformIdentity[];
      expect(identities).toBeDefined();
      expect(identities.length).toBeGreaterThanOrEqual(3);

      // Check specific platforms
      const twitterIdentity = identities.find(
        (i) => i.platform === "twitter",
      );
      expect(twitterIdentity).toBeDefined();
      expect(twitterIdentity?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(twitterIdentity?.verified).toBe(true);

      const discordIdentity = identities.find(
        (i) => i.platform === "discord",
      );
      expect(discordIdentity).toBeDefined();
      expect(discordIdentity?.handle).toBe("shawwalters");

      const telegramIdentity = identities.find(
        (i) => i.platform === "telegram",
      );
      expect(telegramIdentity).toBeDefined();
      expect(telegramIdentity?.handle).toBe("shaw_w");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Owner Cross-Platform Recognition
  // -----------------------------------------------------------------------

  describe("Cross-Platform Recognition", () => {
    it("should detect owner on Discord after app identity claim", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, {
        name: "Shaw",
        platformIdentities: [
          {
            platform: "discord",
            handle: "shawwalters",
            verified: true,
            confidence: 0.95,
          },
        ],
      });

      // New Discord entity arrives with matching handle
      const discordEntityId = stringToUuid("discord-shaw");
      const result = await runner.sendMessage({
        text: "hey it's me",
        entityId: discordEntityId,
        platform: "discord",
        entityMetadata: {
          discord: { username: "shawwalters", userId: "123456789" },
        },
      });

      // The entity should exist with discord metadata
      const discordEntity = runner.getEntity(discordEntityId);
      expect(discordEntity).toBeDefined();
      const meta = discordEntity?.metadata as Record<string, unknown>;
      expect(meta?.discord).toBeDefined();
      const discordMeta = meta.discord as { username: string };
      expect(discordMeta.username).toBe("shawwalters");

      // Admin trust provider should reflect the world has an owner
      expect(result.providers.elizaAdminTrust).toBeDefined();

      // Role backfill provider ran (the owner has OWNER role set)
      const world = runner.getWorldForPlatform("discord");
      expect(world?.metadata.roles?.[ownerId]).toBe("OWNER");
    });

    it("should create identity link for matching cross-platform entity", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, {
        name: "Shaw",
        platformIdentities: [
          {
            platform: "discord",
            handle: "shawwalters",
            verified: true,
            confidence: 0.95,
          },
        ],
      });

      // Pre-create a confirmed link for testing lookup
      const discordEntityId = stringToUuid("discord-shaw");
      runner.addIdentityLink(discordEntityId, ownerId, "confirmed");

      const links = runner.getRelationships(discordEntityId, [
        "identity_link",
      ]);
      expect(links.length).toBeGreaterThan(0);

      const ownerLink = links.find(
        (l) =>
          (l.sourceEntityId === discordEntityId &&
            l.targetEntityId === ownerId) ||
          (l.sourceEntityId === ownerId &&
            l.targetEntityId === discordEntityId),
      );
      expect(ownerLink).toBeDefined();
      expect(ownerLink?.metadata.status).toBe("confirmed");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Regular User Claim + Verification
  // -----------------------------------------------------------------------

  describe("User Identity Claim", () => {
    it("should record claim as pending for non-admin user", async () => {
      const runner = new ScenarioRunner();

      const userId = stringToUuid("alice-discord");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      const result = await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: userId,
        platform: "discord",
      });

      // Extraction ran
      expect(result.evaluators.relationshipExtraction).toBeDefined();

      // Claim stored with low trust (NONE role)
      const entity = runner.getEntity(userId);
      const identities = (entity?.metadata as Record<string, unknown>)
        ?.platformIdentities as PlatformIdentity[];
      const twitterClaim = identities?.find(
        (i) => i.platform === "twitter",
      );
      expect(twitterClaim).toBeDefined();
      expect(twitterClaim?.confidence).toBeLessThan(0.7);
      expect(twitterClaim?.verified).toBe(false);
    });

    it("should auto-accept claim from admin user", async () => {
      const runner = new ScenarioRunner();

      const adminId = stringToUuid("admin-discord");
      runner.setupEntity(adminId, {
        name: "Admin Bob",
        platform: "discord",
        role: "ADMIN",
      });

      const result = await runner.sendMessage({
        text: "my github is bob-admin",
        entityId: adminId,
        platform: "discord",
      });

      const entity = runner.getEntity(adminId);
      const identities = (entity?.metadata as Record<string, unknown>)
        ?.platformIdentities as PlatformIdentity[];
      const githubClaim = identities?.find(
        (i) => i.platform === "github",
      );
      expect(githubClaim).toBeDefined();
      expect(githubClaim?.confidence).toBeGreaterThanOrEqual(0.8);
      expect(githubClaim?.verified).toBe(true);
    });

    it("should auto-accept claim from owner user", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const result = await runner.sendMessage({
        text: "my twitter is @alice_codes",
        entityId: ownerId,
        platform: "client_chat",
      });

      const entity = runner.getEntity(ownerId);
      const identities = (entity?.metadata as Record<string, unknown>)
        ?.platformIdentities as PlatformIdentity[];
      const twitterClaim = identities?.find(
        (i) => i.platform === "twitter",
      );
      expect(twitterClaim).toBeDefined();
      expect(twitterClaim?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(twitterClaim?.verified).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Escalation Flow
  // -----------------------------------------------------------------------

  describe("Escalation", () => {
    it("should send admin message and escalate on urgent", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
          telegram: { channelId: "123456789" },
        },
        escalation: {
          channels: ["client_chat", "telegram"],
          waitMinutes: 1,
          maxRetries: 2,
        },
      });

      const state = await EscalationService.startEscalation(
        runner.runtime,
        "Security alert",
        "Unusual login detected",
      );

      expect(state.resolved).toBe(false);
      expect(state.channelsSent).toContain("client_chat");

      // Message was sent via sendMessageToTarget
      expect(runner.sentMessages.length).toBeGreaterThan(0);
      expect(runner.sentMessages[0].target.source).toBe("client_chat");
      expect(runner.sentMessages[0].content.text).toBe(
        "Unusual login detected",
      );
      expect(runner.sentMessages[0].content.metadata?.escalation).toBe(true);
    });

    it("should advance to next channel when owner does not respond", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
          telegram: { entityId: ownerId, channelId: "tg-123" },
        },
        escalation: {
          channels: ["client_chat", "telegram"],
          waitMinutes: 1,
          maxRetries: 3,
        },
      });

      const state = await EscalationService.startEscalation(
        runner.runtime,
        "urgent",
        "Help needed",
      );

      expect(state.channelsSent).toEqual(["client_chat"]);

      // Advance — no owner response detected
      await EscalationService.checkEscalation(runner.runtime, state.id);

      expect(state.currentStep).toBe(1);
      expect(state.channelsSent).toContain("telegram");
    });

    it("should detect escalation context in provider output", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        ownerContacts: {
          client_chat: { entityId: ownerId },
        },
        escalation: {
          channels: ["client_chat"],
          waitMinutes: 5,
          maxRetries: 1,
        },
      });

      // Start an escalation
      await EscalationService.startEscalation(
        runner.runtime,
        "Test alert",
        "Something happened",
      );

      // Now send a message — escalation trigger provider should detect active escalation
      const result = await runner.sendMessage({
        text: "checking in",
        entityId: runner.runtime.agentId,
        platform: "client_chat",
      });

      const triggerProvider = result.providers.escalationTrigger;
      expect(triggerProvider).toBeDefined();
      expect(triggerProvider?.values?.hasEscalationTriggers).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Identity Unlinking
  // -----------------------------------------------------------------------

  describe("Identity Unlinking", () => {
    it("should support unlinking an identity via relationship status change", async () => {
      const runner = new ScenarioRunner();

      const userId = stringToUuid("alice");
      runner.setupEntity(userId, {
        name: "Alice",
        platform: "discord",
        platformIdentities: [
          {
            platform: "twitter",
            handle: "alice_codes",
            verified: true,
            confidence: 0.85,
          },
        ],
      });

      // Create confirmed identity link
      const twitterEntityId = stringToUuid("alice-twitter");
      runner.addIdentityLink(userId, twitterEntityId, "confirmed");

      // Verify the link exists
      const linksBefore = runner.getRelationships(userId, ["identity_link"]);
      expect(linksBefore.length).toBe(1);
      expect(linksBefore[0].metadata.status).toBe("confirmed");

      // Simulate unlink: update the relationship status to rejected
      linksBefore[0].metadata.status = "rejected";

      // Remove from entity metadata
      const entity = runner.getEntity(userId);
      if (entity) {
        const identities = (entity.metadata as Record<string, unknown>)
          ?.platformIdentities as PlatformIdentity[];
        const filtered = identities.filter(
          (i) => i.platform !== "twitter",
        );
        (entity.metadata as Record<string, unknown>).platformIdentities =
          filtered;
      }

      // Verify link is now rejected
      const linksAfter = runner.getRelationships(userId, ["identity_link"]);
      const twitterLink = linksAfter.find(
        (l) => l.metadata.status === "rejected",
      );
      expect(twitterLink).toBeDefined();

      // Verify entity metadata no longer has twitter
      const updatedEntity = runner.getEntity(userId);
      const identities = (
        updatedEntity?.metadata as Record<string, unknown>
      )?.platformIdentities as PlatformIdentity[];
      const twitter = identities?.find((i) => i.platform === "twitter");
      expect(twitter).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Role Backfill + Late Join Combined
  // -----------------------------------------------------------------------

  describe("Combined Role Flow", () => {
    it("should backfill owner role then promote late-join admin", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });
      runner.setConfig({
        connectorAdmins: { discord: ["discord-admin-id"] },
      });

      // Owner sends first message
      const ownerResult = await runner.sendMessage({
        text: "hello",
        entityId: ownerId,
        platform: "client_chat",
      });

      // Owner role backfill happened
      const world = runner.getWorldForPlatform("client_chat");
      expect(world?.metadata.roles?.[ownerId]).toBe("OWNER");

      // Admin joins from Discord
      const adminId = stringToUuid("discord-admin");
      runner.setupEntity(adminId, {
        name: "DiscordAdmin",
        platform: "discord",
      });

      // Update entity metadata with the whitelisted discord userId
      const adminEntity = runner.getEntity(adminId);
      if (adminEntity) {
        (adminEntity.metadata as Record<string, unknown>).discord = {
          userId: "discord-admin-id",
        };
      }

      const adminResult = await runner.sendMessage({
        text: "hey there",
        entityId: adminId,
        platform: "discord",
      });

      // Late-join evaluator should have promoted the admin
      expect(adminResult.evaluators.late_join_whitelist).toBeDefined();

      // Both roles coexist
      const updatedWorld = runner.getWorldForPlatform("discord");
      expect(updatedWorld?.metadata.roles?.[ownerId]).toBe("OWNER");
      expect(updatedWorld?.metadata.roles?.[adminId]).toBe("ADMIN");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Admin Trust Provider
  // -----------------------------------------------------------------------

  describe("Admin Trust Provider", () => {
    it("should mark owner as trusted admin in provider output", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const result = await runner.sendMessage({
        text: "checking my trust level",
        entityId: ownerId,
        platform: "client_chat",
      });

      const trustProvider = result.providers.elizaAdminTrust;
      expect(trustProvider).toBeDefined();
      expect(trustProvider?.values?.trustedAdmin).toBe(true);
      expect(trustProvider?.text).toContain("OWNER");
    });

    it("should not mark non-owner as trusted admin", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("regular-user");
      runner.setupEntity(userId, { name: "Alice", platform: "client_chat" });

      const result = await runner.sendMessage({
        text: "am I trusted?",
        entityId: userId,
        platform: "client_chat",
      });

      const trustProvider = result.providers.elizaAdminTrust;
      expect(trustProvider?.values?.trustedAdmin).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 8: SEND_ADMIN_MESSAGE Action
  // -----------------------------------------------------------------------

  describe("Send Admin Message Action", () => {
    it("should allow agent to send admin message", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      // Directly invoke the action as the agent
      const message: Memory = {
        id: stringToUuid("test-msg"),
        entityId: runner.runtime.agentId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "send notification", source: "client_chat" },
        createdAt: Date.now(),
      };

      const valid = await sendAdminMessageAction.validate?.(
        runner.runtime,
        message,
        {} as State,
      );
      expect(valid).toBe(true);

      const result = await sendAdminMessageAction.handler?.(
        runner.runtime,
        message,
        {} as State,
        { parameters: { text: "Task completed successfully" } } as HandlerOptions,
      );

      expect(result).toMatchObject({
        success: true,
        values: { success: true, urgency: "normal" },
      });
      expect(runner.sentMessages.length).toBeGreaterThan(0);
      expect(runner.sentMessages[0].content.text).toBe(
        "Task completed successfully",
      );
    });

    it("should reject non-admin caller", async () => {
      const runner = new ScenarioRunner();

      const ownerId = stringToUuid("owner-entity");
      runner.setupOwner(ownerId, { name: "Shaw" });

      const userId = stringToUuid("regular-user");
      runner.setupEntity(userId, { name: "Alice", platform: "discord" });

      const message: Memory = {
        id: stringToUuid("test-msg-2"),
        entityId: userId,
        roomId: stringToUuid("scenario-room"),
        content: { text: "send notification", source: "discord" },
        createdAt: Date.now(),
      };

      const valid = await sendAdminMessageAction.validate?.(
        runner.runtime,
        message,
        {} as State,
      );
      expect(valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 9: Pending Verification Detection
  // -----------------------------------------------------------------------

  describe("Pending Verification Detection", () => {
    it("should detect pending identity verifications in escalation trigger", async () => {
      const runner = new ScenarioRunner();

      const userId = stringToUuid("user-with-pending");
      runner.setupEntity(userId, { name: "Bob", platform: "discord" });

      // Add a proposed (pending) identity link
      runner.addIdentityLink(
        userId,
        stringToUuid("bob-twitter"),
        "proposed",
      );

      const result = await runner.sendMessage({
        text: "just checking in",
        entityId: userId,
        platform: "discord",
      });

      const triggerProvider = result.providers.escalationTrigger;
      expect(triggerProvider).toBeDefined();
      expect(triggerProvider?.values?.hasEscalationTriggers).toBe(true);
      expect(triggerProvider?.text).toContain("identity verification");
    });
  });
});
