import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  FullstackTemplateValues,
  PluginTemplateValues,
  ProjectTemplateMetadata,
  TemplateDefinition,
} from "./types.js";

const SKIP_NAMES = new Set([
  ".DS_Store",
  ".git",
  ".turbo",
  ".vite",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
  ".wasm",
  ".dylib",
  ".dll",
  ".so",
]);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function ensureGitRepository(projectRoot: string): void {
  const gitDir = path.join(projectRoot, ".git");
  if (!fs.existsSync(gitDir)) {
    execFileSync("git", ["init", "-q"], { cwd: projectRoot });
  }
}

function isBinaryFile(filePath: string, buffer: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return true;
  }
  return buffer.includes(0);
}

function replaceAll(text: string, replacements: Array<[string, string]>): string {
  let next = text;
  for (const [from, to] of replacements.sort((a, b) => b[0].length - a[0].length)) {
    next = next.split(from).join(to);
  }
  return next;
}

function normalizeKebabCase(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "project";
}

export function toDisplayName(value: string): string {
  return normalizeKebabCase(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildPluginTemplateValues(input: {
  githubUsername: string;
  pluginDescription: string;
  projectName: string;
  repoUrl: string;
}): PluginTemplateValues {
  const slug = normalizeKebabCase(input.projectName);
  const pluginBaseName = slug.startsWith("plugin-") ? slug : `plugin-${slug}`;
  return {
    displayName: toDisplayName(pluginBaseName.replace(/^plugin-/, "")),
    githubUsername: input.githubUsername,
    pluginBaseName,
    pluginDescription: input.pluginDescription,
    pluginSnake: pluginBaseName.replace(/-/g, "_"),
    repoUrl: input.repoUrl,
  };
}

export function buildFullstackTemplateValues(projectName: string): FullstackTemplateValues {
  const projectSlug = normalizeKebabCase(projectName);
  const packageScope = projectSlug.replace(/[^a-z0-9]/g, "");
  const appName = toDisplayName(projectSlug);
  const appUrl = `https://example.com/${projectSlug}`;
  return {
    appName,
    appUrl,
    bugReportUrl: `https://github.com/your-org/${projectSlug}/issues/new`,
    bundleId: `com.example.${packageScope || "app"}`,
    docsUrl: `${appUrl}/docs`,
    fileExtension: `.${projectSlug}.agent`,
    hashtag: `#${appName.replace(/\s+/g, "")}`,
    orgName: "your-org",
    packageScope: packageScope || "app",
    projectSlug,
    releaseBaseUrl: `${appUrl}/releases/`,
    repoName: projectSlug,
  };
}

export function getPluginReplacementEntries(
  values: PluginTemplateValues,
): Array<[string, string]> {
  const rustPluginName = `rust-${values.pluginBaseName}`;
  const pythonPluginName = `python-${values.pluginBaseName}`;
  const pythonSnake = `python_${values.pluginSnake}`;
  return [
    ["${PLUGINNAME}", values.pluginBaseName],
    ["${PLUGINDESCRIPTION}", values.pluginDescription],
    ["${GITHUB_USERNAME}", values.githubUsername],
    ["${REPO_URL}", values.repoUrl],
    ["@elizaos/rust-plugin-starter", `@elizaos/${rustPluginName}`],
    ["@elizaos/plugin-starter", `@elizaos/${values.pluginBaseName}`],
    ["elizaos_plugin_starter", `elizaos_${values.pluginSnake}`],
    ["elizaos-plugin-starter", `elizaos-${values.pluginBaseName}`],
    ["rust_plugin_starter", `rust_${values.pluginSnake}`],
    ["python_plugin_starter", pythonSnake],
    ["rust-plugin-starter", rustPluginName],
    ["python-plugin-starter", pythonPluginName],
    ["plugin_starter", values.pluginSnake],
    ["plugin-starter", values.pluginBaseName],
    ["Plugin starter", `${values.displayName} plugin`],
    ["plugin starter", `${values.displayName.toLowerCase()} plugin`],
    ["plugin starter template", `${values.displayName.toLowerCase()} plugin template`],
  ];
}

export function getFullstackReplacementEntries(
  values: FullstackTemplateValues,
): Array<[string, string]> {
  return [
    ["__PROJECT_SLUG__", values.projectSlug],
    ["__APP_NAME__", values.appName],
    ["@elizaos/electrobun", `${values.projectSlug}-electrobun`],
    ["@elizaos/app", `${values.projectSlug}-app`],
    ["https://github.com/elizaos/eliza/issues/new?template=bug_report.yml", values.bugReportUrl],
    ["https://docs.eliza.app", values.docsUrl],
    ["https://app.eliza.app", values.appUrl],
    ["https://eliza.app/releases/", values.releaseBaseUrl],
    ["https://eliza.app/", `${values.appUrl}/`],
    ['orgName: "eliza-ai"', `orgName: "${values.orgName}"`],
    ['repoName: "eliza"', `repoName: "${values.repoName}"`],
    ['packageScope: "elizaos"', `packageScope: "${values.packageScope}"`],
    ['fileExtension: ".eliza-agent"', `fileExtension: "${values.fileExtension}"`],
    ['hashtag: "#ElizaAgent"', `hashtag: "${values.hashtag}"`],
    ["com.elizaos.eliza", values.bundleId],
    ["Eliza", values.appName],
  ];
}

export function getTemplateReplacementEntries(options: {
  templateId: TemplateDefinition["id"];
  values: Record<string, string>;
}): Array<[string, string]> {
  if (options.templateId === "plugin") {
    return getPluginReplacementEntries(
      options.values as unknown as PluginTemplateValues,
    );
  }
  return getFullstackReplacementEntries(
    options.values as unknown as FullstackTemplateValues,
  );
}

export function resolveTemplateSourceDir(options: {
  language?: string;
  template: TemplateDefinition;
  templatesDir: string;
}): string {
  const templateRoot = path.join(options.templatesDir, options.template.id);
  if (options.template.id !== "plugin") {
    return templateRoot;
  }
  return path.join(templateRoot, options.language ?? "typescript");
}

function copyRenderedTreeInternal(
  sourceDir: string,
  destinationDir: string,
  replacements: Array<[string, string]>,
  managedFiles: Record<string, string>,
  rootDir: string,
): void {
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name) || entry.name === "template.json") {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyRenderedTreeInternal(
        sourcePath,
        destinationPath,
        replacements,
        managedFiles,
        rootDir,
      );
      continue;
    }

    const relativePath = path.relative(rootDir, destinationPath);
    const buffer = fs.readFileSync(sourcePath);
    if (isBinaryFile(sourcePath, buffer)) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, buffer);
      managedFiles[relativePath] = sha256(buffer);
      continue;
    }

    const rendered = replaceAll(buffer.toString("utf-8"), replacements);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, rendered, "utf-8");
    managedFiles[relativePath] = sha256(rendered);
  }
}

