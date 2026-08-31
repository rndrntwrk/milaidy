import { describe, expect, it } from "vitest";
import { CORE_PLUGINS } from "./core-plugins.js";

const ALICE_CORPUS_PLUGIN = "@miladyai/agent/plugins/alice-corpus";

describe("Alice corpus core-plugin admission", () => {
  it("keeps corpus ingestion out of timeout-swallowing core pre-registration", () => {
    expect(CORE_PLUGINS).not.toContain(ALICE_CORPUS_PLUGIN);
  });
});
