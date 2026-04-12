import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

const MOCK_PATTERNS = [
  /vi\.mock\(/,
  /vi\.fn\(/,
  /vi\.spyOn\(/,
  /vi\.stubGlobal\(/,
  /jest\.mock\(/,
  /jest\.fn\(/,
  /jest\.spyOn\(/,
  /bun\.mock/,
  /mock\.module\(/,
  /mock\(/,
  /spyOn\(/,
];

async function scanAndDelete(dirPath) {
  let count = 0;
  const entries = await readdir(dirPath);
  for (const entry of entries) {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === "build" ||
      entry === "coverage"
    )
      continue;

    const fullPath = join(dirPath, entry);
    const info = await stat(fullPath);

    if (info.isDirectory()) {
      count += await scanAndDelete(fullPath);
    } else if (
      info.isFile() &&
      (fullPath.endsWith(".test.ts") ||
        fullPath.endsWith(".test.tsx") ||
        fullPath.endsWith(".spec.ts") ||
        fullPath.endsWith("test-utils.ts"))
    ) {
      if (fullPath.includes("node_modules")) continue;

      const content = await readFile(fullPath, "utf-8");
      const hasMock = MOCK_PATTERNS.some((pattern) => pattern.test(content));

      if (hasMock) {
        console.log(`Deleting: ${fullPath}`);
        await unlink(fullPath);
        count++;
      }
    }
  }
  return count;
}

async function main() {
  const rootDir = process.cwd();
  console.log("Scanning cloud...");
  const cloudCount = await scanAndDelete(join(rootDir, "cloud"));
  console.log("Scanning eliza...");
  const elizaCount = await scanAndDelete(join(rootDir, "eliza"));

  console.log(
    `Deleted ${cloudCount} cloud test files and ${elizaCount} eliza test files.`,
  );
}

main().catch(console.error);
