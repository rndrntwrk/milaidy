import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CLASSIFICATIONS = new Set([
  "core",
  "delegated",
  "platform-incompatible",
  "policy-disabled",
]);
const STUB_VERSION = /^0\.0\.0-(?:cloud-)?stub$|^0\.0\.0-milady-stub$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function sha256(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalAliceCapabilityBom(bom) {
  return `${JSON.stringify(canonicalValue(bom))}\n`;
}

export function digestAliceCapabilityBom(bytes) {
  if (typeof bytes !== "string" || !bytes.endsWith("\n") || bytes.endsWith("\n\n")) {
    throw new Error("ALICE_CAPABILITY_BOM_INVALID");
  }
  return sha256(bytes);
}

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolveInside(root, relativePath, missingCode, escapeCode) {
  const candidate = path.resolve(root, relativePath);
  if (!within(root, candidate)) throw new Error(escapeCode);
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    throw new Error(missingCode);
  }
  if (!within(root, resolved)) throw new Error(escapeCode);
  if (!fs.statSync(resolved).isFile()) throw new Error(missingCode);
  return resolved;
}

function packageRoot(root, packageName) {
  const candidate = path.resolve(root, "node_modules", ...packageName.split("/"));
  if (!within(root, candidate)) throw new Error("ALICE_CAPABILITY_PACKAGE_PATH_ESCAPE");
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    throw new Error("ALICE_CAPABILITY_PACKAGE_MISSING");
  }
  const nodeModulesRoot = fs.realpathSync(path.join(root, "node_modules"));
  if (!within(nodeModulesRoot, resolved)) {
    throw new Error("ALICE_CAPABILITY_PACKAGE_PATH_ESCAPE");
  }
  return resolved;
}

function selectExportTarget(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const condition of ["node", "import", "default", "bun", "eliza-source"]) {
    const selected = selectExportTarget(value[condition]);
    if (selected) return selected;
  }
  return null;
}

function resolvePackageEntrypoint(root, source, packageJson) {
  const pkgRoot = packageRoot(root, source.package);
  const requested = source.entrypoint ?? ".";
  let target = null;
  if (requested === ".") {
    const exportsRoot = packageJson.exports?.["."] ?? packageJson.exports;
    target = selectExportTarget(exportsRoot) ?? packageJson.module ?? packageJson.main;
  } else {
    target = selectExportTarget(packageJson.exports?.[requested]);
  }
  if (typeof target !== "string" || !target) {
    throw new Error("ALICE_CAPABILITY_ENTRYPOINT_MISSING");
  }
  const candidate = path.resolve(pkgRoot, target);
  if (!within(pkgRoot, candidate)) {
    throw new Error("ALICE_CAPABILITY_ENTRYPOINT_ESCAPE");
  }
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    throw new Error("ALICE_CAPABILITY_ENTRYPOINT_MISSING");
  }
  if (!within(pkgRoot, resolved)) {
    throw new Error("ALICE_CAPABILITY_ENTRYPOINT_ESCAPE");
  }
  if (!fs.statSync(resolved).isFile()) {
    throw new Error("ALICE_CAPABILITY_ENTRYPOINT_MISSING");
  }
  return { packageRoot: pkgRoot, entrypoint: resolved };
}

function packageFileRecords(pkgRoot) {
  const records = [];
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (name === "node_modules") continue;
      const absolutePath = path.join(directory, name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        const resolved = fs.realpathSync(absolutePath);
        if (!within(pkgRoot, resolved)) {
          throw new Error("ALICE_CAPABILITY_PACKAGE_PATH_ESCAPE");
        }
        throw new Error("ALICE_CAPABILITY_PACKAGE_SYMLINK_INVALID");
      }
      if (stat.isDirectory()) visit(absolutePath);
      if (stat.isFile()) {
        const bytes = fs.readFileSync(absolutePath);
        records.push({
          path: path.relative(pkgRoot, absolutePath).split(path.sep).join("/"),
          sha256: sha256(bytes),
          size: bytes.byteLength,
        });
      }
    }
  };
  visit(pkgRoot);
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

function packageRecordsDigest(records) {
  return sha256(`${records.map((record) => `${record.path}\0${record.size}\0${record.sha256}`).join("\n")}\n`);
}

function runtimeObjects(moduleNamespace, runtimeNames) {
  const candidates = [moduleNamespace.default, ...Object.values(moduleNamespace)].filter(
    (value) => value && typeof value === "object" && !Array.isArray(value),
  );
  return candidates.filter((value) => {
    if (typeof value.name !== "string") return false;
    return runtimeNames.length === 0 || runtimeNames.includes(value.name);
  });
}

