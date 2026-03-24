/**
 * Tests for the action parsing patch applied by patchElizaCoreActionParsing
 * in scripts/patch-deps.mjs.
 *
 * The upstream @elizaos/core parseKeyValueXml comma-splits <actions> content.
 * When the value contains structured <action> XML tags, the patch extracts
 * action names from <name> elements instead of comma-splitting.
 */

import { describe, expect, it } from "vitest";

/**
 * Simulates the patched replacement logic from patchElizaCoreActionParsing.
 * This mirrors the replacement string injected into @elizaos/core bundles.
 */
function applyPatchedActionParsing(
  key: string,
  value: string | undefined | null,
): string[] {
  if (
    key === "actions" &&
    value &&
    (value.includes("<action>") || value.includes("<action "))
  ) {
    return [
      ...value.matchAll(
        /<action[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/action>/g,
      ),
    ]
      .map((m) => m[1].trim())
      .filter(Boolean);
  }
  return value ? value.split(",").map((s) => s.trim()) : [];
}

describe("patchElizaCoreActionParsing", () => {
  it("parses XML <action> tags into an array of action names", () => {
    const xmlValue = `<action>
  <name>SEND_MESSAGE</name>
  <reason>User asked to send</reason>
</action>
<action>
  <name>READ_FILE</name>
  <reason>Need to check contents</reason>
</action>`;

    const result = applyPatchedActionParsing("actions", xmlValue);

    expect(result).toEqual(["SEND_MESSAGE", "READ_FILE"]);
  });

  it("falls back to comma-split for plain comma-separated strings", () => {
    const result = applyPatchedActionParsing(
      "actions",
      "SEND_MESSAGE, READ_FILE, WRITE_FILE",
    );

    expect(result).toEqual(["SEND_MESSAGE", "READ_FILE", "WRITE_FILE"]);
  });

  it("returns empty array for empty/null/undefined values", () => {
    expect(applyPatchedActionParsing("actions", "")).toEqual([]);
    expect(applyPatchedActionParsing("actions", null)).toEqual([]);
    expect(applyPatchedActionParsing("actions", undefined)).toEqual([]);
  });

  it("comma-splits non-actions keys even with XML content", () => {
    // The patch only intercepts key === "actions"
    const xmlValue = "<action><name>FOO</name></action>";
    const result = applyPatchedActionParsing("providers", xmlValue);

    // Should comma-split, not XML-parse
    expect(result).toEqual([xmlValue]);
  });

  it("handles <action name=...> attribute variant", () => {
    const xmlValue = `<action name="DEPLOY">
  <name>DEPLOY</name>
  <reason>Deploy to prod</reason>
</action>`;

    const result = applyPatchedActionParsing("actions", xmlValue);
    expect(result).toEqual(["DEPLOY"]);
  });

  it("handles single action tag", () => {
    const xmlValue = `<action>
  <name>CONTINUE</name>
</action>`;

    const result = applyPatchedActionParsing("actions", xmlValue);
    expect(result).toEqual(["CONTINUE"]);
  });

  it("filters out empty names from malformed tags", () => {
    const xmlValue = `<action>
  <name>GOOD_ACTION</name>
</action>
<action>
  <name>  </name>
</action>`;

    const result = applyPatchedActionParsing("actions", xmlValue);
    expect(result).toEqual(["GOOD_ACTION"]);
  });

  it("does not split on commas inside action param content", () => {
    const xmlValue = `<action>
  <name>START_CODING_TASK</name>
  <params>
    <repo>https://github.com/org/repo</repo>
    <task>Add orange, black, and red colors, hex grids, technical fonts</task>
  </params>
</action>`;

    const result = applyPatchedActionParsing("actions", xmlValue);
    expect(result).toEqual(["START_CODING_TASK"]);
  });
});
