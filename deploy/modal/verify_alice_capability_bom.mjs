import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalAliceCapabilityBom,
  digestAliceCapabilityBom,
  discoverAliceCapabilityInputs,
  generateAliceCapabilityBom,
} from "./alice_capability_bom.mjs";

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export async function verifyAliceCapabilityBom({
  root,
  expectedDigest,
  expectedDigests,
  discovery,
  write = false,
}) {
  const canonicalRoot = fs.realpathSync(root);
  const policyPath = path.join(canonicalRoot, "deploy/alice/alice-capability-policy.v1.json");
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  const resolvedDiscovery = discovery ?? discoverAliceCapabilityInputs(canonicalRoot, policy);
  let generated;
  try {
    generated = await generateAliceCapabilityBom({
      root: canonicalRoot,
      policy,
      discovery: resolvedDiscovery,
    });
  } catch (error) {
    if (!write && fs.existsSync(path.join(canonicalRoot, "alice-capability-bom.json"))) {
      throw new Error("ALICE_CAPABILITY_BOM_BYTES_MISMATCH", { cause: error });
    }
    throw error;
  }
  const generatedBytes = canonicalAliceCapabilityBom(generated);
  const generatedDigest = digestAliceCapabilityBom(generatedBytes);
  const bomPath = path.join(canonicalRoot, "alice-capability-bom.json");
  if (write) {
    fs.writeFileSync(bomPath, generatedBytes, { encoding: "utf8", mode: 0o444 });
  }
  let actualBytes;
  try {
    actualBytes = fs.readFileSync(bomPath, "utf8");
  } catch {
    throw new Error("ALICE_CAPABILITY_BOM_MISSING");
  }
  if (actualBytes !== generatedBytes) {
    throw new Error("ALICE_CAPABILITY_BOM_BYTES_MISMATCH");
  }
  const actualDigest = digestAliceCapabilityBom(actualBytes);
  if (expectedDigest !== undefined && (!DIGEST.test(expectedDigest) || expectedDigest !== actualDigest)) {
    throw new Error("ALICE_CAPABILITY_BOM_DIGEST_MISMATCH");
  }
  if (
    expectedDigests &&
    [expectedDigests.runtime, expectedDigests.build, expectedDigests.deployment].some(
      (digest) => !DIGEST.test(digest ?? "") || digest !== actualDigest,
    )
  ) {
    throw new Error("ALICE_CAPABILITY_BOM_DIGEST_MISMATCH");
  }
  return {
    ok: true,
    bomSha256: actualDigest,
    entryCount: generated.entries.length,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    const result = await verifyAliceCapabilityBom({
      root: process.env.ALICE_BUILD_ROOT || "/app",
      expectedDigest: process.env.ALICE_CAPABILITY_BOM_SHA256,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
