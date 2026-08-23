import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicJwkPath = path.join(root, "alice-production-program-public.jwk.json");
const expectedDigest =
  "sha256:b2aa16b88a789d0110f8e02521b15fd72b1d0df8873ffdfc1c7029c213825f5e";

test("pins the canonical public half of the controlled Alice Program key", () => {
  const bytes = fs.readFileSync(publicJwkPath, "utf8");
  const jwk = JSON.parse(bytes);
  assert.equal(bytes, `${canonicalAliceJson(jwk)}\n`);
  assert.deepEqual(Object.keys(jwk).sort(), ["e", "kty", "n"]);
  assert.equal(jwk.kty, "RSA");
  assert.equal(jwk.e, "AQAB");
  assert.match(jwk.n, /^[A-Za-z0-9_-]{512}$/);
  assert.equal(
    `sha256:${crypto.createHash("sha256").update(canonicalAliceJson(jwk)).digest("hex")}`,
    expectedDigest,
  );
  for (const privateField of ["d", "p", "q", "dp", "dq", "qi", "oth", "k"]) {
    assert.equal(privateField in jwk, false);
  }
});

test("the runtime trust pin is the exact controlled public JWK digest", () => {
  const source = fs.readFileSync(
    path.resolve(root, "../../workers/alice-production-control/src/runtime-config.ts"),
    "utf8",
  );
  assert.match(source, new RegExp(expectedDigest.replace(":", "\\:")));
});
