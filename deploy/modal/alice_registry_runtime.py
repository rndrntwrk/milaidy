"""Alice production runtime on Modal from one smoke-approved GHCR digest.

This launcher is intentionally source-owned by Alice. Deploy it only after the
referenced image has passed the workflow's exact-image smoke. Roll back only to
the exact coherent production-core bundle recorded by the deployment manifest.
"""

import os
import re

import modal


app = modal.App("alice-runtime")


def _require_modal_revision(environ):
    value = environ.get("ALICE_MODAL_REVISION", "")
    if not re.fullmatch(r"(?:49|[5-9][0-9]|[1-9][0-9]{2,})", value):
        raise RuntimeError("ALICE_MODAL_REVISION must be an exact production-core revision")
    return int(value)


REQUIRED_MODAL_REVISION = _require_modal_revision(os.environ)

RELEASE_SECRET_NAME = os.environ.get("ALICE_MODAL_RELEASE_SECRET_NAME", "")
if not re.fullmatch(
    r"alice-production-core-[a-f0-9]{64}-[1-9][0-9]*-[1-9][0-9]*",
    RELEASE_SECRET_NAME,
):
    raise RuntimeError(
        "ALICE_MODAL_RELEASE_SECRET_NAME must bind one exact release run"
    )

def _require_registry_image(environ):
    """Read one protected, pre-verified immutable image without source self-reference."""
    image = environ.get("ALICE_RUNTIME_IMAGE", "")
    if not re.fullmatch(
        r"ghcr\.io/rndrntwrk/milaidy-agent@sha256:[a-f0-9]{64}", image
    ):
        raise RuntimeError("ALICE_RUNTIME_IMAGE must be an exact RNDRNTWRK digest")
    return image


# The protected deployment controller verifies the image's GitHub provenance,
# exact source revision label, and embedded runtime build manifest before it
# invokes this launcher. Keeping the resulting digest in deployment input (and
# the signed release manifest), instead of source that builds the image, breaks
# the otherwise impossible source-commit -> image-digest -> source-commit cycle.
REGISTRY_IMAGE = _require_registry_image(os.environ)

alice_image = modal.Image.from_registry(
    REGISTRY_IMAGE,
    secret=modal.Secret.from_name("alice-ghcr-registry"),
).entrypoint([])

