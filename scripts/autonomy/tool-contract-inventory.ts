#!/usr/bin/env -S node --import tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ToolRegistry } from "../../src/autonomy/tools/registry.js";
import {
  BUILTIN_CONTRACTS,
  registerBuiltinToolContracts,
} from "../../src/autonomy/tools/schemas/index.js";

interface CliArgs {
  outDir: string;
  label: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const eq = key.indexOf("=");
    if (eq > -1) {
      args.set(key.slice(0, eq), key.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i++;
      continue;
    }
    args.set(key, "true");
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    outDir: resolve(args.get("out-dir") ?? "docs/ops/autonomy/reports"),
    label: args.get("label") ?? `contracts-${now}`,
  };
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  contracts: Array<{
    name: string;
    version: string;
    riskClass: string;
    requiresApproval: boolean;
    requiredPermissions: string[];
    tagCount: number;
  }>;
}): string {
  const lines: string[] = [];
  lines.push("# Tool Contract Inventory");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Contract count: \`${input.contracts.length}\``);
  lines.push("");
  lines.push("| Tool | Version | Risk | Approval | Permissions | Tags |");
  lines.push("|---|---|---|---|---|---:|");
  for (const contract of input.contracts) {
    lines.push(
      `| ${contract.name} | ${contract.version} | ${contract.riskClass} | ${contract.requiresApproval ? "required" : "not-required"} | ${contract.requiredPermissions.join(", ")} | ${contract.tagCount} |`,
    );
  }
  lines.push("");
  lines.push("## Coverage Notes");
  lines.push("");
  lines.push("- This report inventories autonomy built-in contracts only.");
  lines.push("- Use this as the seed set for full runtime/plugin contract coverage work.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const registry = new ToolRegistry();
  registerBuiltinToolContracts(registry);

  const contracts = registry
    .getAll()
    .map((contract) => ({
      name: contract.name,
      version: contract.version,
      riskClass: contract.riskClass,
      requiresApproval: contract.requiresApproval,
      requiredPermissions: contract.requiredPermissions,
      tagCount: contract.tags?.length ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const riskBreakdown = contracts.reduce<Record<string, number>>((acc, c) => {
    acc[c.riskClass] = (acc[c.riskClass] ?? 0) + 1;
    return acc;
  }, {});

  const payload = {
    label: cli.label,
    createdAt: new Date().toISOString(),
    builtInContractCount: BUILTIN_CONTRACTS.length,
    inventoryCount: contracts.length,
    riskBreakdown,
    contracts,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.tool-contracts.json`);
  const mdPath = join(cli.outDir, `${cli.label}.tool-contracts.md`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    mdPath,
    renderMarkdown({
      label: cli.label,
      createdAt: payload.createdAt,
      contracts,
    }),
    "utf8",
  );

  console.log(`[contracts] wrote ${jsonPath}`);
  console.log(`[contracts] wrote ${mdPath}`);
}

void main();

