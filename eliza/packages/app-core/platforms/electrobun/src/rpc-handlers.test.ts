import { describe, expect, it } from "vitest";
import { formatRendererDiagnosticLine } from "./rpc-handlers";

describe("renderer diagnostic formatting", () => {
  it("keeps provider-path status and URL context in mirrored lines", () => {
    const line = formatRendererDiagnosticLine({
      source: "fetch",
      message: "HTTP 401 Unauthorized",
      details: {
        url: "http://127.0.0.1:31337/api/cloud/status",
        method: "GET",
        durationMs: 42,
      },
    });

    expect(line).toContain("[Renderer:fetch]");
    expect(line).toContain("HTTP 401 Unauthorized");
    expect(line).toContain('"url":"http://127.0.0.1:31337/api/cloud/status"');
    expect(line).toContain('"method":"GET"');
  });

  it("captures post-connect RPC failures with structured details", () => {
    const line = formatRendererDiagnosticLine({
      source: "rpc",
      message: "Electrobun RPC request failed: agentCloudDisconnectWithConfirm",
      details: {
        name: "Error",
        message: "Unauthorized",
        status: 401,
        url: "http://127.0.0.1:31337/api/cloud/status",
      },
    });

    expect(line).toContain("agentCloudDisconnectWithConfirm");
    expect(line).toContain('"status":401');
    expect(line).toContain('"url":"http://127.0.0.1:31337/api/cloud/status"');
  });
});