RUNTIME_ENV = {
    "NODE_ENV": "production",
    "HOME": "/tmp/alice-state/home",
    "PORT": "8080",
    "MILADY_PORT": "8080",
    "ELIZA_PORT": "8080",
    "MILADY_API_BIND": "0.0.0.0",
    "ELIZA_API_BIND": "0.0.0.0",
    "MILADY_ALLOWED_HOSTS": "alice.rndrntwrk.com,rndrntwrk--alice.modal.run,localhost,127.0.0.1",
    "ELIZA_ALLOWED_HOSTS": "alice.rndrntwrk.com,rndrntwrk--alice.modal.run,localhost,127.0.0.1",
    "MILADY_ALLOWED_ORIGINS": "https://alice.rndrntwrk.com",
    "ELIZA_ALLOWED_ORIGINS": "https://alice.rndrntwrk.com",
    "ELIZA_DISABLE_LOCAL_EMBEDDINGS": "1",
    "MILADY_DISABLE_AUTO_BOOTSTRAP": "1",
    "ELIZA_VAULT_DISABLE_KEYCHAIN": "1",
    "ELIZA_STAGE_ALL_HOISTED_NODE_MODULES": "true",
    "MILADY_AUTH_DISABLED": "0",
    "MILAIDY_AUTH_DISABLED": "0",
    "ELIZA_AUTH_DISABLED": "0",
    "API_AUTH_DISABLED": "0",
    "ENABLE_AUTONOMY": "false",
    "ELIZA_TRIGGERS_ENABLED": "false",
    "MILADY_STATE_DIR": "/tmp/alice-state/milaidy",
    "MILAIDY_HOME": "/tmp/alice-state/milaidy",
    "ELIZA_STATE_DIR": "/tmp/alice-state/milaidy",
    "CACHE_DIR": "/tmp/alice-state/eliza/cache",
    "MODELS_DIR": "/tmp/alice-state/eliza/models",
    "PGLITE_DATA_DIR": "/tmp/alice-state/milaidy/workspace/.eliza/.elizadb",
    "ELIZA_PROVIDER": "openai",
    "OPENAI_BASE_URL": "https://alice-ai-gateway.gl4sspr1sm.workers.dev/v1",
    "OPENAI_EMBEDDING_URL": "https://alice-ai-gateway.gl4sspr1sm.workers.dev/v1",
    "OPENAI_SMALL_MODEL": "workers-ai/@cf/openai/gpt-oss-20b",
    "OPENAI_NANO_MODEL": "workers-ai/@cf/openai/gpt-oss-20b",
    "OPENAI_MEDIUM_MODEL": "workers-ai/@cf/openai/gpt-oss-20b",
    "OPENAI_RESPONSE_HANDLER_MODEL": "workers-ai/@cf/openai/gpt-oss-20b",
    "OPENAI_LARGE_MODEL": "workers-ai/@cf/openai/gpt-oss-120b",
    "OPENAI_MEGA_MODEL": "workers-ai/@cf/openai/gpt-oss-120b",
    "OPENAI_ACTION_PLANNER_MODEL": "workers-ai/@cf/openai/gpt-oss-120b",
    "OPENAI_PLANNER_MODEL": "workers-ai/@cf/openai/gpt-oss-120b",
    "OPENAI_EMBEDDING_MODEL": "@cf/baai/bge-m3",
    "OPENAI_EMBEDDING_DIMENSIONS": "1024",
    "ALICE_RUNTIME_AUTHORITY_MODE": "proposer-only",
    "ALICE_RUNTIME_PROFILE": "full-gated",
    "MILADY_TRUST_CLOUDFLARE_ACCESS": "1",
    "STREAM555_CONTROL_PLUGIN_ENABLED": "false",
    "STREAM_PLUGIN_ENABLED": "false",
    "STREAM555_REQUIRE_APPROVALS": "true",
    "STREAM555_DEST_SYNC_ON_GO_LIVE": "false",
    "SWAP_PLUGIN_ENABLED": "false",
    "FIVE55_ADMIN_PLUGIN_ENABLED": "false",
    "FIVE55_SOCIAL_PLUGIN_ENABLED": "false",
    "FIVE55_SCORE_CAPTURE_PLUGIN_ENABLED": "false",
    "CODING_ENABLED": "false",
    "WORKSPACE_ENABLED": "false",
    "SHELL_PLUGIN_ENABLED": "false",
    "SOLANA_PLUGIN_ENABLED": "false",
    "EVM_PLUGIN_ENABLED": "false",
    "TELEGRAM_PLUGIN_ENABLED": "false",
    "DISCORD_PLUGIN_ENABLED": "false",
    "WHATSAPP_PLUGIN_ENABLED": "false",
    "IMESSAGE_PLUGIN_ENABLED": "false",
    "ALICE_PUBLIC_POSTING_ENABLED": "false",
    "ALICE_TRADING_ENABLED": "false",
    "ALICE_SIGNER_ENABLED": "false",
    "ALICE_MODAL_BURST_ENABLED": "false",
}

SCOPED_SECRET_KEYS = {
    "MILADY_API_TOKEN",
    "OPENAI_API_KEY",
    "MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET",
    "ELIZA_VAULT_PASSPHRASE",
}

# These values are non-secret, but they are admitted explicitly rather than by
# prefix. The protected release procedure writes the exact signed release
# identity into the narrow Modal secret after the exact-image smoke completes.
RELEASE_METADATA_KEYS = {
    "ALICE_PROGRAM_DIGEST",
    "ALICE_RELEASE_DIGEST",
    "ALICE_POLICY_HASH",
    "ALICE_SOURCE_COMMIT",
    "ALICE_DEPLOYMENT_CONTROLLER_COMMIT",
    "ALICE_RUNTIME_IMAGE",
    "ALICE_RUNTIME_BUILD_MANIFEST_SHA256",
    "ALICE_CAPABILITY_BOM_SHA256",
    "ALICE_DEPLOYMENT_MANIFEST_SHA256",
    "ALICE_ELIZA_COMMIT",
    "ALICE_MODAL_REVISION",
}

