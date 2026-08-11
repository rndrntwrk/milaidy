import { describe, expect, it } from "bun:test";
import { assertLoopbackRehearsalBase } from "./local-rehearsal-base.js";

describe("assertLoopbackRehearsalBase", () => {
  it("accepts explicit HTTP(S) loopback targets", () => {
    expect(() => assertLoopbackRehearsalBase("http://localhost:3000")).not.toThrow();
    expect(() => assertLoopbackRehearsalBase("https://127.0.0.1:3443/api")).not.toThrow();
    expect(() => assertLoopbackRehearsalBase("http://[::1]:3000")).not.toThrow();
  });

  it("rejects remote, credentialed, and non-HTTP(S) bases before a rehearsal can authenticate", () => {
    expect(() => assertLoopbackRehearsalBase("https://stream555.example")).toThrow("localhost");
    expect(() => assertLoopbackRehearsalBase("http://127.0.0.1.evil.example")).toThrow("localhost");
    expect(() => assertLoopbackRehearsalBase("http://token@127.0.0.1:3000")).toThrow("localhost");
    expect(() => assertLoopbackRehearsalBase("unix:///tmp/stream555.sock")).toThrow("localhost");
  });
});
