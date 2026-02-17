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
import { registerRuntimeContracts } from "../../src/autonomy/tools/runtime-contracts.js";
import {
  customActionPostConditions,
  registerBuiltinPostConditions,
} from "../../src/autonomy/verification/postconditions/index.js";
import type {
  PostCondition,
  PostConditionVerifierInterface,
  VerificationResult,
  VerifierContext,
} from "../../src/autonomy/verification/types.js";
import { loadMilaidyConfig } from "../../src/config/config.js";
import { loadCustomActions } from "../../src/runtime/custom-actions.js";
import { createTriggerTaskAction } from "../../src/triggers/action.js";

interface CliArgs {
  outDir: string;
  label: string;
  failOnMissing: boolean;
  includeRuntime: boolean;
}

interface CoverageEntry {
  toolName: string;
  contractVersion: string;
  riskClass: string;
  conditionCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  conditionIds: string[];
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
    label: args.get("label") ?? `postconditions-${now}`,
    failOnMissing: parseBoolean(args.get("fail-on-missing"), true),
    includeRuntime: parseBoolean(args.get("include-runtime"), false),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return fallback;
}

class CoverageCollector implements PostConditionVerifierInterface {
  readonly conditions = new Map<string, PostCondition[]>();

  registerConditions(toolName: string, conditions: PostCondition[]): void {
    const existing = this.conditions.get(toolName) ?? [];
    this.conditions.set(toolName, [...existing, ...conditions]);
  }

  async verify(_ctx: VerifierContext): Promise<VerificationResult> {
    throw new Error(
      "CoverageCollector does not execute post-conditions; it only records registrations",
    );
  }
}

function buildCoverageEntries(
  collector: CoverageCollector,
  contracts: Array<{
    name: string;
    version: string;
    riskClass: string;
  }>,
): CoverageEntry[] {
  return contracts.map((contract) => {
    const conditions = collector.conditions.get(contract.name) ?? [];
    const criticalCount = conditions.filter(
      (condition) => condition.severity === "critical",
    ).length;
    const warningCount = conditions.filter(
      (condition) => condition.severity === "warning",
    ).length;
    const infoCount = conditions.filter(
      (condition) => condition.severity === "info",
    ).length;

    return {
      toolName: contract.name,
      contractVersion: contract.version,
      riskClass: contract.riskClass,
      conditionCount: conditions.length,
      criticalCount,
      warningCount,
      infoCount,
      conditionIds: conditions.map((condition) => condition.id),
    };
  }).sort((a, b) => a.toolName.localeCompare(b.toolName));
}

function renderMarkdown(input: {
  label: string;
  createdAt: string;
  scope: "built-in" | "runtime";
  coveragePercent: number;
  contractCount: number;
  toolsWithConditions: number;
  missingTools: string[];
  extraRegisteredTools: string[];
  entries: CoverageEntry[];
}): string {
  const lines: string[] = [];
  lines.push("# Post-Condition Coverage Report");
  lines.push("");
  lines.push(`- Label: \`${input.label}\``);
  lines.push(`- Created at: \`${input.createdAt}\``);
  lines.push(`- Scope: \`${input.scope}\``);
  lines.push(`- Contracts in scope: \`${input.contractCount}\``);
  lines.push(`- Tools with post-conditions: \`${input.toolsWithConditions}\``);
  lines.push(`- Coverage: \`${input.coveragePercent.toFixed(2)}%\``);
  lines.push("");
  lines.push("| Tool | Risk | Contract | Checks | Critical | Warning | Info |");
  lines.push("|---|---|---|---:|---:|---:|---:|");
  for (const entry of input.entries) {
    lines.push(
      `| ${entry.toolName} | ${entry.riskClass} | ${entry.contractVersion} | ${entry.conditionCount} | ${entry.criticalCount} | ${entry.warningCount} | ${entry.infoCount} |`,
    );
  }
  lines.push("");
  lines.push("## Missing Coverage");
  lines.push("");
  if (input.missingTools.length === 0) {
    lines.push("- none");
  } else {
    for (const toolName of input.missingTools) {
      lines.push(`- ${toolName}`);
    }
  }
  lines.push("");
  lines.push("## Additional Registered Tools");
  lines.push("");
  if (input.extraRegisteredTools.length === 0) {
    lines.push("- none");
  } else {
    for (const toolName of input.extraRegisteredTools) {
      lines.push(`- ${toolName}`);
    }
  }
  lines.push("");
  lines.push("## Coverage Notes");
  lines.push("");
  if (input.scope === "built-in") {
    lines.push("- Scope covers autonomy built-in tool contracts only.");
    lines.push("- Use --include-runtime=true to include runtime/custom-action contracts.");
  } else {
    lines.push("- Scope includes built-in and discovered runtime/custom-action contracts.");
    lines.push("- Runtime-generated contracts without explicit post-conditions appear under Missing Coverage.");
  }
  lines.push("- Use this report with tool inventory output for phase gate evidence.");
  lines.push("");
  return lines.join("\n");
}

