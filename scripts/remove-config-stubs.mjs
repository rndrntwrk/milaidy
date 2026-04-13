import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function stripStubsFromConfig(filePath) {
  try {
    let content = await readFile(filePath, "utf-8");

    // For vitest configs: Remove alias objects that contain "test", "stubs"
    // We can just use a regex to match { find: ..., replacement: ... "stubs" ... },
    content = content.replace(
      /\{[^}]*find:[^}]*replacement:[^}]*stubs[^}]*\},\n?/g,
      "",
    );

    // For setup.ts: Remove lines calling mock setup functions
    content = content
      .split("\n")
      .filter((line) => {
        if (line.includes("createMockStorage")) return false;
        if (line.includes("installCanvasMocks")) return false;
        if (line.includes("installMediaElementMocks")) return false;
        if (line.includes("__mocks__")) return false;
        if (line.includes("lookingglass-webxr")) return false;
        return true;
      })
      .join("\n");

    await writeFile(filePath, content, "utf-8");
    console.log(`Cleaned ${filePath}`);
  } catch (e) {
    console.log(`Failed to process ${filePath}`, e);
  }
}

async function main() {
  const files = [
    "vitest.integration.config.ts",
    "vitest.config.ts",
    "apps/app/test/setup.ts",
    "vitest.unit.config.ts",
    "eliza/agent/vitest.e2e.config.ts",
    "test/setup.ts",
    "apps/app/vitest.config.ts",
  ];
  for (const f of files) {
    await stripStubsFromConfig(path.resolve(f));
  }
}

main();