function hasCallableSurface(plugin) {
  for (const field of ["actions", "providers", "services", "models", "evaluators", "routes"]) {
    const value = plugin[field];
    if (Array.isArray(value) && value.length > 0) return true;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Reflect.ownKeys(value).length > 0
    ) return true;
  }
  if (plugin.events && typeof plugin.events === "object" && Reflect.ownKeys(plugin.events).length > 0) {
    return true;
  }
  return typeof plugin.init === "function" || Boolean(plugin.adapter) || Boolean(plugin.schema);
}

function validatePolicy(policy) {
  if (policy?.schemaVersion !== "alice.capability-policy.v1" || !Array.isArray(policy.entries)) {
    throw new Error("ALICE_CAPABILITY_POLICY_INVALID");
  }
  const ids = new Set();
  for (const entry of policy.entries) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      ids.has(entry.id) ||
      !CLASSIFICATIONS.has(entry.classification) ||
      !entry.source ||
      typeof entry.source.type !== "string" ||
      !Array.isArray(entry.runtimeNames) ||
      [...entry.runtimeNames].sort().join("\0") !== entry.runtimeNames.join("\0") ||
      new Set(entry.runtimeNames).size !== entry.runtimeNames.length
    ) {
      throw new Error("ALICE_CAPABILITY_POLICY_INVALID");
    }
    ids.add(entry.id);
  }
  return new Map(policy.entries.map((entry) => [entry.id, entry]));
}

function capabilityPackageName(name) {
  return (
    /^@(?:elizaos|miladyai|rndrntwrk)\/(?:plugin-|app-)/.test(name) ||
    /^@huggingface\//.test(name) ||
    /^onnxruntime(?:-|$)/.test(name)
  );
}

export function discoverAliceCapabilityInputs(root, policy) {
  const canonicalRoot = fs.realpathSync(root);
  const packageNames = new Set();
  const scanScope = (scopeName) => {
    const scopeRoot = path.join(canonicalRoot, "node_modules", scopeName);
    if (!fs.existsSync(scopeRoot)) return;
    for (const child of fs.readdirSync(scopeRoot)) {
      const packageJsonPath = path.join(scopeRoot, child, "package.json");
      if (!fs.existsSync(packageJsonPath)) continue;
      const name = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).name;
      if (capabilityPackageName(name)) packageNames.add(name);
    }
  };
  for (const scope of ["@elizaos", "@miladyai", "@rndrntwrk", "@huggingface"]) {
    scanScope(scope);
  }
  const nodeModulesRoot = path.join(canonicalRoot, "node_modules");
  if (fs.existsSync(nodeModulesRoot)) {
    for (const child of fs.readdirSync(nodeModulesRoot)) {
      if (child.startsWith("@")) continue;
      const packageJsonPath = path.join(nodeModulesRoot, child, "package.json");
      if (!fs.existsSync(packageJsonPath)) continue;
      const name = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).name;
      if (capabilityPackageName(name)) packageNames.add(name);
    }
  }
  const internalCapabilityIds = policy.entries
    .filter((entry) => entry.source.type !== "package")
    .map((entry) => entry.id);
  return {
    packageNames: [...packageNames].sort(),
    internalCapabilityIds: [...new Set(internalCapabilityIds)].sort(),
  };
}

async function buildPackageEntry(root, entry) {
  const pkgRoot = packageRoot(root, entry.source.package);
  const packageJson = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
  if (packageJson.name !== entry.source.package || STUB_VERSION.test(packageJson.version ?? "")) {
    throw new Error("ALICE_CAPABILITY_STUB_REJECTED");
  }
  const { entrypoint } = resolvePackageEntrypoint(root, entry.source, packageJson);
  const moduleNamespace = await import(`${pathToFileURL(entrypoint).href}?alice_bom=${sha256(fs.readFileSync(entrypoint))}`);
  const objects = runtimeObjects(moduleNamespace, entry.runtimeNames);
  const observedRuntimeNames = [
    ...new Set(objects.map((plugin) => plugin.name)),
  ].sort();
  if (
    entry.runtimeNames.some((name) => /(?:^|-)stub$/i.test(name)) ||
    objects.some((plugin) => /(?:^|-)stub$/i.test(plugin.name))
  ) {
    throw new Error("ALICE_CAPABILITY_STUB_REJECTED");
  }
  const implementationCallable =
    entry.surface === "module"
      ? Reflect.ownKeys(moduleNamespace).length > 0
      : objects.some(hasCallableSurface);
  if (!implementationCallable) {
    throw new Error("ALICE_CAPABILITY_CORE_SURFACE_EMPTY");
  }
  const files = packageFileRecords(pkgRoot);
  return {
    id: entry.id,
    classification: entry.classification,
    identity: `${packageJson.name}@${packageJson.version}`,
    surface: entry.surface,
    runtimeNames: observedRuntimeNames,
    installed: true,
    implementationCallable,
    adapter: entry.adapter,
    policyState: entry.policyState,
    files,
    packageSha256: packageRecordsDigest(files),
    entrypointSha256: sha256(fs.readFileSync(entrypoint)),
  };
}

