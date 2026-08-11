import path from "node:path";
import type {
  ControllerArtifactManifestPort,
  GameplayClientPort,
} from "./gameplay-client-port.js";
import type {
  DeterministicControllerPort,
  GameAdapterPort,
  GameplayRehearsalDependencies,
} from "./drive555-rehearsal-supervisor.js";
import {
  loadPinnedLocalModule,
  readPinnedLocalJson,
  type LocalArtifactPin,
} from "./local-artifact-loader.js";

const TASK9_SDK_BUNDLE_SHA256 =
  "1505489aac82a268d76a39d1b7a1b372750763f9d8a758dc7ad3ea927ffa8b5e";
const TASK3_ADAPTER_MANIFEST_DIGEST =
  "8ccc180da4b040803dedbf13d1ba68bb0fdf62ff2ac3f09204ab1faab72f7362";
const TASK3_INITIAL_FIXTURE_DIGEST =
  "8c71295c3791e7ad062981fc852463beb241d2e3a40a885ff2ce18ab4a896bd5";
export const DRIVE555_APPROVED_CONTROLLER_TRUST_PINS = Object.freeze({
  artifactDigest:
    "30c6037daf09286f7d2c3171257b8786514c77c537be47a0845461575183b22e",
  manifestSha256:
    "53780dacb0632bb53a7b953ca76714499bf2bb8d9b7a1e1379dae08fe495e3b8",
  runtimeSha256:
    "583add96f83945c3ee56d18cbc760dec6cca5647ee70548305e6c0dc577c316a",
});
const TASK3_CONTROLLER_ARTIFACT_DIGEST =
  DRIVE555_APPROVED_CONTROLLER_TRUST_PINS.artifactDigest;
const TASK3_RACING_LINE_SHA256 =
  DRIVE555_APPROVED_CONTROLLER_TRUST_PINS.runtimeSha256;
/**
 * Task 8 native trust pins approved at native HEAD 85457b2.  These are not
 * caller configuration: a local rehearsal may select local artifact paths,
 * but it may never select the native source it trusts.
 */
const TASK9_NATIVE_BRIDGE_SHA256 =
  "00c4b608bd2de966e4da6f3904b555639be9ab8261af679f9c5c2c7aa648af49";
/**
 * Canonical source-anchor encoding is
 * sha256(JSON.stringify(Object.fromEntries(sorted full repo-relative path -> file sha256 map))).
 */
export const DRIVE555_NATIVE_SOURCE_ANCHOR_FILE_SHA256_BY_REPO_PATH_V1 = Object.freeze({
  "apps/web/public/games/555drive/agent-bridge.js":
    "00c4b608bd2de966e4da6f3904b555639be9ab8261af679f9c5c2c7aa648af49",
  "apps/web/public/games/555drive/code/game.js":
    "8105e964ff6e318c12499bcc44b3d4f07dcfc68fcec1a3f22be03ac629b519f3",
  "apps/web/public/games/555drive/code/vehicle.js":
    "f0fd83407546a7bac05566d8b2b3eb355107bedae6402187bd0a71168a207767",
  "apps/web/public/games/555drive/index.html":
    "536dbb9bed90162d3d9d52b9c66eb0d4b765f6e6736277ded55541d113ea4c10",
});
export const DRIVE555_NATIVE_SOURCE_ANCHOR_SET_V1 = Object.freeze([
  "agent-bridge.js",
  "code/game.js",
  "code/vehicle.js",
  "index.html",
] as const);
const TASK9_NATIVE_SOURCE_ANCHOR_SET_SHA256 =
  "e666ec633a9ed3877f49627a92c6c56d76dfcc2dd0f37edbc64fc80444119d4f";
export const DRIVE555_APPROVED_NATIVE_TRUST_PINS = Object.freeze({
  bridgeDigest: TASK9_NATIVE_BRIDGE_SHA256,
  sourceAnchorDigest: TASK9_NATIVE_SOURCE_ANCHOR_SET_SHA256,
});

const ARCADE_ADAPTER_CLOSURE: Readonly<Record<string, string>> = {
  "dist/gameplay-core/games/555drive/adapter.js":
    "786d92c073eaa562123d744c7379e8be8587473940ac80301a7a5fd9b30539ad",
  "dist/gameplay-core/validators.js":
    "d062db482017b89cf92955c6190d359633f8a229bb0fe4cbf241de4c3d731360",
  "dist/gameplay-core/canonical.js":
    "f9b4ac2c52d0095eb17f0a927349a208a2d799814bdee1ab9886bd61d0de2974",
};

const CONTROLLER_MANIFEST_SHA256 =
  DRIVE555_APPROVED_CONTROLLER_TRUST_PINS.manifestSha256;

export interface Drive555LocalArtifactConfig {
  /** Must be supplied by a local-only action configuration; no default path exists. */
  mode: "local";
  sdk: {
    allowedRoot: string;
    entryPath: string;
  };
  arcade: {
    allowedRoot: string;
  };
}

export interface LoadedDrive555LocalArtifacts {
  sdk: {
    GameplayApiClient: new (options: {
      apiUrl: string;
      token: string;
      wsUrl?: string;
      timeout?: number;
    }) => GameplayClientPort;
    sha256GameplayCanonical(value: unknown): string;
  };
  adapter: GameAdapterPort;
  controller: DeterministicControllerPort;
  controllerArtifact: ControllerArtifactManifestPort;
  expectedArtifacts: GameplayRehearsalDependencies["expectedArtifacts"];
}