function runtimeActionsForCoverage() {
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
  const collector = new CoverageCollector();
  registerBuiltinPostConditions(collector);

  let contracts = BUILTIN_CONTRACTS.map((contract) => ({
    name: contract.name,
    version: contract.version,
    riskClass: contract.riskClass,
  }));

  if (cli.includeRuntime) {
    const registry = new ToolRegistry();
    registerBuiltinToolContracts(registry);
    const config = loadMilaidyConfig();
    const runtimeRegistration = registerRuntimeContracts(registry, {
      runtime: { actions: runtimeActionsForCoverage() },
      customActions: config.customActions ?? [],
    });

    // Mirror autonomy-service behavior for explicit custom actions.
    for (const actionName of runtimeRegistration.explicit) {
      collector.registerConditions(actionName, customActionPostConditions);
    }

    const autonomyDomains = config.autonomy?.domains;
    if (autonomyDomains?.enabled) {
      for (const domainId of autonomyDomains.autoLoadDomains ?? []) {
        if (domainId !== "coding") continue;
        const pack = createCodingDomainPack(autonomyDomains.coding);
        for (const contract of pack.toolContracts) {
          if (!registry.has(contract.name)) {
            registry.register(contract);
          }
        }
      }
    }

    contracts = registry
      .getAll()
      .map((contract) => ({
        name: contract.name,
        version: contract.version,
        riskClass: contract.riskClass,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const entries = buildCoverageEntries(collector, contracts);
  const contractCount = entries.length;
  const toolsWithConditions = entries.filter(
    (entry) => entry.conditionCount > 0,
  ).length;
  const coveragePercent =
    contractCount === 0 ? 100 : (toolsWithConditions / contractCount) * 100;
  const missingTools = entries
    .filter((entry) => entry.conditionCount === 0)
    .map((entry) => entry.toolName);
  const builtInToolNames = new Set(entries.map((entry) => entry.toolName));
  const extraRegisteredTools = Array.from(collector.conditions.keys())
    .filter((toolName) => !builtInToolNames.has(toolName))
    .sort((a, b) => a.localeCompare(b));

  const payload = {
    label: cli.label,
    createdAt: new Date().toISOString(),
    scope: cli.includeRuntime ? "runtime" : "built-in",
    contractCount,
    toolsWithConditions,
    coveragePercent: Number(coveragePercent.toFixed(2)),
    missingTools,
    extraRegisteredTools,
    entries,
  };

  mkdirSync(cli.outDir, { recursive: true });
  const jsonPath = join(cli.outDir, `${cli.label}.postconditions.json`);
  const mdPath = join(cli.outDir, `${cli.label}.postconditions.md`);

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    mdPath,
    renderMarkdown({
      label: payload.label,
      createdAt: payload.createdAt,
      scope: payload.scope,
      coveragePercent: payload.coveragePercent,
      contractCount: payload.contractCount,
      toolsWithConditions: payload.toolsWithConditions,
      missingTools: payload.missingTools,
      extraRegisteredTools: payload.extraRegisteredTools,
      entries,
    }),
    "utf8",
  );

  console.log(`[postconditions] wrote ${jsonPath}`);
  console.log(`[postconditions] wrote ${mdPath}`);

  if (cli.failOnMissing && missingTools.length > 0) {
    console.error(
      `[postconditions] missing coverage for ${missingTools.length} contract(s): ${missingTools.join(", ")}`,
    );
    process.exitCode = 1;
  }
}

void main();
