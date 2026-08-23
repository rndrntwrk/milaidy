import { describe, expect, it } from "vitest";
import { CORE_PLUGINS } from "./core-plugins.js";
import {
  collectPluginNames,
  type PluginLoadReasons,
} from "./plugin-collector.js";

const ALICE_CORPUS_PLUGIN = "@miladyai/agent/plugins/alice-corpus";

describe("Alice corpus regular-plugin admission", () => {
  it("admits the corpus lifecycle exactly once outside CORE_PLUGINS", () => {
    const reasons: PluginLoadReasons = new Map();
    const plugins = collectPluginNames({} as any, reasons);

    expect(CORE_PLUGINS).not.toContain(ALICE_CORPUS_PLUGIN);
    expect([...plugins].filter((name) => name === ALICE_CORPUS_PLUGIN)).toHaveLength(
      1,
    );
    expect(reasons.get(ALICE_CORPUS_PLUGIN)).toBe(
      "builtin: Alice corpus lifecycle",
    );
  });
});
