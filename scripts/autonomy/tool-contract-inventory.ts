#!/usr/bin/env -S node --import tsx

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { emoteAction } from "../../src/actions/emote.js";
import { installPluginAction } from "../../src/actions/install-plugin.js";
import { mediaActions } from "../../src/actions/media.js";
import { restartAction } from "../../src/actions/restart.js";
import { terminalAction } from "../../src/actions/terminal.js";
import { createCodingDomainPack } from "../../src/autonomy/domains/coding/pack.js";
import { ToolRegistry } from "../../src/autonomy/tools/registry.js";
import {
  BUILTIN_CONTRACTS,
  registerBuiltinToolContracts,
} from "../../src/autonomy/tools/schemas/index.js";
import { registerRuntimeActionContracts } from "../../src/autonomy/tools/runtime-contracts.js";
import { loadMilaidyConfig } from "../../src/config/config.js";
import { loadCustomActions } from "../../src/runtime/custom-actions.js";
import { createTriggerTaskAction } from "../../src/triggers/action.js";

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
  runtimeActionCount: number;
  runtimeActionCoverageCount: number;
  runtimeGeneratedContractCount: number;
  domainRegisteredContractCount: number;
  autoLoadedDomains: string[];
  runtimeActionUncovered: string[];
  contracts: Array<{
    name: string;
    source: string;
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
  lines.push(
    `- Runtime action coverage: \`${input.runtimeActionCoverageCount}/${input.runtimeActionCount}\``,
  );
  lines.push(
    `- Runtime-generated contracts: \`${input.runtimeGeneratedContractCount}\``,
  );
  lines.push(
    `- Auto-loaded domain contracts: \`${input.domainRegisteredContractCount}\``,
  );
  lines.push(
    `- Auto-loaded domains: \`${input.autoLoadedDomains.join(", ") || "none"}\``,
  );
  lines.push("");
  lines.push("| Tool | Source | Version | Risk | Approval | Permissions | Tags |");
  lines.push("|---|---|---|---|---|---|---:|");
  for (const contract of input.contracts) {
    lines.push(
      `| ${contract.name} | ${contract.source} | ${contract.version} | ${contract.riskClass} | ${contract.requiresApproval ? "required" : "not-required"} | ${contract.requiredPermissions.join(", ")} | ${contract.tagCount} |`,
    );
  }
  lines.push("");
  lines.push("## Coverage Notes");
  lines.push("");
  if (input.runtimeActionUncovered.length === 0) {
    lines.push("- All discovered runtime actions have a contract.");
  } else {
    lines.push(
      `- Missing runtime action contracts: ${input.runtimeActionUncovered.join(", ")}`,
    );
  }
  lines.push(
    "- Runtime-generated contracts are synthesized from action parameter metadata.",
  );
  lines.push("");
  return lines.join("\n");
}

function runtimeActionsForInventory() {
  return [
    restartAction,
    createTriggerTaskAction,
    emoteAction,
    terminalAction,
    installPluginAction,
    ...mediaActions,
    ...loadCustomActions(),
  ];
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));

  const registry = new ToolRegistry();
  registerBuiltinToolContracts(registry);
  const builtInNames = new Set(BUILTIN_CONTRACTS.map((contract) => contract.name));

  const runtimeActions = runtimeActionsForInventory();
  const runtimeActionNames = [
    ...new Set(
      runtimeActions
        .map((action) =>
          typeof action?.name === "string" ? action.name.trim() : "",
        )
        .filter((name) => name.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const runtimeGeneratedNames = new Set(
    registerRuntimeActionContracts(registry, { actions: runtimeActions }),
  );

  const config = loadMilaidyConfig();
  const autonomyDomains = config.autonomy?.domains;
  const autoLoadedDomains: string[] = [];
  const domainRegisteredNames = new Set<string>();

  if (autonomyDomains?.enabled) {
    for (const domainId of autonomyDomains.autoLoadDomains ?? []) {
      if (domainId !== "coding") continue;
      autoLoadedDomains.push(domainId);
      const pack = createCodingDomainPack(autonomyDomains.coding);
      for (const contract of pack.toolContracts) {
        if (!registry.has(contract.name)) {
          registry.register(contract);
        }
        domainRegisteredNames.add(contract.name);
      }
    }
  }

  const contracts = registry
    .getAll()
    .map((contract) => ({
      name: contract.name,
      source: runtimeGeneratedNames.has(contract.name)
        ? "runtime-generated"
        : domainRegisteredNames.has(contract.name)
          ? "domain"
          : builtInNames.has(contract.name)
            ? "built-in"
            : "registered",
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

  const runtimeActionUncovered = runtimeActionNames.filter(
    (name) => !registry.has(name),
  );
  const runtimeActionCoverageCount =
    runtimeActionNames.length - runtimeActionUncovered.length;

  const payload = {
    label: cli.label,
    createdAt: new Date().toISOString(),
    builtInContractCount: BUILTIN_CONTRACTS.length,
    runtimeActionCount: runtimeActionNames.length,
    runtimeActionCoverageCount,
    runtimeGeneratedContractCount: runtimeGeneratedNames.size,
    runtimeActionUncovered,
    autoLoadedDomains,
    domainRegisteredContractCount: domainRegisteredNames.size,
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
      runtimeActionCount: payload.runtimeActionCount,
      runtimeActionCoverageCount: payload.runtimeActionCoverageCount,
      runtimeGeneratedContractCount: payload.runtimeGeneratedContractCount,
      domainRegisteredContractCount: payload.domainRegisteredContractCount,
      autoLoadedDomains: payload.autoLoadedDomains,
      runtimeActionUncovered: payload.runtimeActionUncovered,
      contracts,
    }),
    "utf8",
  );

  console.log(`[contracts] wrote ${jsonPath}`);
  console.log(`[contracts] wrote ${mdPath}`);
}

void main();
