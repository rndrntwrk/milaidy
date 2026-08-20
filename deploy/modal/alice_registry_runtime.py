"""Alice production runtime on Modal from one smoke-approved GHCR digest.

This launcher is intentionally source-owned by Alice. Deploy it only after the
referenced image has passed the workflow's exact-image smoke, and roll back to
Modal v47 if the bounded production verification fails.
"""

import modal


app = modal.App("alice-runtime")

# GitHub Actions run 32374476301 built source 044157c3d7d7f5dc97b7236ed4cbcfdb52d3b0b1
# with official Eliza develop dd57a68ef1e6c28c93c9974de61d4402492a0f31.
REGISTRY_IMAGE = "ghcr.io/rndrntwrk/milaidy-agent@sha256:e19d305b2bb619c0b84cad6b44caf4b5132efaafe90883283fe4dcb8859b548f"

alice_image = modal.Image.from_registry(
    REGISTRY_IMAGE,
    secret=modal.Secret.from_name("alice-ghcr-registry"),
    add_python="3.11",
).entrypoint([])

RUNTIME_ENV = {
    "NODE_ENV": "production",
    "PORT": "8080",
    "MILADY_PORT": "8080",
    "ELIZA_PORT": "8080",
    "MILADY_API_BIND": "0.0.0.0",
    "ELIZA_API_BIND": "0.0.0.0",
    "ELIZA_ALLOWED_HOSTS": "*",
    "MILADY_ALLOWED_ORIGINS": "https://rndrntwrk--alice.modal.run",
    "ELIZA_ALLOWED_ORIGINS": "https://rndrntwrk--alice.modal.run",
    "ELIZA_DISABLE_LOCAL_EMBEDDINGS": "1",
    "MILADY_DISABLE_AUTO_BOOTSTRAP": "1",
    "ELIZA_VAULT_DISABLE_KEYCHAIN": "1",
    "ELIZA_STAGE_ALL_HOISTED_NODE_MODULES": "true",
    "MILADY_AUTH_DISABLED": "0",
    "MILAIDY_AUTH_DISABLED": "0",
    "ELIZA_AUTH_DISABLED": "0",
    "API_AUTH_DISABLED": "0",
    "MILADY_STATE_DIR": "/tmp/alice-state/milaidy",
    "MILAIDY_HOME": "/tmp/alice-state/milaidy",
    "ELIZA_STATE_DIR": "/tmp/alice-state/milaidy",
    "CACHE_DIR": "/tmp/alice-state/eliza/cache",
    "MODELS_DIR": "/tmp/alice-state/eliza/models",
    "PGLITE_DATA_DIR": "/tmp/alice-state/milaidy/workspace/.eliza/.elizadb",
    "HOME": "/tmp/alice-state/home",
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
    "STREAM555_BASE_URL": "https://stream.rndrntwrk.com",
    "STREAM555_CONTROL_PLUGIN_ENABLED": "true",
    "STREAM_PLUGIN_ENABLED": "true",
    "STREAM555_DEFAULT_SESSION_ID": "alice",
    "STREAM555_REQUIRE_APPROVALS": "false",
    "STREAM555_DEST_SYNC_ON_GO_LIVE": "false",
}


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
        modal.Secret.from_name("alice-runtime"),
        modal.Secret.from_name("alice-capture-api-token"),
        modal.Secret.from_name("alice-stream-destinations"),
        modal.Secret.from_name("alice-stream-control"),
        modal.Secret.from_name("alice-wallet"),
        modal.Secret.from_name("alice-cloudflare-ai"),
    ],
)
@modal.web_server(port=8080, startup_timeout=900, label="alice")
def alice_web():
    """Start the image's canonical entrypoint and let Modal proxy port 8080."""
    import os
    import subprocess

    os.environ.update(RUNTIME_ENV)
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
            "sh",
            "-lc",
            "exec ${APP_CMD_START:-node --import ./node_modules/tsx/dist/loader.mjs ${APP_ENTRYPOINT:-milady.mjs} start}",
        ],
        cwd="/app",
        env=os.environ,
    )
