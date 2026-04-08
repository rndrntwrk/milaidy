import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("patch-deps runtime hotfixes", () => {
  it("contains plugin-sql participant conflict workaround", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchPluginSqlParticipantInsertConflict");
    expect(source).toContain(
      "Applied plugin-sql participant ON CONFLICT workaround",
    );
    expect(source).toContain(
      "const existing = await this.db.select({ id: participantTable.id })",
    );
  });

  it("contains local-embedding lspci log downgrade patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchLocalEmbeddingLinuxGpuProbe");
    expect(source).toContain(
      'logger3.debug("Linux GPU detection skipped: lspci not installed")',
    );
    expect(source).toContain('message.includes("lspci")');
  });

  it("contains plugin-discord ignore-other-mentions patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchPluginDiscordIgnoreOtherMentions");
    expect(source).toContain(
      "Ignoring message that targets another mentioned user",
    );
    expect(source).toContain("mentionedOtherUsers || isReplyToOtherUser");
  });

  it("contains workspace plugin-solana source patch support", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("collectWorkspacePluginOverrideDirs");
    expect(source).toContain("includeGlobalBunCache: true");
    expect(source).toContain('actions/swap.ts');
    expect(source).toContain('service.ts');
    expect(source).toContain('generated/specs/specs.ts');
    expect(source).toContain('JUPITER_SERVICE');
  });

  it("contains bigint-buffer native fallback log patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchBigintBufferNativeFallbackNoise");
    expect(source).toContain("MILADY_DEBUG_BIGINT_BINDINGS");
    expect(source).toContain("bigint: Failed to load bindings, pure JS will be used");
  });

  it("contains Baileys sharp dedupe patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchBaileysNestedSharpCopies");
    expect(source).toContain("@whiskeysockets+baileys@");
    expect(source).toContain("node_modules/sharp");
  });

  it("contains stale sharp store alias normalization", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchLegacySharpStoreAliases");
    expect(source).toContain("sharp@0.33.5");
    expect(source).toContain("@img+sharp-libvips-darwin-arm64@1.0.4");
  });

  it("contains plugin-knowledge runtime bundle sync", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchPluginKnowledgeRuntimeBundles");
    expect(source).toContain("@elizaos/plugin-knowledge");
    expect(source).toContain("Synced plugin-knowledge runtime bundle");
  });

  it("contains jsdom canvas opt-in patch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/patch-deps.mjs"),
      "utf8",
    );

    expect(source).toContain("patchJsdomCanvasAutoload");
    expect(source).toContain("MILADY_ENABLE_JSDOM_CANVAS");
    expect(source).toContain('exports.Canvas = require("canvas")');
  });
});