function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function requireDigest(value: string, label: string): string {
  if (!isDigest(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function singleFilePin(
  label: string,
  mode: "local",
  allowedRoot: string,
  entryPath: string,
  sha256: string,
): LocalArtifactPin {
  const relativePath = path.relative(allowedRoot, entryPath);
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} entry must be explicitly inside its local allowed root`);
  }
  return {
    label,
    mode,
    allowedRoot,
    entryPath,
    sha256ByRelativePath: { [relativePath]: sha256 },
  };
}

function validateControllerManifest(value: ControllerArtifactManifestPort): ControllerArtifactManifestPort {
  if (
    value.schemaVersion !== "gameplay-controller-artifact.v1" ||
    value.packageName !== "@rndrntwrk/plugin-555arcade" ||
    value.controllerId !== "racing_line" ||
    value.controllerVersion !== "1.0.0" ||
    value.entrypoint !== "racing-line.js" ||
    value.artifactDigest !== TASK3_CONTROLLER_ARTIFACT_DIGEST ||
    value.files.length !== 1 ||
    value.files[0]?.path !== "racing-line.js" ||
    value.files[0]?.sha256 !== TASK3_RACING_LINE_SHA256
  ) {
    throw new Error("local 555Drive controller manifest does not match the approved controller artifact");
  }
  return value;
}

/**
 * Loads only explicit, caller-supplied local artifacts. This is intentionally
 * unavailable in production through both configuration and loader guards.
 */
export async function loadDrive555LocalArtifacts(
  config: Drive555LocalArtifactConfig,
): Promise<LoadedDrive555LocalArtifacts> {
  if (config.mode !== "local") throw new Error("555Drive artifacts are local-only");
  const adapterEntry = path.join(
    config.arcade.allowedRoot,
    "dist/gameplay-core/games/555drive/adapter.js",
  );
  const controllerEntry = path.join(
    config.arcade.allowedRoot,
    "dist/gameplay-core/games/555drive/racing-line.js",
  );
  const controllerManifestEntry = path.join(
    config.arcade.allowedRoot,
    "dist/gameplay-core/controller-artifacts.json",
  );

  const sdk = await loadPinnedLocalModule<LoadedDrive555LocalArtifacts["sdk"]>(
    singleFilePin(
      "approved Task9 local gameplay SDK bundle",
      config.mode,
      config.sdk.allowedRoot,
      config.sdk.entryPath,
      TASK9_SDK_BUNDLE_SHA256,
    ),
  );
  if (
    typeof sdk.GameplayApiClient !== "function" ||
    typeof sdk.sha256GameplayCanonical !== "function"
  ) {
    throw new Error("pinned local gameplay SDK does not expose the approved gameplay exports");
  }

  const adapterModule = await loadPinnedLocalModule<{ drive555Adapter: GameAdapterPort }>({
    label: "approved 555Drive adapter",
    mode: config.mode,
    allowedRoot: config.arcade.allowedRoot,
    entryPath: adapterEntry,
    sha256ByRelativePath: ARCADE_ADAPTER_CLOSURE,
  });
  const controllerModule = await loadPinnedLocalModule<{
    racingLineController: DeterministicControllerPort;
  }>({
    label: "approved 555Drive racing-line controller",
    mode: config.mode,
    allowedRoot: config.arcade.allowedRoot,
    entryPath: controllerEntry,
    sha256ByRelativePath: {
      "dist/gameplay-core/games/555drive/racing-line.js": TASK3_RACING_LINE_SHA256,
    },
  });
  const controllerArtifact = validateControllerManifest(
    await readPinnedLocalJson<ControllerArtifactManifestPort>({
      label: "approved 555Drive controller manifest",
      mode: config.mode,
      allowedRoot: config.arcade.allowedRoot,
      entryPath: controllerManifestEntry,
      sha256ByRelativePath: {
        "dist/gameplay-core/controller-artifacts.json": CONTROLLER_MANIFEST_SHA256,
      },
    }),
  );
  if (
    !adapterModule.drive555Adapter ||
    typeof adapterModule.drive555Adapter.normalizeObservation !== "function" ||
    !controllerModule.racingLineController ||
    typeof controllerModule.racingLineController.initialState !== "function" ||
    typeof controllerModule.racingLineController.decide !== "function"
  ) {
    throw new Error("pinned 555Drive Arcade artifacts do not expose the approved adapter/controller");
  }

  return {
    sdk,
    adapter: adapterModule.drive555Adapter,
    controller: controllerModule.racingLineController,
    controllerArtifact,
    expectedArtifacts: {
      bridgeDigest: requireDigest(
        DRIVE555_APPROVED_NATIVE_TRUST_PINS.bridgeDigest,
        "approved Task9 native bridge",
      ),
      adapterManifestDigest: TASK3_ADAPTER_MANIFEST_DIGEST,
      controllerDigest: TASK3_CONTROLLER_ARTIFACT_DIGEST,
      sourceAnchorDigest: requireDigest(
        DRIVE555_APPROVED_NATIVE_TRUST_PINS.sourceAnchorDigest,
        "approved Task9 native source anchor set",
      ),
      initialFixtureDigest: TASK3_INITIAL_FIXTURE_DIGEST,
    },
  };
}
