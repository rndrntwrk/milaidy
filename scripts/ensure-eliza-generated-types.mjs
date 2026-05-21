import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const schemasDir = path.join(root, "eliza/packages/schemas");
const keywordGenerator = path.join(
  root,
  "eliza/packages/shared/scripts/generate-keywords.mjs",
);
const generatedKeywordCandidates = [
  path.join(
    root,
    "eliza/packages/shared/src/i18n/generated/validation-keyword-data.ts",
  ),
  path.join(
    root,
    "eliza/packages/shared/src/i18n/generated/validation-keyword-data.js",
  ),
];
const generatedAgentCandidates = [
  path.join(
    root,
    "eliza/packages/typescript/src/types/generated/eliza/v1/agent_pb.ts",
  ),
  path.join(
    root,
    "eliza/packages/typescript/src/types/generated/eliza/v1/agent_pb.js",
  ),
];

function hasGeneratedAgentType() {
  return generatedAgentCandidates.some((candidate) => existsSync(candidate));
}

function hasGeneratedKeywordData() {
  return generatedKeywordCandidates.every((candidate) => existsSync(candidate));
}

if (!hasGeneratedKeywordData() && existsSync(keywordGenerator)) {
  const result = spawnSync("node", [keywordGenerator], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (!hasGeneratedKeywordData()) {
    console.error(
      "[ensure-eliza-generated-types] keyword generator completed but validation-keyword-data.{ts,js} is still missing",
    );
    process.exit(1);
  }

  console.log("[ensure-eliza-generated-types] generated i18n keyword data");
}

if (hasGeneratedAgentType()) {
  console.log("[ensure-eliza-generated-types] generated TS protos already present");
  process.exit(0);
}

if (!existsSync(schemasDir)) {
  console.log("[ensure-eliza-generated-types] eliza schemas directory not found");
  process.exit(0);
}

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  pnpmCmd,
  ["--dir", schemasDir, "exec", "buf", "generate"],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!hasGeneratedAgentType()) {
  console.error(
    "[ensure-eliza-generated-types] buf generate completed but agent_pb.{ts,js} is still missing",
  );
  process.exit(1);
}

console.log("[ensure-eliza-generated-types] generated TS protos");
