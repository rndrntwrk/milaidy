import fs from "node:fs";
import path from "node:path";

import {
  buildModalReplaySnapshot,
  compareModalReplaySnapshots,
} from "./alice-provider-replay-evidence.mjs";

function invalid(code) {
  throw new Error(code);
}

function readBytes(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    invalid("ALICE_REPLAY_MODAL_PATH_INVALID");
  }
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 2 * 1024 * 1024) {
    invalid("ALICE_REPLAY_MODAL_PATH_INVALID");
  }
  return fs.readFileSync(filePath);
}

function output(filePath, value) {
  if (
    typeof filePath !== "string" ||
    !path.isAbsolute(filePath) ||
    !fs.statSync(path.dirname(filePath)).isDirectory() ||
    fs.existsSync(filePath)
  ) {
    invalid("ALICE_REPLAY_MODAL_PATH_INVALID");
  }
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

try {
  if (process.env.ALICE_REPLAY_MUTATION_DISABLED !== "1") {
    invalid("ALICE_REPLAY_MUTATION_CUTOFF_REQUIRED");
  }
  const [command, ...args] = process.argv.slice(2);
  let result;
  let outputPath;
  if (command === "snapshot" && args.length === 2) {
    const [inputPath, targetPath] = args;
    result = buildModalReplaySnapshot(readBytes(inputPath));
    outputPath = targetPath;
  } else if (command === "compare" && args.length === 3) {
    const [beforePath, afterPath, targetPath] = args;
    const comparison = compareModalReplaySnapshots(
      JSON.parse(readBytes(beforePath).toString("utf8")),
      JSON.parse(readBytes(afterPath).toString("utf8")),
    );
    result = {
      schemaVersion: "alice.modal-replay-comparison.v1",
      identical: comparison.identical,
      stateSha256: comparison.stateSha256,
    };
    outputPath = targetPath;
  } else {
    invalid("ALICE_REPLAY_MODAL_ARGUMENT_INVALID");
  }
  output(outputPath, result);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputPath,
    ...(result.stateSha256 === undefined
      ? {}
      : { stateSha256: result.stateSha256 }),
  })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