export function renderTemplateTree(options: {
  destinationDir: string;
  replacements: Array<[string, string]>;
  sourceDir: string;
}): Record<string, string> {
  const managedFiles: Record<string, string> = {};
  copyRenderedTreeInternal(
    options.sourceDir,
    options.destinationDir,
    options.replacements,
    managedFiles,
    options.destinationDir,
  );
  return managedFiles;
}

export function createRenderedTempDir(options: {
  replacements: Array<[string, string]>;
  sourceDir: string;
}): { dir: string; managedFiles: Record<string, string> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elizaos-template-"));
  const managedFiles = renderTemplateTree({
    destinationDir: dir,
    replacements: options.replacements,
    sourceDir: options.sourceDir,
  });
  return { dir, managedFiles };
}

export function buildMetadata(options: {
  cliVersion: string;
  language?: string;
  managedFiles: Record<string, string>;
  template: TemplateDefinition;
  values: Record<string, string>;
}): ProjectTemplateMetadata {
  const now = new Date().toISOString();
  return {
    cliVersion: options.cliVersion,
    createdAt: now,
    language: options.language,
    managedFiles: options.managedFiles,
    templateId: options.template.id,
    templateVersion: options.template.version,
    updatedAt: now,
    values: options.values,
  };
}

export function updateManagedFiles(options: {
  currentMetadata: ProjectTemplateMetadata;
  dryRun?: boolean;
  projectRoot: string;
  renderedDir: string;
  renderedManagedFiles: Record<string, string>;
}): {
  conflicts: string[];
  created: string[];
  deleted: string[];
  nextManagedFiles: Record<string, string>;
  unchanged: string[];
  updated: string[];
} {
  const conflicts: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];
  const updated: string[] = [];
  const nextManagedFiles = { ...options.renderedManagedFiles };

  const previousFiles = options.currentMetadata.managedFiles;
  const allManagedPaths = new Set([
    ...Object.keys(previousFiles),
    ...Object.keys(options.renderedManagedFiles),
  ]);

  for (const relativePath of allManagedPaths) {
    const projectPath = path.join(options.projectRoot, relativePath);
    const renderedPath = path.join(options.renderedDir, relativePath);
    const previousHash = previousFiles[relativePath];
    const nextHash = options.renderedManagedFiles[relativePath];
    const hasCurrentFile = fs.existsSync(projectPath);
    const hasRenderedFile = fs.existsSync(renderedPath);
    const currentHash = hasCurrentFile ? sha256(fs.readFileSync(projectPath)) : "";

    if (previousHash && !hasRenderedFile) {
      if (currentHash && currentHash !== previousHash) {
        conflicts.push(relativePath);
        delete nextManagedFiles[relativePath];
        continue;
      }
      deleted.push(relativePath);
      delete nextManagedFiles[relativePath];
      if (!options.dryRun && fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { force: true });
      }
      continue;
    }

    if (!previousHash && nextHash) {
      if (currentHash && currentHash !== nextHash) {
        conflicts.push(relativePath);
        continue;
      }
      created.push(relativePath);
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(projectPath), { recursive: true });
        fs.copyFileSync(renderedPath, projectPath);
      }
      continue;
    }

    if (currentHash === previousHash) {
      if (currentHash === nextHash) {
        unchanged.push(relativePath);
        continue;
      }
      updated.push(relativePath);
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(projectPath), { recursive: true });
        fs.copyFileSync(renderedPath, projectPath);
      }
      continue;
    }

    if (currentHash === nextHash) {
      unchanged.push(relativePath);
      continue;
    }

    conflicts.push(relativePath);
    delete nextManagedFiles[relativePath];
  }

  return {
    conflicts,
    created,
    deleted,
    nextManagedFiles,
    unchanged,
    updated,
  };
}

