import { createHash } from "node:crypto";
import { realpath, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type LocalArtifactMode = "local" | "production";

export interface LocalArtifactPin {
  label: string;
  mode: LocalArtifactMode;
  allowedRoot: string;
  entryPath: string;
  sha256ByRelativePath: Readonly<Record<string, string>>;
}

// This is intentionally not caller configuration. The sole local exception
// is the one-file Task9 SDK bundle reviewed for this rehearsal; all other
// pins reject node:module/createRequire rather than trying to prove arbitrary
// resolver aliases with a lightweight scanner.
const APPROVED_TASK9_SDK_COMPILER_BUNDLE_SHA256 =
  "1505489aac82a268d76a39d1b7a1b372750763f9d8a758dc7ad3ea927ffa8b5e";

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== "..";
}

async function hashFile(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function assertApprovedTask9SdkCompilerHelper(source: string): void {
  const moduleImport = 'import{createRequire}from"node:module";';
  const resolverDeclaration = "var __require=createRequire(import.meta.url);";
  if (!source.startsWith(moduleImport) || source.indexOf(resolverDeclaration) < moduleImport.length) {
    throw new Error("approved Task9 SDK bundle does not have the reviewed compiler-helper shape");
  }
  const createRequireUses = source.match(/\bcreateRequire\b/g) ?? [];
  if (createRequireUses.length !== 2) {
    throw new Error("approved Task9 SDK bundle has an unexpected createRequire use");
  }
  const helperCalls = [...source.matchAll(/\b__require\(([^)]*)\)/g)];
  const helperUses = source.match(/\b__require\b/g) ?? [];
  if (helperUses.length !== helperCalls.length + 1) {
    throw new Error("approved Task9 SDK bundle has an indirect compiler resolver use");
  }
  for (const match of helperCalls) {
    const expression = match[1]?.trim() ?? "";
    const literal = /^(?:"([^"\\]*)"|'([^'\\]*)')$/.exec(expression);
    const specifier = literal?.[1] ?? literal?.[2];
    if (!specifier || !specifier.startsWith("node:")) {
      throw new Error("approved Task9 SDK bundle has a non-node compiler helper require");
    }
  }
}

function findImportSpecifiers(
  source: string,
  allowApprovedTask9SdkCompilerHelper: boolean,
): string[] {
  // This is intentionally a small, fail-closed scanner rather than a general
  // JavaScript parser. It recognizes comments that occur before a top-level
  // module token, so a leading comment cannot hide a static import. A comment
  // after an import/export/require token remains rejected rather than parsed.
  if (/\b(?:import|export|require|__require)\s*(?:\/\*|\/\/)/.test(source)) {
    throw new Error("local artifact closure rejects comment-adjacent import syntax");
  }
  const specifiers = new Set<string>();
  const staticPattern = /(?:^|[;}\n])(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*(?:import|export)\s*(?:[^"'`;]*?\bfrom\s*)?["']([^"']+)["']/g;
  for (const match of source.matchAll(staticPattern)) {
    const specifier = match[1];
    if (specifier) specifiers.add(specifier);
  }

  const dynamicPattern = /\bimport\s*\(([^)]*)\)/g;
  for (const match of source.matchAll(dynamicPattern)) {
    const expression = match[1]?.trim() ?? "";
    const literal = /^(?:"([^"\\]*)"|'([^'\\]*)')$/.exec(expression);
    if (!literal) {
      throw new Error("local artifact closure rejects non-literal dynamic imports");
    }
    specifiers.add(literal[1] ?? literal[2] ?? "");
  }

  if (/(?:^|[^A-Za-z0-9_$])require\s*\(/.test(source)) {
    throw new Error("local artifact closure rejects CommonJS require imports");
  }
  const usesCompilerResolver = /\b(?:createRequire|__require)\b/.test(source);
  if (usesCompilerResolver && !allowApprovedTask9SdkCompilerHelper) {
    throw new Error(
      "local artifact closure rejects node:module/createRequire outside the immutable approved Task9 SDK bundle",
    );
  }
  if (allowApprovedTask9SdkCompilerHelper) {
    assertApprovedTask9SdkCompilerHelper(source);
    for (const match of source.matchAll(/\b__require\(([^)]*)\)/g)) {
      const expression = match[1]?.trim() ?? "";
      const literal = /^(?:"([^"\\]*)"|'([^'\\]*)')$/.exec(expression);
      if (!literal) {
        throw new Error("approved Task9 SDK bundle has a non-literal compiler helper require");
      }
      specifiers.add(literal[1] ?? literal[2] ?? "");
    }
  }
  return [...specifiers];
}

