import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export type AliceKnowledgeSourceId =
  | "alice-system-docs"
  | "alice-action-references"
  | "alice-operator-runbooks"
  | "alice-founder-notes";

export type AliceKnowledgeSourceType =
  | "repo-docs"
  | "action-reference"
  | "runbook"
  | "founder-note";

export type AliceKnowledgeGroundingPolicy =
  | "ground-system-answers"
  | "ground-operator-recovery"
  | "founder-corroboration-required";

export type AliceKnowledgeRefreshTrigger =
  | "on-merge-to-main"
  | "before-release-or-demo"
  | "before-operator-proof"
  | "manual-founder-approval";

export interface AliceKnowledgeRefreshRule {
  trigger: AliceKnowledgeRefreshTrigger;
  maxAgeDays: number;
  owner: string;
  staleRisk: string;
}

export interface AliceKnowledgeSourceEntry {
  id: AliceKnowledgeSourceId;
  label: string;
  sourceType: AliceKnowledgeSourceType;
  description: string;
  groundingPolicy: AliceKnowledgeGroundingPolicy;
  anchors: string[];
  refreshRule: AliceKnowledgeRefreshRule;
  intendedQuestions: string[];
  provenanceFields: string[];
}

export interface AliceKnowledgeSourceSnapshot {
  id: AliceKnowledgeSourceId;
  fileCount: number;
  sourceVersion: string;
  lastModifiedAt: string | null;
  files: string[];
}

const TEXT_KNOWLEDGE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".json5",
  ".yaml",
  ".yml",
]);

export const ALICE_KNOWLEDGE_SOURCE_REGISTER: AliceKnowledgeSourceEntry[] = [
  {
    id: "alice-system-docs",
    label: "Alice system docs",
    sourceType: "repo-docs",
    description:
      "Canonical system, configuration, runtime, deployment, and core guide docs that should answer product and system-behavior questions.",
    groundingPolicy: "ground-system-answers",
    anchors: [
      "docs/cli",
      "docs/runtime",
      "docs/configuration.mdx",
      "docs/config-schema.mdx",
      "docs/deployment.mdx",
      "docs/guides/knowledge.md",
    ],
    refreshRule: {
      trigger: "on-merge-to-main",
      maxAgeDays: 1,
      owner: "Docs + runtime owner",
      staleRisk:
        "Alice can answer from old setup or deployment assumptions after a docs/runtime change.",
    },
    intendedQuestions: [
      "How do I set up Alice?",
      "How does runtime configuration work?",
      "Which deployment path is current?",
    ],
    provenanceFields: ["source_id", "source_path", "source_version", "refresh_rule"],
  },
  {
    id: "alice-action-references",
    label: "Alice action and API references",
    sourceType: "action-reference",
    description:
      "REST, API, plugin-registry, and action-reference docs used when Alice answers how an endpoint, tool, or action surface behaves.",
    groundingPolicy: "ground-system-answers",
    anchors: [
      "docs/rest",
      "docs/plugin-registry",
      "docs/plugins",
      "docs/guides/custom-actions.md",
      "docs/guides/hooks.md",
    ],
    refreshRule: {
      trigger: "on-merge-to-main",
      maxAgeDays: 1,
      owner: "API + plugin surface owner",
      staleRisk:
        "Alice can cite stale endpoint or action behavior if these references drift behind runtime changes.",
    },
    intendedQuestions: [
      "What does this endpoint do?",
      "How does the knowledge API behave?",
      "Which plugin/action surface is canonical?",
    ],
    provenanceFields: ["source_id", "source_path", "source_version", "refresh_rule"],
  },
  {
    id: "alice-operator-runbooks",
    label: "Alice operator runbooks",
    sourceType: "runbook",
    description:
      "Operator guidance, proof artifacts, and repeatable runbooks for setup, safety, evaluation, and recovery.",
    groundingPolicy: "ground-operator-recovery",
    anchors: [
      "docs/operators",
      "docs/stability",
      "docs/solo-vs-swarm-replay-benchmark-runbook.md",
    ],
    refreshRule: {
      trigger: "before-operator-proof",
      maxAgeDays: 7,
      owner: "Operator docs owner",
      staleRisk:
        "Operators can follow stale recovery or proof guidance even when product docs look current.",
    },
    intendedQuestions: [
      "How should an operator validate Alice right now?",
      "Which runbook is current for proof or recovery?",
      "What evidence pack backs the current behavior?",
    ],
    provenanceFields: ["source_id", "source_path", "source_version", "refresh_rule"],
  },
  {
    id: "alice-founder-notes",
    label: "Alice founder notes and planning surfaces",
    sourceType: "founder-note",
    description:
      "High-context planning, implementation dossiers, and founder-level notes that can inform strategy but should not become user-facing facts without corroboration.",
    groundingPolicy: "founder-corroboration-required",
    anchors: [
      "AGENTS.md",
      "docs/plans",
      "docs/superpowers/plans",
      "docs/superpowers/specs",
      "docs/fast-mode-implementation-dossier",
      "docs/autonomous-loop-implementation",
      "docs/triggers-system-implementation",
      "docs/KNOWLEDGE_TAB_IMPLEMENTATION_PLAN.md",
    ],
    refreshRule: {
      trigger: "manual-founder-approval",
      maxAgeDays: 30,
      owner: "Founder / product lead",
      staleRisk:
        "Planning assumptions can be mistaken for shipped behavior if they are ingested without corroboration.",
    },
    intendedQuestions: [
      "What is the intended direction for Alice?",
      "Which planning dossier explains this subsystem?",
      "What founder context should be corroborated before answering publicly?",
    ],
    provenanceFields: ["source_id", "source_path", "source_version", "refresh_rule"],
  },
] as const;

