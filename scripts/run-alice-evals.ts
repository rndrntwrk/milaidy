import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ALICE_EVAL_BASELINE,
  AliceEvalBundleSchema,
  buildAliceEvalCoverageSummary,
  compareAliceEvalBundle,
  validateAliceEvalFixtures,
} from "../src/benchmark/evals";

type Mode = "validate" | "baseline" | "compare";

function parseArgs(argv: string[]) {
  const args: {
    mode: Mode;
    candidate?: string;
    output?: string;
  } = {
    mode: "validate",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--mode") {
      const value = argv[i + 1];
      if (value === "validate" || value === "baseline" || value === "compare") {
        args.mode = value;
      }
      i += 1;
      continue;
    }
    if (token === "--candidate") {
      args.candidate = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--output") {
      args.output = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

async function writeOutput(outputPath: string | undefined, payload: unknown) {
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(json);
    return;
  }

  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, json, "utf8");
  process.stdout.write(`${resolved}\n`);
}

async function loadCandidateBundle(candidatePath: string | undefined) {
  if (!candidatePath) {
    throw new Error("--candidate is required in compare mode");
  }

  const resolved = path.resolve(candidatePath);
  const raw = await readFile(resolved, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (
    parsed &&
    typeof parsed === "object" &&
    "baseline" in parsed
  ) {
    return AliceEvalBundleSchema.parse(
      (parsed as { baseline: unknown }).baseline,
    );
  }
  return AliceEvalBundleSchema.parse(parsed);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateAliceEvalFixtures();

  if (args.mode === "validate") {
    await writeOutput(args.output, {
      status: "ok",
      mode: "validate",
      summary: buildAliceEvalCoverageSummary(),
    });
    return;
  }

  if (args.mode === "baseline") {
    await writeOutput(args.output, {
      status: "ok",
      mode: "baseline",
      summary: buildAliceEvalCoverageSummary(),
      baseline: ALICE_EVAL_BASELINE,
    });
    return;
  }

  const candidate = await loadCandidateBundle(args.candidate);
  const comparison = compareAliceEvalBundle(candidate);
  await writeOutput(args.output, {
    status: comparison.regressions.length === 0 ? "ok" : "regression",
    mode: "compare",
    summary: buildAliceEvalCoverageSummary(),
    comparison,
  });

  if (comparison.regressions.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
