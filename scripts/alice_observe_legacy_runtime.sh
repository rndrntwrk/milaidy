#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "usage: alice_observe_legacy_runtime.sh <oracle-root> <subject-root> <observation-root> <archive>" >&2
  exit 64
fi

ORACLE_ROOT="$(cd "$1" && pwd -P)"
SUBJECT_ROOT="$(cd "$2" && pwd -P)"
OBS_ROOT="$3"
ARCHIVE="$4"
CONTEXT_ROOT="${OBS_ROOT}.context-root"
EXPORTER_PATH="$SUBJECT_ROOT/deploy/Dockerfile.runtime-context"

: "${ALICE_ORACLE_COMMIT:?ALICE_ORACLE_COMMIT is required}"
: "${ALICE_SUBJECT_SHA:?ALICE_SUBJECT_SHA is required}"
: "${ALICE_ELIZA_SHA:?ALICE_ELIZA_SHA is required}"
: "${ALICE_SOURCE_IMAGE:?ALICE_SOURCE_IMAGE is required}"
: "${GH_TOKEN:?GH_TOKEN is required for read-only attestation and package access}"
: "${GITHUB_ACTOR:?GITHUB_ACTOR is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"

for value in "$ALICE_ORACLE_COMMIT" "$ALICE_SUBJECT_SHA" "$ALICE_ELIZA_SHA"; do
  if ! printf '%s' "$value" | grep -Eq '^[a-f0-9]{40}$'; then
    echo "invalid commit identity" >&2
    exit 65
  fi
done
if ! printf '%s' "$ALICE_SOURCE_IMAGE" | grep -Eq '^ghcr\.io/rndrntwrk/milaidy-agent@sha256:[a-f0-9]{64}$'; then
  echo "invalid source image identity" >&2
  exit 65
fi

OBS_PARENT="$(dirname "$OBS_ROOT")"
ARCHIVE_PARENT="$(dirname "$ARCHIVE")"
mkdir -p "$OBS_PARENT" "$ARCHIVE_PARENT"
OBS_PARENT="$(cd "$OBS_PARENT" && pwd -P)"
ARCHIVE_PARENT="$(cd "$ARCHIVE_PARENT" && pwd -P)"
OBS_ROOT="$OBS_PARENT/$(basename "$OBS_ROOT")"
ARCHIVE="$ARCHIVE_PARENT/$(basename "$ARCHIVE")"