async function buildNonPackageEntry(root, entry) {
  for (const prohibitedPackage of entry.prohibitedPackages ?? []) {
    const packageJsonPath = path.join(root, "node_modules", ...prohibitedPackage.split("/"), "package.json");
    if (fs.existsSync(packageJsonPath)) {
      throw new Error("ALICE_CAPABILITY_PRIVILEGED_IMPLEMENTATION_PRESENT");
    }
  }
  if (entry.source.type === "platform") {
    return {
      id: entry.id,
      classification: entry.classification,
      identity: `${entry.id}@${entry.source.platform}`,
      surface: "platform",
      runtimeNames: [],
      installed: false,
      implementationCallable: false,
      adapter: entry.adapter,
      policyState: entry.policyState,
      files: [],
      packageSha256: null,
      entrypointSha256: null,
      replacedPackages: [...(entry.prohibitedPackages ?? [])].sort(),
    };
  }
  const absolutePath = resolveInside(
    root,
    entry.source.path,
    "ALICE_CAPABILITY_ADAPTER_MISSING",
    "ALICE_CAPABILITY_ENTRYPOINT_ESCAPE",
  );
  const moduleNamespace = await import(`${pathToFileURL(absolutePath).href}?alice_bom=${sha256(fs.readFileSync(absolutePath))}`);
  const descriptor = moduleNamespace[entry.source.export];
  if (entry.source.type === "internal") {
    if (
      !descriptor ||
      descriptor.callable !== true ||
      descriptor.schemaVersion !== "alice.internal-capability.v1" ||
      descriptor.id !== entry.source.identity
    ) {
      throw new Error("ALICE_CAPABILITY_INTERNAL_INVALID");
    }
  } else if (
    !descriptor ||
    descriptor.authenticated !== true ||
    descriptor.schemaVersion !== "alice.delegated-adapter.v1" ||
    descriptor.id !== entry.adapter
  ) {
    throw new Error("ALICE_CAPABILITY_ADAPTER_INVALID");
  }
  const bytes = fs.readFileSync(absolutePath);
  const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
  const files = [{ path: relativePath, sha256: sha256(bytes), size: bytes.byteLength }];
  return {
    id: entry.id,
    classification: entry.classification,
    identity: entry.source.type === "internal" ? entry.source.identity : entry.adapter,
    surface: entry.source.type,
    runtimeNames: [],
    installed: true,
    implementationCallable: true,
    adapter: entry.adapter,
    policyState: entry.policyState,
    files,
    packageSha256: sha256(bytes),
    entrypointSha256: sha256(bytes),
    replacedPackages: [...(entry.prohibitedPackages ?? [])].sort(),
  };
}

export async function generateAliceCapabilityBom({ root, policy, discovery }) {
  const canonicalRoot = fs.realpathSync(root);
  const byId = validatePolicy(policy);
  const resolvedDiscovery = discovery ?? discoverAliceCapabilityInputs(canonicalRoot, policy);
  const discoveredIds = new Set([
    ...resolvedDiscovery.packageNames.map((name) => `package:${name}`),
    ...resolvedDiscovery.internalCapabilityIds,
  ]);
  for (const id of discoveredIds) {
    if (!byId.has(id)) throw new Error("ALICE_CAPABILITY_CLASSIFICATION_MISSING");
  }
  for (const id of byId.keys()) {
    if (!discoveredIds.has(id)) throw new Error("ALICE_CAPABILITY_POLICY_STALE");
  }
  const entries = [];
  for (const id of [...discoveredIds].sort()) {
    const entry = byId.get(id);
    entries.push(
      entry.source.type === "package"
        ? await buildPackageEntry(canonicalRoot, entry)
        : await buildNonPackageEntry(canonicalRoot, entry),
    );
  }
  const bom = {
    schemaVersion: "alice.capability-bom.v1",
    entries: entries.sort((left, right) => left.id.localeCompare(right.id)),
  };
  const bytes = canonicalAliceCapabilityBom(bom);
  if (!DIGEST.test(digestAliceCapabilityBom(bytes))) {
    throw new Error("ALICE_CAPABILITY_BOM_INVALID");
  }
  return bom;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    const root = fs.realpathSync(process.env.ALICE_BUILD_ROOT || "/app");
    const policyPath = path.join(root, "deploy/alice/alice-capability-policy.v1.json");
    const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    const bom = await generateAliceCapabilityBom({ root, policy });
    const bytes = canonicalAliceCapabilityBom(bom);
    const outputPath = path.join(root, "alice-capability-bom.json");
    fs.writeFileSync(outputPath, bytes, { encoding: "utf8", mode: 0o444 });
    process.stdout.write(`${JSON.stringify({ path: outputPath, bomSha256: digestAliceCapabilityBom(bytes) })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
