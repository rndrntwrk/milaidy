import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const schemasDir = path.join(root, "eliza/packages/schemas");
const generatedAgentPath = path.join(
  root,
  "eliza/packages/typescript/src/types/generated/eliza/v1/agent_pb.js",
);

if (existsSync(generatedAgentPath)) {
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

if (!existsSync(generatedAgentPath)) {
  console.error(
    "[ensure-eliza-generated-types] buf generate completed but agent_pb.js is still missing",
  );
  process.exit(1);
}

console.log("[ensure-eliza-generated-types] generated TS protos");
