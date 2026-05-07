import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the logger before importing the module under test.
vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../diagnostics/integration-observability.js", () => ({
  createIntegrationTelemetrySpan: () => ({
    success: vi.fn(),
    failure: vi.fn(),
  }),
}));

import type { TwilioCredentials } from "./twilio.js";

const CREDS: TwilioCredentials = {
  accountSid: "AC_test",
  authToken: "tok_test",
  fromPhoneNumber: "+10000000000",
};

describe("sendTwilioSms retry behavior", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Replace global fetch with a spy for each test.
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    // Speed up retry delays — replace setTimeout so tests don't wait.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns success on first attempt without retrying", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ sid: "SM_abc" }),
    });

    const { sendTwilioSms } = await import("./twilio.js");
    const result = await sendTwilioSms({
      credentials: CREDS,
      to: "+11111111111",
      body: "hello",
    });

    expect(result.ok).toBe(true);
    expect(result.sid).toBe("SM_abc");
    expect(result.retryCount).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry 4xx errors (permanent failures)", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: "Unauthorized" }),
    });

    const { sendTwilioSms } = await import("./twilio.js");
    const result = await sendTwilioSms({
      credentials: CREDS,
      to: "+11111111111",
      body: "hello",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("Unauthorized");
    expect(result.retryCount).toBe(0);
    // Only one attempt — no retry for 4xx.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx errors up to MAX_RETRIES and returns last failure", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ message: "Service Unavailable" }),
    });

    const { sendTwilioSms } = await import("./twilio.js");
    const result = await sendTwilioSms({
      credentials: CREDS,
      to: "+11111111111",
      body: "hello",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    // 3 total attempts: initial + 2 retries.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.retryCount).toBe(2);
  });

  it("retries network errors and succeeds on second attempt", async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ sid: "SM_retry" }),
      });

    const { sendTwilioSms } = await import("./twilio.js");
    const result = await sendTwilioSms({
      credentials: CREDS,
      to: "+11111111111",
      body: "hello",
    });

    expect(result.ok).toBe(true);
    expect(result.sid).toBe("SM_retry");
    expect(result.retryCount).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("recovers from a 500 on first attempt when second attempt succeeds", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: "Internal Server Error" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ sid: "SM_recovered" }),
      });

    const { sendTwilioSms } = await import("./twilio.js");
    const result = await sendTwilioSms({
      credentials: CREDS,
      to: "+11111111111",
      body: "hello",
    });

    expect(result.ok).toBe(true);
    expect(result.sid).toBe("SM_recovered");
    expect(result.retryCount).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("sendTwilioVoiceCall retry behavior", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not retry a 400 bad request", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "Invalid To number" }),
    });

    const { sendTwilioVoiceCall } = await import("./twilio.js");
    const result = await sendTwilioVoiceCall({
      credentials: CREDS,
      to: "+11111111111",
      message: "reminder",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.retryCount).toBe(0);
  });

  it("escapes TwiML special characters in voice messages", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ sid: "CA_safe" }),
    });

    const { sendTwilioVoiceCall } = await import("./twilio.js");
    await sendTwilioVoiceCall({
      credentials: CREDS,
      to: "+11111111111",
      message: "</Say><Play>https://evil.test/audio.mp3</Play>",
    });

    const request = fetchSpy.mock.calls[0];
    expect(request?.[1]?.body).toContain(
      encodeURIComponent(
        "<Response><Say>&lt;/Say&gt;&lt;Play&gt;https://evil.test/audio.mp3&lt;/Play&gt;</Say></Response>",
      ),
    );
  });
});

describe("TwilioDeliveryResult.retryCount", () => {
  it("is part of the interface and defaults to 0 on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sid: "SM_zero" }),
      }),
    );

    const { sendTwilioSms } = await import("./twilio.js");
    const result = await sendTwilioSms({
      credentials: CREDS,
      to: "+11111111111",
      body: "test",
    });

    expect(result).toHaveProperty("retryCount");
    expect(result.retryCount).toBe(0);
  });
});
