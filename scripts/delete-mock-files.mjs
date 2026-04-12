import fs from "node:fs/promises";
import path from "node:path";

const ROOTS = [
  { dir: "cloud", ignoreDirs: new Set([".git", ".next", ".turbo", ".yarn", "artifacts", "build", "coverage", "dist", "node_modules", "out", "test-results"]) },
  { dir: "eliza", ignoreDirs: new Set([".git", ".next", ".turbo", ".yarn", "artifacts", "build", "coverage", "dist", "node_modules", "out", "test-results", "examples"]) },
  { dir: ".", ignoreDirs: new Set([".git", ".next", ".turbo", ".yarn", "artifacts", "build", "coverage", "dist", "node_modules", "out", "test-results", "cloud", "eliza", "examples"]) }
];

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const MOCK_PATTERNS = [
  /\bvi\.mock\s*\(/g, /\bjest\.mock\s*\(/g, /\bvi\.fn\s*\(/g, /\bjest\.fn\s*\(/g,
  /\bvi\.spyOn\s*\(/g, /\bjest\.spyOn\s*\(/g, /\bvi\.stubGlobal\s*\(/g, /\bvi\.stubEnv\s*\(/g,
  /\bsinon\.stub\s*\(/g, /\bnock\s*\(/g, /\b(?:setupServer|setupWorker)\s*\(/g
];

async function walkDirectory(root) {
  const queue = [root.dir];
  while (queue.length > 0) {
    const currentDir = queue.pop();
    if (!currentDir) continue;
    
    let entries = [];
    try { entries = await fs.readdir(currentDir, { withFileTypes: true }); } catch { continue; }
    
    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (root.ignoreDirs.has(entry.name)) continue;
        const lowerName = entry.name.toLowerCase();
        if (["__mocks__", "__fixtures__", "fixtures", "mocks"].includes(lowerName)) {
            console.log("Removing mock dir: " + absPath);
            await fs.rm(absPath, { recursive: true, force: true });
            continue;
        }
        queue.push(absPath);
      } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
        const text = await fs.readFile(absPath, "utf8");
        const hasMock = MOCK_PATTERNS.some(regex => { regex.lastIndex = 0; return regex.test(text); });
        if (hasMock) {
          console.log("Removing mocked file: " + absPath);
          await fs.unlink(absPath);
        }
      }
    }
  }
}

for (const root of ROOTS) {
    console.log("Cleaning " + root.dir);
    await walkDirectory(root);
}
