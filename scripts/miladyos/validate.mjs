#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "com.miladyai.milady";
const APP_NAME = "Milady";
const PRODUCT_NAME = "milady_cf_x86_64_phone";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const vendorDir = path.join(repoRoot, "os", "android", "vendor", "milady");
const defaultApk = path.join(vendorDir, "apps", "Milady", "Milady.apk");

const requiredPermissions = [
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.CALL_PHONE",
  "android.permission.READ_PHONE_STATE",
  "android.permission.ANSWER_PHONE_CALLS",
  "android.permission.READ_CALL_LOG",
  "android.permission.WRITE_CALL_LOG",
  "android.permission.READ_SMS",
  "android.permission.SEND_SMS",
  "android.permission.RECEIVE_SMS",
  "android.permission.RECEIVE_MMS",
  "android.permission.RECEIVE_WAP_PUSH",
  "android.permission.POST_NOTIFICATIONS",
];

const requiredManifestMarkers = [
  "android.intent.category.HOME",
  "android.intent.action.ASSIST",
  "android.intent.action.DIAL",
  "android.provider.Telephony.SMS_DELIVER",
  "android.provider.Telephony.WAP_PUSH_DELIVER",
  "android.telecom.InCallService",
  "android.permission.BIND_INCALL_SERVICE",
  `${PACKAGE_NAME}.MiladyDialActivity`,
  `${PACKAGE_NAME}.MiladyAssistActivity`,
  `${PACKAGE_NAME}.MiladyInCallService`,
  `${PACKAGE_NAME}.MiladySmsReceiver`,
  `${PACKAGE_NAME}.MiladyMmsReceiver`,
  `${PACKAGE_NAME}.MiladyBootReceiver`,
];