function isTextKnowledgeFile(filePath: string): boolean {
  return TEXT_KNOWLEDGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function collectKnowledgeFilesFromAnchor(rootDir: string, anchor: string): string[] {
  const resolved = path.resolve(rootDir, anchor);
  const stats = statSync(resolved);

  if (stats.isFile()) {
    return isTextKnowledgeFile(resolved) ? [anchor] : [];
  }

  const files: string[] = [];
  const entries = readdirSync(resolved, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const nextRelative = path.posix.join(anchor.replaceAll(path.sep, "/"), entry.name);
    const nextResolved = path.resolve(rootDir, nextRelative);

    if (entry.isDirectory()) {
      files.push(...collectKnowledgeFilesFromAnchor(rootDir, nextRelative));
      continue;
    }

    if (entry.isFile() && isTextKnowledgeFile(nextResolved)) {
      files.push(nextRelative);
    }
  }

  return files;
}

export function listAliceKnowledgeSourceFiles(
  rootDir: string,
  entry: AliceKnowledgeSourceEntry,
): string[] {
  const files = new Set<string>();

  for (const anchor of entry.anchors) {
    for (const file of collectKnowledgeFilesFromAnchor(rootDir, anchor)) {
      files.add(file);
    }
  }

  return Array.from(files).sort();
}

export function buildAliceKnowledgeSourceSnapshot(
  rootDir: string,
  entry: AliceKnowledgeSourceEntry,
): AliceKnowledgeSourceSnapshot {
  const files = listAliceKnowledgeSourceFiles(rootDir, entry);
  const hash = createHash("sha1");
  let latestMtimeMs = 0;

  for (const relativeFile of files) {
    const resolved = path.resolve(rootDir, relativeFile);
    const stats = statSync(resolved);
    const normalized = relativeFile.replaceAll(path.sep, "/");
    hash.update(`${normalized}:${Math.trunc(stats.mtimeMs)}:${stats.size}\n`);
    if (stats.mtimeMs > latestMtimeMs) {
      latestMtimeMs = stats.mtimeMs;
    }
  }

  return {
    id: entry.id,
    fileCount: files.length,
    sourceVersion: files.length
      ? `${entry.id}:${hash.digest("hex").slice(0, 12)}`
      : `${entry.id}:empty`,
    lastModifiedAt: latestMtimeMs ? new Date(latestMtimeMs).toISOString() : null,
    files,
  };
}

export function validateAliceKnowledgeSourceRegister(rootDir: string): void {
  const ids = new Set<string>();

  for (const entry of ALICE_KNOWLEDGE_SOURCE_REGISTER) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate Alice knowledge source id: ${entry.id}`);
    }
    ids.add(entry.id);

    if (!entry.label.trim()) {
      throw new Error(`Missing label for knowledge source: ${entry.id}`);
    }
    if (!entry.description.trim()) {
      throw new Error(`Missing description for knowledge source: ${entry.id}`);
    }
    if (entry.anchors.length === 0) {
      throw new Error(`Missing anchors for knowledge source: ${entry.id}`);
    }
    if (entry.intendedQuestions.length === 0) {
      throw new Error(`Missing intended questions for knowledge source: ${entry.id}`);
    }
    if (entry.provenanceFields.length === 0) {
      throw new Error(`Missing provenance fields for knowledge source: ${entry.id}`);
    }
    if (entry.refreshRule.maxAgeDays <= 0) {
      throw new Error(`Invalid refresh window for knowledge source: ${entry.id}`);
    }

    for (const anchor of entry.anchors) {
      const resolved = path.resolve(rootDir, anchor);
      try {
        statSync(resolved);
      } catch {
        throw new Error(
          `Knowledge source ${entry.id} references missing anchor: ${anchor}`,
        );
      }
    }

    const snapshot = buildAliceKnowledgeSourceSnapshot(rootDir, entry);
    if (snapshot.fileCount === 0) {
      throw new Error(
        `Knowledge source ${entry.id} does not currently resolve any text sources`,
      );
    }
  }
}
