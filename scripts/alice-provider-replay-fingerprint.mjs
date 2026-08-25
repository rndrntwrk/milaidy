import fs from "node:fs";
import path from "node:path";

import { compareCloudflareReplaySnapshots } from "./alice-provider-replay-evidence.mjs";

function invalid(code) {
  throw new Error(code);
}

try {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (
    process.env.ALICE_REPLAY_MUTATION_DISABLED !== "1" ||
    !path.isAbsolute(inputPath ?? "") ||
    !path.isAbsolute(outputPath ?? "") ||
    !fs.statSync(inputPath).isFile() ||
    !fs.statSync(path.dirname(outputPath)).isDirectory() ||
    fs.existsSync(outputPath)
  ) {
    invalid("ALICE_REPLAY_FINGERPRINT_INVALID");
  }
  const snapshot = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const comparison = compareCloudflareReplaySnapshots(snapshot, snapshot);
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify({
      schemaVersion: "alice.provider-replay-fingerprint.v1",
      providerStateSha256: comparison.stateSha256,
      rawEvidence: snapshot.rawEvidence,
    })}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o444 },
  );
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputPath,
    providerStateSha256: comparison.stateSha256,
  })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
