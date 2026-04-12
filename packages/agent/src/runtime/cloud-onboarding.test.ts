/**
 * Tests for cloud-onboarding.ts
 *
 * Uses a local HTTP server for availability checks (real fetch) and
 * vi.mock for the cloud auth/bridge modules since runCloudOnboarding
 * orchestrates UI prompts and multi-module flows that can't reasonably
 * be tested end-to-end without a real cloud instance.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  assert,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks for auth/bridge (orchestration tests only)
// ---------------------------------------------------------------------------

const mockCloudLogin = vi.fn();
vi.mock("../cloud/auth", () => ({
  cloudLogin: (...args: unknown[]) => mockCloudLogin(...args),
}));

const mockCreateAgent = vi.fn();
const mockGetAgent = vi.fn();
vi.mock("../cloud/bridge-client", () => ({
  ElizaCloudClient: class {
    createAgent = mockCreateAgent;
    getAgent = mockGetAgent;
  },
}));

import {
  type CloudOnboardingResult,
  checkCloudAvailability,
  runCloudOnboarding,
} from "./cloud-onboarding";

// ---------------------------------------------------------------------------
// Local HTTP server for availability checks
// ---------------------------------------------------------------------------

let server: http.Server;
let serverPort: number;
let availabilityResponse: {
  status: number;
  body: unknown;
} = { status: 200, body: { success: true, data: { acceptingNewAgents: true, availableSlots: 5 } } };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/api/compat/availability") {
      res.writeHead(availabilityResponse.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(availabilityResponse.body));
      return;
    }

    // Also serve as a pseudo cloud base for onboarding tests
    if (url.pathname.endsWith("/api/compat/availability")) {
      res.writeHead(availabilityResponse.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(availabilityResponse.body));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  serverPort = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function localBaseUrl(): string {
  return `http://127.0.0.1:${serverPort}`;
}

// ---------------------------------------------------------------------------
// Helpers — fake @clack/prompts module
// ---------------------------------------------------------------------------

function makeClack(
  overrides: { selectReturn?: string; confirmReturns?: boolean[] } = {},
) {
  const { selectReturn = "cloud", confirmReturns = [] } = overrides;
  let confirmIdx = 0;

  return {
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      message: vi.fn(),
    },
    spinner: () => ({
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    }),
    select: vi.fn().mockResolvedValue(selectReturn),
    confirm: vi.fn().mockImplementation(() => {
      const val = confirmReturns[confirmIdx] ?? true;
      confirmIdx++;
      return Promise.resolve(val);
    }),
    isCancel: vi.fn().mockReturnValue(false),
  } as unknown as typeof import("@clack/prompts");
}

// ---------------------------------------------------------------------------
// checkCloudAvailability — real HTTP to local server
// ---------------------------------------------------------------------------

describe("checkCloudAvailability", () => {
  afterEach(() => {
    availabilityResponse = { status: 200, body: { success: true, data: { acceptingNewAgents: true, availableSlots: 5 } } };
  });

  it("returns null when cloud is accepting new agents", async () => {
    availabilityResponse = {
      status: 200,
      body: { success: true, data: { acceptingNewAgents: true, availableSlots: 5 } },
    };

    const result = await checkCloudAvailability(localBaseUrl());
    expect(result).toBeNull();
  });

  it("returns error message when cloud is at capacity", async () => {
    availabilityResponse = {
      status: 200,
      body: { success: true, data: { acceptingNewAgents: false, availableSlots: 0 } },
    };

    const result = await checkCloudAvailability(localBaseUrl());
    expect(result).toContain("at capacity");
  });

  it("returns error message when cloud returns HTTP error", async () => {
    availabilityResponse = { status: 503, body: {} };

    const result = await checkCloudAvailability(localBaseUrl());
    expect(result).toContain("503");
  });

  it("returns error message when fetch throws (network error)", async () => {
    // Connect to a port that's not listening
    const result = await checkCloudAvailability("http://127.0.0.1:1");
    expect(result).not.toBeNull();
  });

  it("returns timeout message on timeout", async () => {
    // Use a non-routable address that will time out
    const result = await checkCloudAvailability("http://192.0.2.1:1");
    // May return timeout or connection error depending on OS
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runCloudOnboarding — orchestration tests (keep module mocks for auth/bridge)
// ---------------------------------------------------------------------------

describe("runCloudOnboarding", () => {
  beforeEach(() => {
    mockCloudLogin.mockReset();
    mockCreateAgent.mockReset();
    mockGetAgent.mockReset();

    // Default: cloud is available via real local server
    availabilityResponse = {
      status: 200,
      body: { success: true, data: { acceptingNewAgents: true, availableSlots: 5 } },
    };
  });

  it("returns full result when auth + provisioning succeed", async () => {
    const clack = makeClack();

    mockCloudLogin.mockResolvedValue({
      apiKey: "test-key-123",
      keyPrefix: "test",
      expiresAt: null,
    });

    mockCreateAgent.mockResolvedValue({
      id: "agent-abc",
      status: "running",
    });

    mockGetAgent.mockResolvedValue({
      status: "running",
      bridgeUrl: "https://bridge.example.com",
    });

    const result = await runCloudOnboarding(
      clack,
      "TestAgent",
      undefined,
      localBaseUrl(),
    );

    assert(result != null, "expected a non-null result");
    expect(result.apiKey).toBe("test-key-123");
    expect(result.agentId).toBe("agent-abc");
  });

  it("returns null when cloud is unavailable and user falls back to local", async () => {
    const clack = makeClack({ confirmReturns: [true] }); // "run locally?"

    availabilityResponse = {
      status: 200,
      body: { success: true, data: { acceptingNewAgents: false, availableSlots: 0 } },
    };

    const result = await runCloudOnboarding(
      clack,
      "TestAgent",
      undefined,
      localBaseUrl(),
    );

    expect(result).toBeNull();
    expect(mockCloudLogin).not.toHaveBeenCalled();
  });

  it("returns null when auth fails and user declines retry", async () => {
    const clack = makeClack({ confirmReturns: [false] });

    mockCloudLogin.mockResolvedValue(null);

    const result = await runCloudOnboarding(
      clack,
      "TestAgent",
      undefined,
      localBaseUrl(),
    );

    expect(result).toBeNull();
    expect(mockCloudLogin).toHaveBeenCalledTimes(1);
  });

  it("retries auth once when user requests it", async () => {
    const clack = makeClack({ confirmReturns: [true] }); // "try again"

    mockCloudLogin.mockResolvedValueOnce(null).mockResolvedValueOnce({
      apiKey: "retry-key",
      keyPrefix: "retry",
      expiresAt: null,
    });

    mockCreateAgent.mockResolvedValue({
      id: "agent-retry",
      status: "running",
    });

    mockGetAgent.mockResolvedValue({
      status: "running",
      bridgeUrl: "https://bridge.example.com",
    });

    const result = await runCloudOnboarding(
      clack,
      "TestAgent",
      undefined,
      localBaseUrl(),
    );

    expect(mockCloudLogin).toHaveBeenCalledTimes(2);
    assert(result != null, "expected a non-null result after retry");
    expect(result.apiKey).toBe("retry-key");
  });

  it("returns auth-only result (agentId undefined) when provisioning fails and user declines local", async () => {
    const clack = makeClack({ confirmReturns: [false] });

    mockCloudLogin.mockResolvedValue({
      apiKey: "auth-only-key",
      keyPrefix: "auth",
      expiresAt: null,
    });

    mockCreateAgent.mockRejectedValue(new Error("quota exceeded"));

    const result = await runCloudOnboarding(
      clack,
      "TestAgent",
      undefined,
      localBaseUrl(),
    );

    assert(result != null, "expected a non-null auth-only result");
    expect(result.apiKey).toBe("auth-only-key");
    expect(result.agentId).toBeUndefined();
  });

  it("returns null when provisioning fails and user wants local", async () => {
    const clack = makeClack({ confirmReturns: [true] }); // "continue with local?"

    mockCloudLogin.mockResolvedValue({
      apiKey: "key-123",
      keyPrefix: "k",
      expiresAt: null,
    });

    mockCreateAgent.mockRejectedValue(new Error("server error"));

    const result = await runCloudOnboarding(
      clack,
      "TestAgent",
      undefined,
      localBaseUrl(),
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// provisionCloudAgent — tested indirectly via runCloudOnboarding
// ---------------------------------------------------------------------------

describe("provisionCloudAgent (via runCloudOnboarding)", () => {
  beforeEach(() => {
    mockCloudLogin.mockReset();
    mockCreateAgent.mockReset();
    mockGetAgent.mockReset();

    availabilityResponse = {
      status: 200,
      body: { success: true, data: { acceptingNewAgents: true, availableSlots: 5 } },
    };

    mockCloudLogin.mockResolvedValue({
      apiKey: "test-key",
      keyPrefix: "test",
      expiresAt: null,
    });
  });

  it("polls until agent reaches running status", {
    timeout: 15_000,
  }, async () => {
    const clack = makeClack();

    mockCreateAgent.mockResolvedValue({
      id: "agent-poll",
      status: "provisioning",
    });

    mockGetAgent
      .mockResolvedValueOnce({ status: "provisioning" })
      .mockResolvedValueOnce({
        status: "running",
        bridgeUrl: "https://bridge.test",
      });

    const result = await runCloudOnboarding(
      clack,
      "PollAgent",
      undefined,
      localBaseUrl(),
    );

    assert(result != null, "expected a non-null result after polling");
    expect(result.agentId).toBe("agent-poll");
    expect(result.bridgeUrl).toBe("https://bridge.test");
    expect(mockGetAgent).toHaveBeenCalledTimes(2);
  });

  it("returns null when agent provisioning fails with error status", async () => {
    const clack = makeClack({ confirmReturns: [true] }); // fall back to local

    mockCreateAgent.mockResolvedValue({
      id: "agent-fail",
      status: "provisioning",
    });

    mockGetAgent.mockResolvedValue({
      status: "failed",
      errorMessage: "out of resources",
    });

    const result = await runCloudOnboarding(
      clack,
      "FailAgent",
      undefined,
      localBaseUrl(),
    );

    expect(result).toBeNull();
  });

  it("passes style preset through to createAgent", async () => {
    const clack = makeClack();

    mockCreateAgent.mockResolvedValue({
      id: "agent-styled",
      status: "running",
    });

    mockGetAgent.mockResolvedValue({
      status: "running",
      bridgeUrl: "https://bridge.test",
    });

    const preset = {
      catchphrase: "test",
      bio: ["A test agent"],
      system: "You are a test agent.",
      adjectives: ["testy"],
      topics: ["testing"],
    };

    await runCloudOnboarding(
      clack,
      "StyledAgent",
      preset as Parameters<typeof runCloudOnboarding>[2],
      localBaseUrl(),
    );

    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
    const params = mockCreateAgent.mock.calls[0][0];
    expect(params.agentName).toBe("StyledAgent");
    expect(params.agentConfig.bio).toEqual(["A test agent"]);
    expect(params.agentConfig.system).toBe("You are a test agent.");
  });
});

// ---------------------------------------------------------------------------
// CloudOnboardingResult interface
// ---------------------------------------------------------------------------

describe("CloudOnboardingResult", () => {
  it("agentId accepts string value", () => {
    const result: CloudOnboardingResult = {
      apiKey: "key",
      agentId: "agent-123",
      baseUrl: "https://example.com",
    };
    expect(result.agentId).toBe("agent-123");
  });

  it("agentId accepts undefined", () => {
    const result: CloudOnboardingResult = {
      apiKey: "key",
      agentId: undefined,
      baseUrl: "https://example.com",
    };
    expect(result.agentId).toBeUndefined();
  });
});
