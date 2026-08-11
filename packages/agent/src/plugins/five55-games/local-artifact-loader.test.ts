import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import {
  loadPinnedLocalModule,
  readPinnedLocalJson,
} from "./local-artifact-loader.js";

const fixtureRoots: string[] = [];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function makeFixture(source: string): Promise<{
  root: string;
  entry: string;
  digest: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "five55-local-artifact-"));
  fixtureRoots.push(root);
  const directory = path.join(root, "sdk");
  const entry = path.join(directory, "entry.mjs");
  await mkdir(directory, { recursive: true });
  await writeFile(entry, source, "utf8");
  return { root, entry, digest: sha256(source) };
}

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("loadPinnedLocalModule", () => {
  it("loads only the exact, realpath-contained closure in explicit local mode", async () => {
    const fixture = await makeFixture('export const marker = "trusted";\n');

    const module = await loadPinnedLocalModule<{ marker: string }>({
      label: "test SDK",
      mode: "local",
      allowedRoot: fixture.root,
      entryPath: fixture.entry,
      sha256ByRelativePath: {
        "sdk/entry.mjs": fixture.digest,
      },
    });

    expect(module.marker).toBe("trusted");
  });

  it("reads a digest-pinned local JSON manifest without evaluating it as code", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "five55-local-artifact-"));
    fixtureRoots.push(root);
    const directory = path.join(root, "arcade");
    const entry = path.join(directory, "controller-artifacts.json");
    const source = '{"artifactDigest":"trusted","files":[]}\n';
    await mkdir(directory, { recursive: true });
    await writeFile(entry, source, "utf8");

    const manifest = await readPinnedLocalJson<{ artifactDigest: string }>({
      label: "test manifest",
      mode: "local",
      allowedRoot: root,
      entryPath: entry,
      sha256ByRelativePath: {
        "arcade/controller-artifacts.json": sha256(source),
      },
    });

    expect(manifest.artifactDigest).toBe("trusted");
  });

  it("refuses a matching artifact outside explicit local mode", async () => {
    const fixture = await makeFixture('export const marker = "trusted";\n');

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "production",
        allowedRoot: fixture.root,
        entryPath: fixture.entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": fixture.digest,
        },
      }),
    ).rejects.toThrow("local-only");
  });

  it("rejects an entry whose bytes do not match its declared closure digest", async () => {
    const fixture = await makeFixture('export const marker = "tampered";\n');

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "local",
        allowedRoot: fixture.root,
        entryPath: fixture.entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": "0".repeat(64),
        },
      }),
    ).rejects.toThrow("SHA-256 mismatch");
  });

  it("rejects a pinned entry that imports an unpinned local sidecar", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "five55-local-artifact-"));
    fixtureRoots.push(root);
    const directory = path.join(root, "sdk");
    const entry = path.join(directory, "entry.mjs");
    const sidecar = path.join(directory, "sidecar.mjs");
    const source = 'import { marker } from "./sidecar.mjs"; export { marker };\n';
    await mkdir(directory, { recursive: true });
    await writeFile(entry, source, "utf8");
    await writeFile(sidecar, 'export const marker = "unverified";\n', "utf8");

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "local",
        allowedRoot: root,
        entryPath: entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": sha256(source),
        },
      }),
    ).rejects.toThrow("not present in its SHA-256 closure");
  });

  it("rejects a leading-comment static import before any unpinned sidecar can execute", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "five55-local-artifact-"));
    fixtureRoots.push(root);
    const directory = path.join(root, "sdk");
    const entry = path.join(directory, "entry.mjs");
    const sidecar = path.join(directory, "sidecar.mjs");
    const source = '/* leading comment */ import { marker } from "./sidecar.mjs"; export { marker };\n';
    await mkdir(directory, { recursive: true });
    await writeFile(entry, source, "utf8");
    await writeFile(sidecar, 'console.error("UNPINNED-SIDECAR-EXECUTED"); export const marker = "unverified";\n', "utf8");

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "local",
        allowedRoot: root,
        entryPath: entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": sha256(source),
        },
      }),
    ).rejects.toThrow("not present in its SHA-256 closure");
  });

  it("rejects a bare package import even when a caller tries to allow it", async () => {
    const fixture = await makeFixture(
      'import "untrusted-package"; export const marker = "unsafe";\n',
    );

    const unsafeLegacyPin = {
        label: "test SDK",
        mode: "local",
        allowedRoot: fixture.root,
        entryPath: fixture.entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": fixture.digest,
        },
        allowedBareSpecifiers: ["untrusted-package"],
      };

    await expect(
      loadPinnedLocalModule(unsafeLegacyPin),
    ).rejects.toThrow("unapproved external import untrusted-package");
  });

  it("recognizes a minified static import and rejects an unpinned package", async () => {
    const fixture = await makeFixture(
      'import{x}from"untrusted-package"; export const marker = x;\n',
    );

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "local",
        allowedRoot: fixture.root,
        entryPath: fixture.entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": fixture.digest,
        },
      }),
    ).rejects.toThrow("unapproved external import untrusted-package");
  });

  it("accepts a minified static node: import inside a pinned bundle", async () => {
    const fixture = await makeFixture(
      'import{createHash}from"node:crypto"; export const marker = createHash("sha256").digest("hex");\n',
    );

    const module = await loadPinnedLocalModule<{ marker: string }>({
      label: "test SDK",
      mode: "local",
      allowedRoot: fixture.root,
      entryPath: fixture.entry,
      sha256ByRelativePath: {
        "sdk/entry.mjs": fixture.digest,
      },
    });

    expect(module.marker).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("fails closed on comment-adjacent import syntax that the lightweight scanner cannot prove", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "five55-local-artifact-"));
    fixtureRoots.push(root);
    const directory = path.join(root, "sdk");
    const entry = path.join(directory, "entry.mjs");
    const sidecar = path.join(directory, "sidecar.mjs");
    const source = 'import /* bundled later */ "./sidecar.mjs"; export const marker = "trusted";\n';
    await mkdir(directory, { recursive: true });
    await writeFile(entry, source, "utf8");
    await writeFile(sidecar, 'export const marker = "unverified";\n', "utf8");

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "local",
        allowedRoot: root,
        entryPath: entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": sha256(source),
        },
      }),
    ).rejects.toThrow("comment-adjacent import syntax");
  });

  it("rejects a generic compiler resolver before it can use a bare specifier", async () => {
    const fixture = await makeFixture(
      'import{createRequire}from"node:module";var __require=createRequire(import.meta.url);__require("zlib");export const marker="unsafe";\n',
    );

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "local",
        allowedRoot: fixture.root,
        entryPath: fixture.entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": fixture.digest,
        },
      }),
    ).rejects.toThrow("outside the immutable approved Task9 SDK bundle");
  });

  it("rejects a foreign pin even when it has the approved compiler-helper shape", async () => {
    const fixture = await makeFixture(
      'import{createRequire}from"node:module";var __require=createRequire(import.meta.url);__require("node:zlib");export const marker="trusted";\n',
    );

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "local",
        allowedRoot: fixture.root,
        entryPath: fixture.entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": fixture.digest,
        },
      }),
    ).rejects.toThrow("outside the immutable approved Task9 SDK bundle");
  });

  it("rejects a dynamic compiler helper require even when it could name node:", async () => {
    const fixture = await makeFixture(
      'import{createRequire}from"node:module";var __require=createRequire(import.meta.url);const builtin="node:zlib";__require(builtin);export const marker="unsafe";\n',
    );

    await expect(
      loadPinnedLocalModule({
        label: "test SDK",
        mode: "local",
        allowedRoot: fixture.root,
        entryPath: fixture.entry,
        sha256ByRelativePath: {
          "sdk/entry.mjs": fixture.digest,
        },
      }),
    ).rejects.toThrow("outside the immutable approved Task9 SDK bundle");
  });

  it("rejects a createRequire alias before an unpinned CommonJS sidecar can execute", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "five55-local-artifact-"));
    fixtureRoots.push(root);
    const directory = path.join(root, "sdk");
    const entry = path.join(directory, "entry.mjs");
    const sidecar = path.join(directory, "sidecar.cjs");
    const globalKey = "__five55_unpinned_create_require_sidecar__";
    const source = 'import{createRequire}from"node:module";const r=createRequire(import.meta.url);export const marker=r("./sidecar.cjs").marker;\n';
    await mkdir(directory, { recursive: true });
    await writeFile(entry, source, "utf8");
    await writeFile(sidecar, `globalThis.${globalKey}=true;module.exports={marker:"unverified"};\n`, "utf8");

    try {
      await expect(
        loadPinnedLocalModule({
          label: "test SDK",
          mode: "local",
          allowedRoot: root,
          entryPath: entry,
          sha256ByRelativePath: {
            "sdk/entry.mjs": sha256(source),
          },
        }),
      ).rejects.toThrow("outside the immutable approved Task9 SDK bundle");
      expect((globalThis as Record<string, unknown>)[globalKey]).toBeUndefined();
    } finally {
      delete (globalThis as Record<string, unknown>)[globalKey];
    }
  });

  it("rejects an alias of the approved compiler resolver before an unpinned sidecar can execute", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "five55-local-artifact-"));
    fixtureRoots.push(root);
    const directory = path.join(root, "sdk");
    const entry = path.join(directory, "entry.mjs");
    const sidecar = path.join(directory, "sidecar.cjs");
    const globalKey = "__five55_unpinned_compiler_resolver_sidecar__";
    const source = 'import{createRequire}from"node:module";var __require=createRequire(import.meta.url);const r=__require;export const marker=r("./sidecar.cjs").marker;\n';
    await mkdir(directory, { recursive: true });
    await writeFile(entry, source, "utf8");
    await writeFile(sidecar, `globalThis.${globalKey}=true;module.exports={marker:"unverified"};\n`, "utf8");

    try {
      await expect(
        loadPinnedLocalModule({
          label: "test SDK",
          mode: "local",
          allowedRoot: root,
          entryPath: entry,
          sha256ByRelativePath: {
            "sdk/entry.mjs": sha256(source),
          },
        }),
      ).rejects.toThrow("outside the immutable approved Task9 SDK bundle");
      expect((globalThis as Record<string, unknown>)[globalKey]).toBeUndefined();
    } finally {
      delete (globalThis as Record<string, unknown>)[globalKey];
    }
  });

  it("rejects an indirect createRequire alias before an unpinned sidecar can execute", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "five55-local-artifact-"));
    fixtureRoots.push(root);
    const directory = path.join(root, "sdk");
    const entry = path.join(directory, "entry.mjs");
    const sidecar = path.join(directory, "sidecar.cjs");
    const globalKey = "__five55_unpinned_indirect_create_require_sidecar__";
    const source = 'import{createRequire}from"node:module";const f=createRequire;const r=f(import.meta.url);export const marker=r("./sidecar.cjs").marker;\n';
    await mkdir(directory, { recursive: true });
    await writeFile(entry, source, "utf8");
    await writeFile(sidecar, `globalThis.${globalKey}=true;module.exports={marker:"unverified"};\n`, "utf8");

    try {
      await expect(
        loadPinnedLocalModule({
          label: "test SDK",
          mode: "local",
          allowedRoot: root,
          entryPath: entry,
          sha256ByRelativePath: {
            "sdk/entry.mjs": sha256(source),
          },
        }),
      ).rejects.toThrow("outside the immutable approved Task9 SDK bundle");
      expect((globalThis as Record<string, unknown>)[globalKey]).toBeUndefined();
    } finally {
      delete (globalThis as Record<string, unknown>)[globalKey];
    }
  });
});
