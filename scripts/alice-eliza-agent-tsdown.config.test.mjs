import assert from "node:assert/strict";
import test from "node:test";

import { isBarePackageImport } from "./alice-eliza-agent-tsdown.config.mjs";

test("agent bundle externalizes package and Node imports", () => {
  assert.equal(isBarePackageImport("@node-rs/argon2"), true);
  assert.equal(isBarePackageImport("@reflink/reflink-darwin-arm64"), true);
  assert.equal(isBarePackageImport("node:fs"), true);
  assert.equal(isBarePackageImport("zod"), true);
});

test("agent bundle retains relative Eliza agent modules", () => {
  assert.equal(isBarePackageImport("./api/server.js"), false);
  assert.equal(isBarePackageImport("../services/plugin-installer.ts"), false);
  assert.equal(isBarePackageImport("/tmp/agent/src/index.ts"), false);
  assert.equal(isBarePackageImport("\0virtual-module"), false);
});