export function initializeGitSubmodule(options: {
  branch?: string;
  projectRoot: string;
  repo: string;
  submodulePath: string;
}): void {
  ensureGitRepository(options.projectRoot);

  const submoduleRoot = path.join(options.projectRoot, options.submodulePath);
  if (fs.existsSync(submoduleRoot)) {
    return;
  }

  const args = ["submodule", "add", "--depth", "1"];
  if (options.branch?.trim()) {
    args.push("-b", options.branch.trim());
  }
  args.push(options.repo, options.submodulePath);
  execFileSync("git", args, { cwd: options.projectRoot, stdio: "inherit" });
}

export function updateGitSubmodule(options: {
  branch?: string;
  dryRun?: boolean;
  projectRoot: string;
  repo: string;
  submodulePath: string;
}): void {
  if (options.dryRun) {
    return;
  }

  ensureGitRepository(options.projectRoot);
  const submoduleRoot = path.join(options.projectRoot, options.submodulePath);
  if (!fs.existsSync(submoduleRoot)) {
    initializeGitSubmodule({
      branch: options.branch,
      projectRoot: options.projectRoot,
      repo: options.repo,
      submodulePath: options.submodulePath,
    });
    return;
  }

  execFileSync(
    "git",
    ["submodule", "update", "--init", "--remote", options.submodulePath],
    { cwd: options.projectRoot, stdio: "inherit" },
  );
}
