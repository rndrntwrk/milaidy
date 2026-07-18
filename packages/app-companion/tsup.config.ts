import { existsSync, promises as fs, readdirSync } from "node:fs";
import path from "node:path";

const packageRoot = process.cwd();

function collectEntries(directory: string): string[] {
  if (!existsSync(directory)) {
    throw new Error(`Missing app-companion source directory: ${directory}`);
  }
  const entries: string[] = [];
  const walk = (currentDirectory: string) => {
    for (const entry of readdirSync(currentDirectory, {
      withFileTypes: true,
    })) {
      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(fullPath);
        continue;
      }
      if (
        /\.(ts|tsx)$/.test(entry.name) &&
        !/\.(d|test|spec)\.(ts|tsx)$/.test(entry.name)
      ) {
        entries.push(
          path.relative(packageRoot, fullPath).split(path.sep).join("/"),
        );
      }
    }
  };
  walk(directory);
  if (entries.length === 0) {
    throw new Error(`No app-companion source entries under ${directory}`);
  }
  return entries;
}

const rewriteRelativeTypeScriptExtensions = {
  name: "rewrite-relative-typescript-extensions",
  setup(build: {
    onLoad: (
      options: { filter: RegExp },
      callback: (args: { path: string }) => Promise<{
        contents: string;
        loader: "ts" | "tsx";
      }>,
    ) => void;
  }) {
    build.onLoad({ filter: /\.(ts|tsx)$/ }, async ({ path: sourcePath }) => {
      const source = await fs.readFile(sourcePath, "utf8");
      return {
        contents: source.replace(
          /((?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bexport\s+(?:\*|\{[^}]*\})\s+from\s+)["'])(\.\.?\/[^"']+?)\.(tsx?)(["'])/g,
          "$1$2.js$4",
        ),
        loader: sourcePath.endsWith(".tsx") ? "tsx" : "ts",
      };
    });
  },
};

export default {
  entry: collectEntries(path.join(packageRoot, "src")),
  outDir: "dist",
  format: ["esm"],
  clean: true,
  sourcemap: true,
  dts: false,
  bundle: false,
  splitting: false,
  treeshake: false,
  external: [/^@elizaos\//, /^@miladyai\//, /^node:/],
  esbuildPlugins: [rewriteRelativeTypeScriptExtensions],
  esbuildOptions(options: { jsx?: string; packages?: string }) {
    options.jsx ??= "automatic";
    options.packages = "external";
    return options;
  },
};
