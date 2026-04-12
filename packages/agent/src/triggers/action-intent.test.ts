import { describe, expect, it } from "vitest";
import { looksLikeTriggerIntent } from "./action";

describe("looksLikeTriggerIntent", () => {
  it("matches Spanish trigger requests", () => {
    expect(looksLikeTriggerIntent("programa un recordatorio cada semana")).toBe(
      true,
    );
  });

  it("matches Korean trigger requests", () => {
    expect(looksLikeTriggerIntent("매일 알림 설정해")).toBe(true);
  });

  it("ignores unrelated text", () => {
    expect(looksLikeTriggerIntent("open the current report")).toBe(false);
  });
});
