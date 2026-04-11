import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const replacements = [
  {
    needle:
      'String.raw`\\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)',
    replacement:
      `\t"\\\\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\\\\b\\\\s*[=:]\\\\s*([\\"']?)([^\\\\s\\"'\\\\\\\\]+)\\\\1",`,
  },
  {
    needle: 'String.raw`--(?:api[-_]?key|token|secret|password|passwd)',
    replacement:
      `\t"--(?:api[-_]?key|token|secret|password|passwd)\\\\s+([\\"']?)([^\\\\s\\"']+)\\\\1",`,
  },
];

function patchFile(filePath) {
  if (!existsSync(filePath)) {
    return false;
  }

  const original = readFileSync(filePath, "utf8");
  const next = original
    .split("\n")
    .map((line) => {
      for (const { needle, replacement } of replacements) {
        if (line.includes(needle)) {
          return replacement;
        }
      }
      return line;
    })
    .join("\n");

  if (next === original) {
    return false;
  }

  writeFileSync(filePath, next, "utf8");
  console.log(`[patch-eliza-bun-compat] patched ${path.relative(root, filePath)}`);
  return true;
}

const targets = new Set([
  path.join(root, "eliza/packages/typescript/src/security/redact.ts"),
  path.join(root, "node_modules/@elizaos/core/src/security/redact.ts"),
]);

const pnpmDir = path.join(root, "node_modules/.pnpm");
if (existsSync(pnpmDir)) {
  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith("@elizaos+core@")) {
      continue;
    }
    targets.add(
      path.join(
        pnpmDir,
        entry,
        "node_modules/@elizaos/core/src/security/redact.ts",
      ),
    );
  }
}

let patched = 0;
for (const target of targets) {
  if (patchFile(target)) {
    patched += 1;
  }
}

if (patched === 0) {
  console.log("[patch-eliza-bun-compat] no matching targets found");
}
