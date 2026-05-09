import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.[cm]?tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function importedAgentSubpaths(): string[] {
  const root = process.cwd();
  const sourceRoot = join(root, "eliza/plugins/app-lifeops/src");
  const specs = new Set<string>();
  const pattern = /@elizaos\/agent\/([^"'`\s)]+)/g;

  for (const file of walk(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      specs.add(match[1]);
    }
  }

  return [...specs].sort();
}

function hasRootAgentSourceSubpath(subpath: string): boolean {
  const root = process.cwd();
  const base = join(root, "packages/agent/src", subpath);
  return (
    existsSync(`${base}.ts`) ||
    existsSync(`${base}.tsx`) ||
    existsSync(`${base}.js`) ||
    existsSync(join(base, "index.ts")) ||
    existsSync(join(base, "index.tsx")) ||
    existsSync(join(base, "index.js"))
  );
}

describe("LifeOps root agent subpath contract", () => {
  it("keeps every @elizaos/agent subpath imported by LifeOps available in packages/agent", () => {
    const missing = importedAgentSubpaths().filter(
      (subpath) => !hasRootAgentSourceSubpath(subpath),
    );

    expect(missing).toEqual([]);
  });
});