SAFE_INHERITED_KEYS = {
    "LANG",
    "LC_ALL",
    "PATH",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "TZ",
}

PLATFORM_SENSITIVE_PREFIXES = ("AWS_", "MODAL_", "OTEL_", "DD_")
SENSITIVE_MARKERS = (
    "API_KEY",
    "CREDENTIAL",
    "PASSWORD",
    "PASSPHRASE",
    "PRIVATE_KEY",
    "SECRET",
    "TOKEN",
)


def _build_child_env(environ):
    for key in environ:
        upper = key.upper()
        if key in {"APP_CMD_START", "APP_ENTRYPOINT"}:
            raise RuntimeError("Unexpected sensitive runtime environment key")
        if (
            key not in SCOPED_SECRET_KEYS
            and any(marker in upper for marker in SENSITIVE_MARKERS)
            and not upper.startswith(PLATFORM_SENSITIVE_PREFIXES)
        ):
            raise RuntimeError("Unexpected sensitive runtime environment key")

    missing = [
        key
        for key in sorted(SCOPED_SECRET_KEYS | RELEASE_METADATA_KEYS)
        if not environ.get(key)
    ]
    if missing:
        raise RuntimeError("Required scoped runtime secret is missing")

    child_env = {
        key: value
        for key, value in environ.items()
        if key in SAFE_INHERITED_KEYS
    }
    child_env.update(RUNTIME_ENV)
    child_env.update({key: environ[key] for key in SCOPED_SECRET_KEYS})
    child_env.update({key: environ[key] for key in RELEASE_METADATA_KEYS})
    return child_env


def _verify_runtime_binding(environ, subprocess_module):
    if environ["ALICE_RUNTIME_IMAGE"] != REGISTRY_IMAGE:
        raise RuntimeError("Alice runtime image binding mismatch")
    if environ["ALICE_MODAL_REVISION"] != str(REQUIRED_MODAL_REVISION):
        raise RuntimeError("Alice Modal revision binding mismatch")
    release_digest = environ["ALICE_RELEASE_DIGEST"]
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", release_digest):
        raise RuntimeError("Alice release digest binding invalid")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", environ["ALICE_DEPLOYMENT_MANIFEST_SHA256"]):
        raise RuntimeError("Alice deployment manifest binding invalid")
    expected_secret_prefix = (
        f"alice-production-core-{release_digest.removeprefix('sha256:')}-"
    )
    if not RELEASE_SECRET_NAME.startswith(expected_secret_prefix):
        raise RuntimeError("Alice release secret binding mismatch")
    try:
        subprocess_module.run(
            [
                "node",
                "/app/deploy/modal/verify_alice_capability_bom.mjs",
            ],
            cwd="/app",
            env=environ,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        subprocess_module.run(
            [
                "node",
                "/app/deploy/modal/verify_alice_runtime_build_manifest.mjs",
            ],
            cwd="/app",
            env=environ,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (subprocess_module.SubprocessError, OSError) as error:
        raise RuntimeError("Alice runtime build verification failed") from error


@app.function(
    image=alice_image,
    cpu=4.0,
    memory=8192,
    min_containers=0,
    buffer_containers=0,
    max_containers=1,
    scaledown_window=300,
    timeout=14400,
    secrets=[
        modal.Secret.from_name(RELEASE_SECRET_NAME),
    ],
)
@modal.web_server(
    port=8080,
    startup_timeout=900,
    label="alice",
    requires_proxy_auth=True,
)
def alice_web():
    """Start the image's canonical entrypoint and let Modal proxy port 8080."""
    import os
    import subprocess

    child_env = _build_child_env(os.environ)
    _verify_runtime_binding(child_env, subprocess)
    for directory in (
        "/tmp/alice-state/home",
        "/tmp/alice-state/milaidy",
        "/tmp/alice-state/eliza/cache",
        "/tmp/alice-state/eliza/models/text",
    ):
        os.makedirs(directory, exist_ok=True)

    subprocess.Popen(
        [
            "sh",
            "/app/eliza/packages/app-core/scripts/docker-entrypoint.sh",
            "node",
            "--import",
            "./node_modules/tsx/dist/loader.mjs",
            "milady.mjs",
            "start",
        ],
        cwd="/app",
        env=child_env,
    )