/**
 * Verifies a local development artifact before it can be consumed. The
 * returned realpath is deliberately not a package resolution result.
 *
 * closed, realpath-contained file set. There are no production defaults and
 * no package-manager resolution on this path.
 */
export async function verifyPinnedLocalArtifact(
  pin: LocalArtifactPin,
): Promise<string> {
  if (pin.mode !== "local" || process.env.NODE_ENV === "production") {
    throw new Error(`${pin.label} is local-only and cannot load in production`);
  }

  const root = await realpath(pin.allowedRoot);
  const entry = await realpath(pin.entryPath);
  if (!isInside(root, entry)) {
    throw new Error(`${pin.label} entry is outside its allowed local root`);
  }

  const closure = Object.entries(pin.sha256ByRelativePath);
  if (closure.length === 0) {
    throw new Error(`${pin.label} requires a non-empty SHA-256 closure`);
  }

  const declaredPaths = new Map<string, string>();
  for (const [relativePath, expectedDigest] of closure) {
    if (!relativePath || path.isAbsolute(relativePath) || !isSha256(expectedDigest)) {
      throw new Error(`${pin.label} has an invalid local artifact pin`);
    }
    const declaredPath = await realpath(path.resolve(root, relativePath));
    if (!isInside(root, declaredPath)) {
      throw new Error(`${pin.label} closure escapes its allowed local root`);
    }
    if (declaredPaths.has(declaredPath)) {
      throw new Error(`${pin.label} has duplicate realpaths in its SHA-256 closure`);
    }
    const actualDigest = await hashFile(declaredPath);
    if (actualDigest !== expectedDigest) {
      throw new Error(`${pin.label} SHA-256 mismatch for ${relativePath}`);
    }
    declaredPaths.set(declaredPath, relativePath);
  }

  if (!declaredPaths.has(entry)) {
    throw new Error(`${pin.label} entry is absent from its SHA-256 closure`);
  }

  const isApprovedTask9SdkCompilerBundle =
    declaredPaths.size === 1 &&
    declaredPaths.has(entry) &&
    Object.values(pin.sha256ByRelativePath).length === 1 &&
    Object.values(pin.sha256ByRelativePath)[0] === APPROVED_TASK9_SDK_COMPILER_BUNDLE_SHA256;

  for (const [modulePath, relativePath] of declaredPaths) {
    if (!/\.(?:[cm]?js|tsx?)$/.test(modulePath)) continue;
    const source = await readFile(modulePath, "utf8");
    const allowApprovedTask9SdkCompilerHelper =
      isApprovedTask9SdkCompilerBundle && modulePath === entry;
    for (const specifier of findImportSpecifiers(source, allowApprovedTask9SdkCompilerHelper)) {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const importedPath = await realpath(
          path.resolve(path.dirname(modulePath), specifier),
        );
        if (!isInside(root, importedPath)) {
          throw new Error(`${pin.label} import escapes its allowed local root`);
        }
        if (!declaredPaths.has(importedPath)) {
          throw new Error(
            `${pin.label} import ${specifier} from ${relativePath} is not present in its SHA-256 closure`,
          );
        }
        continue;
      }
      if (
        !specifier.startsWith("node:") ||
        (specifier === "node:module" && !allowApprovedTask9SdkCompilerHelper)
      ) {
        throw new Error(`${pin.label} has an unapproved external import ${specifier}`);
      }
    }
  }

  return entry;
}

/** Loads a verified ESM artifact. The closure is checked before evaluation. */
export async function loadPinnedLocalModule<T>(
  pin: LocalArtifactPin,
): Promise<T> {
  const entry = await verifyPinnedLocalArtifact(pin);
  return (await import(pathToFileURL(entry).href)) as T;
}

/** Reads a verified JSON artifact without evaluating it as executable code. */
export async function readPinnedLocalJson<T>(
  pin: LocalArtifactPin,
): Promise<T> {
  const entry = await verifyPinnedLocalArtifact(pin);
  try {
    return JSON.parse(await readFile(entry, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `${pin.label} is not valid pinned JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
