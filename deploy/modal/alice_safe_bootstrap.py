"""Fail-closed Modal bootstrap used as Alice's first safe rollback anchor."""

import os
import re

import modal


app = modal.App("alice-runtime")


def _required(environ, key, pattern):
    value = environ.get(key, "")
    if not re.fullmatch(pattern, value):
        raise RuntimeError("ALICE_MODAL_SAFE_BOOTSTRAP_INVALID")
    return value


REGISTRY_IMAGE = _required(
    os.environ,
    "ALICE_RUNTIME_IMAGE",
    r"ghcr\.io/rndrntwrk/milaidy-agent@sha256:[a-f0-9]{64}",
)
RELEASE_ENV = {
    "ALICE_PROGRAM_DIGEST": _required(
        os.environ, "ALICE_PROGRAM_DIGEST", r"sha256:[a-f0-9]{64}"
    ),
    "ALICE_RELEASE_DIGEST": _required(
        os.environ, "ALICE_RELEASE_DIGEST", r"sha256:[a-f0-9]{64}"
    ),
    "ALICE_POLICY_HASH": _required(
        os.environ, "ALICE_POLICY_HASH", r"sha256:[a-f0-9]{64}"
    ),
    "ALICE_SOURCE_COMMIT": _required(
        os.environ, "ALICE_SOURCE_COMMIT", r"[a-f0-9]{40}"
    ),
    "ALICE_DEPLOYMENT_CONTROLLER_COMMIT": _required(
        os.environ, "ALICE_DEPLOYMENT_CONTROLLER_COMMIT", r"[a-f0-9]{40}"
    ),
    "ALICE_RUNTIME_IMAGE": REGISTRY_IMAGE,
    "ALICE_RUNTIME_BUILD_MANIFEST_SHA256": _required(
        os.environ,
        "ALICE_RUNTIME_BUILD_MANIFEST_SHA256",
        r"sha256:[a-f0-9]{64}",
    ),
    "ALICE_DEPLOYMENT_MANIFEST_SHA256": _required(
        os.environ,
        "ALICE_DEPLOYMENT_MANIFEST_SHA256",
        r"sha256:[a-f0-9]{64}",
    ),
    "ALICE_ELIZA_COMMIT": _required(
        os.environ, "ALICE_ELIZA_COMMIT", r"[a-f0-9]{40}"
    ),
    "ALICE_MODAL_REVISION": _required(
        os.environ,
        "ALICE_MODAL_REVISION",
        r"(?:49|[5-9][0-9]|[1-9][0-9]{2,})",
    ),
}

alice_image = (
    modal.Image.from_registry(
        REGISTRY_IMAGE,
        secret=modal.Secret.from_name("alice-ghcr-registry"),
    )
    .entrypoint([])
    .env({**RELEASE_ENV, "PORT": "8080"})
)


@app.function(
    image=alice_image,
    cpu=0.25,
    memory=256,
    min_containers=0,
    buffer_containers=0,
    max_containers=1,
    scaledown_window=300,
    timeout=300,
)
@modal.web_server(
    port=8080,
    startup_timeout=180,
    label="alice",
    requires_proxy_auth=True,
)
def alice_web():
    """Serve only the inert, release-bound bootstrap health response."""
    import subprocess

    child_env = {
        **RELEASE_ENV,
        "HOME": "/tmp",
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "PORT": "8080",
    }
    subprocess.Popen(
        ["node", "deploy/modal/alice_safe_bootstrap_server.mjs"],
        cwd="/app",
        env=child_env,
    )