function parseArgs(argv) {
  const args = {
    aospRoot: null,
    apk: defaultApk,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--aosp-root") {
      args.aospRoot = path.resolve(argv[++i] ?? "");
    } else if (arg === "--apk") {
      args.apk = path.resolve(argv[++i] ?? "");
    } else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: bun run miladyos:validate [--apk <APK>] [--aosp-root <AOSP_ROOT>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function fail(message) {
  throw new Error(`[miladyos:validate] ${message}`);
}

function assertFile(filePath, label = filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${label}: ${filePath}`);
  }
}

function read(filePath) {
  assertFile(filePath);
  return fs.readFileSync(filePath, "utf8");
}

function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) {
    fail(`${label} is missing ${needle}`);
  }
}

function assertMatches(content, pattern, label, description) {
  if (!pattern.test(content)) {
    fail(`${label} is missing ${description}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    fail(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
  });
  return !result.error;
}

function findFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, predicate, out);
    } else if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function compareVersions(a, b) {
  const aa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const delta = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function resolveAapt() {
  const explicit = process.env.AAPT;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const buildTools = path.join(sdkRoot, "build-tools");
    if (!fs.existsSync(buildTools)) continue;
    const versions = fs.readdirSync(buildTools).sort(compareVersions).reverse();
    for (const version of versions) {
      const candidate = path.join(buildTools, version, "aapt");
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  fail("Could not find aapt. Set AAPT or ANDROID_HOME/ANDROID_SDK_ROOT.");
}

function validateXmlFiles() {
  const xmlFiles = findFiles(vendorDir, (file) => file.endsWith(".xml"));
  if (xmlFiles.length === 0) fail("No XML files found under vendor/milady");
  if (!commandExists("xmllint")) {
    console.warn(
      "[miladyos:validate] xmllint unavailable; skipping XML parser validation.",
    );
    return;
  }
  run("xmllint", ["--noout", ...xmlFiles]);
  console.log(
    `[miladyos:validate] XML parse check passed for ${xmlFiles.length} file(s).`,
  );
}

function validateProductLayer() {
  const product = read(path.join(vendorDir, "products", `${PRODUCT_NAME}.mk`));
  assertIncludes(
    product,
    "device/google/cuttlefish/vsoc_x86_64_only/phone/aosp_cf.mk",
    "product",
  );
  assertIncludes(product, "PRODUCT_PACKAGES +=", "product");
  assertIncludes(product, "Milady", "product");
  assertIncludes(
    product,
    "default-permissions-com.miladyai.milady.xml",
    "product",
  );
  assertIncludes(
    product,
    "privapp-permissions-com.miladyai.milady.xml",
    "product",
  );
  assertIncludes(product, "vendor/milady/overlays/framework-res", "product");
  if (product.includes("PermissionController")) {
    fail(
      "product still references a PermissionController overlay; role defaults live in framework-res strings.",
    );
  }

  const androidProducts = read(path.join(vendorDir, "AndroidProducts.mk"));
  assertMatches(
    androidProducts,
    new RegExp(
      `PRODUCT_MAKEFILES\\s*:=\\s*\\\\?\\s*\\$\\(LOCAL_DIR\\)/products/${PRODUCT_NAME}\\.mk`,
    ),
    "AndroidProducts.mk",
    `PRODUCT_MAKEFILES entry for ${PRODUCT_NAME}`,
  );
  assertMatches(
    androidProducts,
    new RegExp(
      `COMMON_LUNCH_CHOICES\\s*:=\\s*\\\\?\\s*${PRODUCT_NAME}-userdebug`,
    ),
    "AndroidProducts.mk",
    `${PRODUCT_NAME}-userdebug lunch choice`,
  );

  const androidBp = read(path.join(vendorDir, "apps", "Milady", "Android.bp"));
  for (const marker of [
    "android_app_import",
    'name: "Milady"',
    'apk: "Milady.apk"',
    "privileged: true",
    'certificate: "platform"',
    '"Launcher3"',
    '"Launcher3QuickStep"',
    '"Dialer"',
    '"Messaging"',
    '"Contacts"',
  ]) {
    assertIncludes(androidBp, marker, "Milady Android.bp");
  }

  const frameworkConfig = read(
    path.join(
      vendorDir,
      "overlays",
      "framework-res",
      "res",
      "values",
      "config.xml",
    ),
  );
  for (const resourceName of [
    "config_defaultDialer",
    "config_defaultSms",
    "config_defaultAssistant",
  ]) {
    assertIncludes(
      frameworkConfig,
      `name="${resourceName}"`,
      "framework-res overlay",
    );
    assertIncludes(
      frameworkConfig,
      `>${PACKAGE_NAME}<`,
      "framework-res overlay",
    );
  }

  const obsoleteRoleFiles = findFiles(vendorDir, (file) =>
    file.endsWith(".xml"),
  ).filter((file) => /config_default.*RoleHolders/.test(read(file)));
  if (obsoleteRoleFiles.length > 0) {
    fail(
      `Obsolete PermissionController role-holder resources found: ${obsoleteRoleFiles.join(", ")}`,
    );
  }

  console.log("[miladyos:validate] Product layer checks passed.");
}

function validateDefaultPermissions() {
  const defaultPermissions = read(
    path.join(
      vendorDir,
      "permissions",
      `default-permissions-${PACKAGE_NAME}.xml`,
    ),
  );
  assertIncludes(
    defaultPermissions,
    `<exception package="${PACKAGE_NAME}">`,
    "default permissions",
  );
  for (const permission of requiredPermissions) {
    assertIncludes(
      defaultPermissions,
      `name="${permission}"`,
      "default permissions",
    );
  }

  const privPermissions = read(
    path.join(
      vendorDir,
      "permissions",
      `privapp-permissions-${PACKAGE_NAME}.xml`,
    ),
  );
  assertIncludes(
    privPermissions,
    `<privapp-permissions package="${PACKAGE_NAME}"`,
    "privapp permissions",
  );
  console.log("[miladyos:validate] Permission XML checks passed.");
}

function validateApk(apkPath) {
  assertFile(apkPath, "Milady APK");
  const aapt = resolveAapt();
  const badging = run(aapt, ["dump", "badging", apkPath]);
  assertIncludes(badging, `package: name='${PACKAGE_NAME}'`, "APK badging");
  assertIncludes(badging, `application-label:'${APP_NAME}'`, "APK badging");
  for (const permission of requiredPermissions) {
    assertIncludes(
      badging,
      `uses-permission: name='${permission}'`,
      "APK badging",
    );
  }

  const manifest = run(aapt, [
    "dump",
    "xmltree",
    apkPath,
    "AndroidManifest.xml",
  ]);
  for (const marker of requiredManifestMarkers) {
    assertIncludes(manifest, marker, "APK manifest");
  }
  console.log(`[miladyos:validate] APK checks passed with ${aapt}.`);
}

function validateAospRoot(aospRoot) {
  const buildEnvsetup = path.join(aospRoot, "build", "envsetup.sh");
  assertFile(buildEnvsetup, "AOSP build/envsetup.sh");

  const rolesXml = read(
    path.join(
      aospRoot,
      "packages",
      "modules",
      "Permission",
      "PermissionController",
      "res",
      "xml",
      "roles.xml",
    ),
  );
  assertIncludes(rolesXml, 'name="android.app.role.DIALER"', "AOSP roles.xml");
  assertIncludes(
    rolesXml,
    'defaultHolders="config_defaultDialer"',
    "AOSP roles.xml",
  );
  assertIncludes(rolesXml, 'name="android.app.role.SMS"', "AOSP roles.xml");
  assertIncludes(
    rolesXml,
    'defaultHolders="config_defaultSms"',
    "AOSP roles.xml",
  );
  assertIncludes(rolesXml, 'name="android.app.role.HOME"', "AOSP roles.xml");
  if (rolesXml.includes('defaultHolders="config_defaultHome')) {
    fail(
      "AOSP HOME role unexpectedly has a defaultHolders config; revisit MiladyOS home defaulting.",
    );
  }

  const frameworkConfig = read(
    path.join(
      aospRoot,
      "frameworks",
      "base",
      "core",
      "res",
      "res",
      "values",
      "config.xml",
    ),
  );
  for (const resourceName of [
    "config_defaultAssistant",
    "config_defaultDialer",
    "config_defaultSms",
  ]) {
    assertIncludes(
      frameworkConfig,
      `name="${resourceName}"`,
      "AOSP framework config.xml",
    );
  }

  console.log("[miladyos:validate] AOSP source compatibility checks passed.");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  validateXmlFiles();
  validateProductLayer();
  validateDefaultPermissions();
  validateApk(args.apk);
  if (args.aospRoot) {
    validateAospRoot(args.aospRoot);
  }
  console.log("[miladyos:validate] MiladyOS checks passed.");
}

main();
