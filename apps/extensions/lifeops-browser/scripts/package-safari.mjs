#!/usr/bin/env bun
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDir, "..");
const distDir = path.join(extensionRoot, "dist");
const safariDistDir = path.join(distDir, "safari");
const safariWorkDir = path.join(extensionRoot, "safari");
const generatedProjectDir = path.join(safariWorkDir, "generated");
const derivedDataDir = path.join(distDir, "safari-derived-data");
const artifactsDir = path.join(distDir, "artifacts");
const appName = "LifeOps Browser";
const bundleIdentifier = "ai.milady.lifeopsbrowser";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

async function findFileWithExtension(directory, extension) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.name.endsWith(extension)) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const nested = await findFileWithExtension(fullPath, extension);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

await run("bun", [path.join(scriptDir, "build.mjs"), "safari"], {
  cwd: extensionRoot,
});

await fs.mkdir(safariWorkDir, { recursive: true });
await fs.rm(generatedProjectDir, { recursive: true, force: true });
await fs.rm(derivedDataDir, { recursive: true, force: true });
await fs.mkdir(artifactsDir, { recursive: true });

await run("xcrun", [
  "safari-web-extension-converter",
  safariDistDir,
  "--project-location",
  generatedProjectDir,
  "--app-name",
  appName,
  "--bundle-identifier",
  bundleIdentifier,
  "--swift",
  "--macos-only",
  "--copy-resources",
  "--no-open",
  "--no-prompt",
  "--force",
]);

const projectPath = await findFileWithExtension(
  generatedProjectDir,
  ".xcodeproj",
);
if (!projectPath) {
  throw new Error("Failed to locate generated Safari Xcode project");
}

await run("xcodebuild", [
  "-project",
  projectPath,
  "-scheme",
  appName,
  "-configuration",
  "Release",
  "-destination",
  "platform=macOS",
  "-derivedDataPath",
  derivedDataDir,
  "CODE_SIGNING_ALLOWED=NO",
  "CODE_SIGNING_REQUIRED=NO",
  "CODE_SIGN_IDENTITY=",
  "build",
]);

const builtAppPath = await findFileWithExtension(
  path.join(derivedDataDir, "Build", "Products"),
  ".app",
);
if (!builtAppPath) {
  throw new Error("Failed to locate built Safari app bundle");
}

const artifactAppPath = path.join(artifactsDir, `${appName}.app`);
const artifactZipPath = path.join(artifactsDir, "lifeops-browser-safari.zip");
await fs.rm(artifactAppPath, { recursive: true, force: true });
await fs.rm(artifactZipPath, { force: true });
await fs.cp(builtAppPath, artifactAppPath, { recursive: true });

await run("ditto", [
  "-c",
  "-k",
  "--keepParent",
  artifactAppPath,
  artifactZipPath,
]);

console.log(`Packaged Safari app at ${artifactAppPath}`);
console.log(`Packaged Safari zip at ${artifactZipPath}`);
