import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const verifier = fileURLToPath(
  new URL("./verify-alice-companion-assets.mjs", import.meta.url),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "alice-assets-"));
  const files = {
    requiredVrm: "apps/app/public/vrms/milady-9.vrm.gz",
    requiredSourceVrm: "apps/app/public_src/vrms/milady-9.vrm",
    requiredPreview: "apps/app/public/vrms/previews/milady-9.png",
    requiredBackground: "apps/app/public/vrms/backgrounds/milady-9.png",
  };
  const values = {
    requiredVrm: Buffer.from("verified-vrm"),
    requiredSourceVrm: Buffer.from("verified-source-vrm"),
    requiredPreview: Buffer.from("verified-preview"),
    requiredBackground: Buffer.from("verified-background"),
  };
  for (const [key, relativePath] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, values[key]);
  }
  const manifestPath = join(root, "alice-companion-assets.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        ...files,
        integrity: {
          requiredVrmSha256: sha256(values.requiredVrm),
          requiredSourceVrmSha256: sha256(values.requiredSourceVrm),
          requiredPreviewSha256: sha256(values.requiredPreview),
          requiredBackgroundSha256: sha256(values.requiredBackground),
        },
      },
      null,
      2,
    )}\n`,
  );
  return { root, manifestPath, files };
}

function runVerifier(root, manifestPath) {
  return spawnSync(
    process.execPath,
    [verifier, "--root", root, "--manifest", manifestPath],
    { encoding: "utf8" },
  );
}

test("accepts the exact Alice asset bytes", () => {
  const fixture = createFixture();
  try {
    const result = runVerifier(fixture.root, fixture.manifestPath);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /verified 4 Alice companion assets/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("fails when a required Alice asset is missing", () => {
  const fixture = createFixture();
  try {
    rmSync(join(fixture.root, fixture.files.requiredVrm));
    const result = runVerifier(fixture.root, fixture.manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required Alice companion asset/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("fails when a required Alice asset hash changes", () => {
  const fixture = createFixture();
  try {
    writeFileSync(
      join(fixture.root, fixture.files.requiredPreview),
      "different-preview",
    );
    const result = runVerifier(fixture.root, fixture.manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /hash mismatch for Alice companion asset/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