inside_or_equal() {
  local parent="$1"
  local child="$2"
  case "$child" in
    "$parent"|"$parent"/*) return 0 ;;
    *) return 1 ;;
  esac
}

for checkout in "$ORACLE_ROOT" "$SUBJECT_ROOT"; do
  if inside_or_equal "$checkout" "$OBS_ROOT" || inside_or_equal "$checkout" "$ARCHIVE"; then
    echo "observation outputs must remain outside source checkouts" >&2
    exit 65
  fi
done

if [ -e "$OBS_ROOT" ] || [ -e "$CONTEXT_ROOT" ] || [ -e "$ARCHIVE" ] || [ -e "${ARCHIVE}.sha256" ]; then
  echo "observation output already exists" >&2
  exit 66
fi
mkdir "$OBS_ROOT"
chmod 0700 "$OBS_ROOT"

cleanup() {
  rm -rf -- "$CONTEXT_ROOT"
  rm -f -- "$EXPORTER_PATH"
  docker image rm "$ALICE_SOURCE_IMAGE" >/dev/null 2>&1 || true
  docker logout ghcr.io >/dev/null 2>&1 || true
}
trap cleanup EXIT

subject_git() {
  git -C "$SUBJECT_ROOT" "$@"
}

oracle_git() {
  git -C "$ORACLE_ROOT" "$@"
}

if [ "$(oracle_git rev-parse HEAD)" != "$ALICE_ORACLE_COMMIT" ]; then
  echo "oracle commit mismatch" >&2
  exit 67
fi
if [ "$(subject_git rev-parse HEAD)" != "$ALICE_SUBJECT_SHA" ]; then
  echo "subject commit mismatch" >&2
  exit 67
fi
if [ "$(subject_git ls-tree HEAD eliza | awk '{print $3}')" != "$ALICE_ELIZA_SHA" ]; then
  echo "Eliza gitlink mismatch" >&2
  exit 67
fi
if [ -e "$SUBJECT_ROOT/.dockerignore" ] || [ -e "$EXPORTER_PATH" ]; then
  echo "subject checkout contains an unexpected generated context input" >&2
  exit 67
fi

(
  cd "$SUBJECT_ROOT"
  git lfs install --local
  git lfs pull --include="apps/app/public/vrms/*.vrm.gz" --exclude=""
  node scripts/validate-cloud-avatar-assets.mjs
)

if [ "$(subject_git config -f .gitmodules --get submodule.eliza.url)" != "https://github.com/rndrntwrk/eliza.git" ]; then
  echo "Eliza submodule URL mismatch" >&2
  exit 67
fi
if [ "$(subject_git config -f .gitmodules --get submodule.eliza.branch)" != "alice/runtime-stable-2026-08-22" ]; then
  echo "Eliza submodule branch mismatch" >&2
  exit 67
fi

git clone --no-checkout --filter=blob:none \
  https://github.com/rndrntwrk/eliza.git "$SUBJECT_ROOT/eliza"
git -C "$SUBJECT_ROOT/eliza" fetch --depth=1 origin \
  "refs/pull/6/head:refs/remotes/origin/alice-reviewed-pr-6"
if [ "$(git -C "$SUBJECT_ROOT/eliza" rev-parse refs/remotes/origin/alice-reviewed-pr-6)" != "$ALICE_ELIZA_SHA" ]; then
  echo "reviewed Eliza head mismatch" >&2
  exit 67
fi
git -C "$SUBJECT_ROOT/eliza" fetch --depth=1 origin "$ALICE_ELIZA_SHA"
git -C "$SUBJECT_ROOT/eliza" checkout --detach "$ALICE_ELIZA_SHA"
if [ "$(git -C "$SUBJECT_ROOT/eliza" rev-parse HEAD)" != "$ALICE_ELIZA_SHA" ]; then
  echo "hydrated Eliza commit mismatch" >&2
  exit 67
fi

if [ -f "$SUBJECT_ROOT/cloud/patches/cloud-runtime-patches.patch" ]; then
  git -C "$SUBJECT_ROOT/eliza" apply ../cloud/patches/cloud-runtime-patches.patch
fi
LIFEOPS_UI="$SUBJECT_ROOT/eliza/apps/app-lifeops/src/ui.ts"
if [ -f "$LIFEOPS_UI" ] && ! grep -q 'AppBlockerSettingsCard' "$LIFEOPS_UI"; then
  if grep -q 'WebsiteBlockerSettingsCard' "$LIFEOPS_UI"; then
    WBSC_PATH="$(grep 'WebsiteBlockerSettingsCard' "$LIFEOPS_UI" | grep 'export \*' | sed 's/export \* from "//;s/";$//' | head -1)"
    echo "export { WebsiteBlockerSettingsCard as AppBlockerSettingsCard } from \"${WBSC_PATH:-./components/WebsiteBlockerSettingsCard.tsx}\";" >> "$LIFEOPS_UI"
  fi
fi
test -f "$SUBJECT_ROOT/eliza/package.json"

ALICE_EXPECTED_SOURCE_COMMIT="$ALICE_SUBJECT_SHA" \
ALICE_EXPECTED_ELIZA_COMMIT="$ALICE_ELIZA_SHA" \
/usr/bin/time -v \
  -o "$OBS_ROOT/preparation-resource.txt" \
  bash "$ORACLE_ROOT/scripts/alice_prepare_legacy_runtime_context.sh" \
  "$SUBJECT_ROOT"

node "$ORACLE_ROOT/deploy/alice_ci_dockerignore.mjs" \
  --base "$SUBJECT_ROOT/eliza/packages/app-core/deploy/.dockerignore.ci" \
  --output "$SUBJECT_ROOT/.dockerignore" \
  --receipt "$OBS_ROOT/dockerignore-receipt.json"
cp -- "$ORACLE_ROOT/deploy/Dockerfile.runtime-context" "$EXPORTER_PATH"
chmod 0444 "$EXPORTER_PATH"

CONTEXT_DOCKERFILE_SHA256="$(node -e '
  const fs = require("node:fs");
  const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(p.contextExporterDockerfileSha256);
' "$ORACLE_ROOT/deploy/alice_runtime_build_policy.v1.json")"

/usr/bin/time -v \
  -o "$OBS_ROOT/context-resource.txt" \
  node "$ORACLE_ROOT/deploy/alice_runtime_context_snapshot.mjs" \
    --repo-root "$SUBJECT_ROOT" \
    --dockerfile deploy/Dockerfile.runtime-context \
    --dockerfile-sha256 "$CONTEXT_DOCKERFILE_SHA256" \
    --output-directory "$CONTEXT_ROOT" \
    --contract "$OBS_ROOT/build-context.json" \
    --source-commit "$ALICE_SUBJECT_SHA" \
    --eliza-commit "$ALICE_ELIZA_SHA" \
    --policy "$ORACLE_ROOT/deploy/alice_runtime_context_policy.v1.json" \
    --timeout-ms 900000

CONTEXT="$OBS_ROOT/build-context.json" node --input-type=module <<'NODE'
import fs from "node:fs";
const value = JSON.parse(fs.readFileSync(process.env.CONTEXT, "utf8"));
if (value.entries.some((entry) => entry.path === "deploy/Dockerfile.runtime-context")) {
  throw new Error("ALICE_CONTEXT_EXPORTER_LEAKED_INTO_CONTEXT");
}
NODE
rm -rf -- "$CONTEXT_ROOT"
rm -f -- "$EXPORTER_PATH"

printf '%s' "$GH_TOKEN" | docker login ghcr.io \
  -u "$GITHUB_ACTOR" --password-stdin >/dev/null
gh attestation verify "oci://${ALICE_SOURCE_IMAGE}" \
  --repo rndrntwrk/milaidy \
  --signer-workflow rndrntwrk/milaidy/.github/workflows/build-cloud-agent.yml \
  --source-digest "$ALICE_SUBJECT_SHA" \
  --source-ref refs/heads/release/alice-production-core-2026-08-22 \
  --deny-self-hosted-runners

docker pull --platform linux/amd64 "$ALICE_SOURCE_IMAGE"
if [ "$(docker image inspect "$ALICE_SOURCE_IMAGE" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')" != "$ALICE_SUBJECT_SHA" ]; then
  echo "source image revision mismatch" >&2
  exit 68
fi

docker image inspect "$ALICE_SOURCE_IMAGE" > "$OBS_ROOT/image-inspect.raw.json"
node "$ORACLE_ROOT/deploy/alice_image_observation.mjs" image \
  --inspect "$OBS_ROOT/image-inspect.raw.json" \
  --output "$OBS_ROOT/image-observation.json"
rm -f -- "$OBS_ROOT/image-inspect.raw.json"

/usr/bin/time -v \
  -o "$OBS_ROOT/runtime-root-resource.txt" \
  docker run --rm \
    --platform linux/amd64 \
    --entrypoint node \
    -v "$ORACLE_ROOT/deploy/alice_runtime_root_contract.mjs:/oracle/alice_runtime_root_contract.mjs:ro" \
    -v "$ORACLE_ROOT/deploy/alice_runtime_root_policy.v1.json:/oracle/alice_runtime_root_policy.v1.json:ro" \
    -v "$OBS_ROOT:/out" \
    "$ALICE_SOURCE_IMAGE" \
    /oracle/alice_runtime_root_contract.mjs write \
      --root /app \
      --kind runtime-root \
      --output /out/runtime-root.json \
      --source-commit "$ALICE_SUBJECT_SHA" \
      --eliza-commit "$ALICE_ELIZA_SHA" \
      --platform linux/amd64 \
      --policy /oracle/alice_runtime_root_policy.v1.json

docker run --rm --platform linux/amd64 --entrypoint cat \
  "$ALICE_SOURCE_IMAGE" \
  /app/alice-runtime-build-manifest.json \
  > "$OBS_ROOT/runtime-build-manifest.json"
docker run --rm --platform linux/amd64 --entrypoint cat \
  "$ALICE_SOURCE_IMAGE" \
  /app/alice-capability-bom.json \
  > "$OBS_ROOT/capability-bom.json"

node "$ORACLE_ROOT/deploy/alice_image_observation.mjs" runtime \
  --context "$OBS_ROOT/build-context.json" \
  --runtime-root "$OBS_ROOT/runtime-root.json" \
  --image "$OBS_ROOT/image-observation.json" \
  --runtime-manifest "$OBS_ROOT/runtime-build-manifest.json" \
  --capability-bom "$OBS_ROOT/capability-bom.json" \
  --output "$OBS_ROOT/runtime-observation.json"

OBS_ROOT="$OBS_ROOT" \
ORACLE_COMMIT="$ALICE_ORACLE_COMMIT" \
SUBJECT_COMMIT="$ALICE_SUBJECT_SHA" \
ELIZA_COMMIT="$ALICE_ELIZA_SHA" \
SOURCE_IMAGE="$ALICE_SOURCE_IMAGE" \
node --input-type=module <<'NODE'
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const root = process.env.OBS_ROOT;
const names = [
  "build-context.json",
  "capability-bom.json",
  "context-resource.txt",
  "dockerignore-receipt.json",
  "image-observation.json",
  "preparation-resource.txt",
  "runtime-build-manifest.json",
  "runtime-observation.json",
  "runtime-root-resource.txt",
  "runtime-root.json",
];
const digest = (bytes) => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const files = {};
for (const name of names) {
  const file = path.join(root, name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
    throw new Error(`ALICE_OBSERVATION_FILE_INVALID:${name}`);
  }
  const bytes = fs.readFileSync(file);
  files[name] = { bytes: bytes.length, sha256: digest(bytes) };
}
const receipt = {
  schemaVersion: "alice.runtime-observation-digests.v1",
  oracleCommit: process.env.ORACLE_COMMIT,
  subjectCommit: process.env.SUBJECT_COMMIT,
  elizaCommit: process.env.ELIZA_COMMIT,
  sourceImage: process.env.SOURCE_IMAGE,
  files,
};
const unsigned = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
receipt.receiptSha256 = digest(unsigned);
fs.writeFileSync(
  path.join(root, "observation-digests.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
  { flag: "wx", mode: 0o444 },
);
NODE

tar --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 --group=0 --numeric-owner \
  -C "$OBS_ROOT" -cf - . | gzip -n > "$ARCHIVE"
printf 'sha256:%s\n' "$(sha256sum "$ARCHIVE" | cut -d' ' -f1)" \
  > "${ARCHIVE}.sha256"

OBSERVATION="$OBS_ROOT/runtime-observation.json" node --input-type=module <<'NODE'
import fs from "node:fs";
const value = JSON.parse(fs.readFileSync(process.env.OBSERVATION, "utf8"));
process.stdout.write(`${JSON.stringify({
  ok: true,
  observationSha256: value.observationSha256,
  contextEntries: value.context.entryCount,
  contextBytes: value.context.totalFileBytes,
  runtimeEntries: value.runtimeRoot.entryCount,
  runtimeBytes: value.runtimeRoot.totalFileBytes,
  runtimeContractBytes: value.runtimeRoot.contractBytes,
})}\n`);
NODE
