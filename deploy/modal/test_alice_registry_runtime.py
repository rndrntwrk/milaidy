"""Static release-contract tests for the Alice Modal launcher."""

import ast
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class AliceModalContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.launcher = (ROOT / "deploy/modal/alice_registry_runtime.py").read_text()
        cls.runbook = (ROOT / "deploy/modal/README.md").read_text()
        cls.receipt = json.loads((ROOT / "deploy/modal/release.json").read_text())
        cls.denied_plugins = (
            ROOT / "deploy/modal/alice-denied-plugins.txt"
        ).read_text().splitlines()

    def test_historical_rollback_release_is_preserved_and_launcher_is_digest_pinned(self):
        release = self.receipt["release"]
        expected = {
            release["aliceImageSource"],
            release["elizaSource"],
            str(release["buildRun"]),
            release["image"],
        }
        for value in expected:
            self.assertIn(value, self.runbook)
        self.assertIn("REGISTRY_IMAGE = _require_registry_image(os.environ)", self.launcher)
        self.assertIn(
            'r"ghcr\\.io/rndrntwrk/milaidy-agent@sha256:[a-f0-9]{64}"',
            self.launcher,
        )
        self.assertNotRegex(
            self.launcher,
            re.compile(
                r'^REGISTRY_IMAGE = "ghcr\.io/rndrntwrk/milaidy-agent@sha256:',
                re.MULTILINE,
            ),
        )
        self.assertNotIn("milaidy-agent:cloud-", self.launcher)

    def test_image_built_from_one_commit_is_deployed_without_editing_that_commit(self):
        tree = ast.parse(self.launcher)
        function = next(
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "_require_registry_image"
        )
        namespace = {"re": re}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "launcher", "exec"), namespace)
        require_image = namespace["_require_registry_image"]
        image_a = f"ghcr.io/rndrntwrk/milaidy-agent@sha256:{'a' * 64}"
        image_b = f"ghcr.io/rndrntwrk/milaidy-agent@sha256:{'b' * 64}"
        self.assertEqual(require_image({"ALICE_RUNTIME_IMAGE": image_a}), image_a)
        self.assertEqual(require_image({"ALICE_RUNTIME_IMAGE": image_b}), image_b)
        with self.assertRaisesRegex(RuntimeError, "exact RNDRNTWRK digest"):
            require_image({"ALICE_RUNTIME_IMAGE": "ghcr.io/rndrntwrk/milaidy-agent:latest"})

    def test_modal_uses_the_exact_registry_filesystem_and_verifies_its_build_manifest(self):
        self.assertNotIn("add_python=", self.launcher)
        self.assertIn(
            "REQUIRED_MODAL_REVISION = _require_modal_revision(os.environ)",
            self.launcher,
        )
        self.assertIn("_verify_runtime_binding", self.launcher)
        self.assertIn("verify_alice_runtime_build_manifest.mjs", self.launcher)
        self.assertIn("ALICE_RUNTIME_BUILD_MANIFEST_SHA256", self.launcher)
        self.assertIn("ALICE_RELEASE_DIGEST", self.launcher)
        self.assertIn("if environ[\"ALICE_RUNTIME_IMAGE\"] != REGISTRY_IMAGE:", self.launcher)
        self.assertIn(
            "if not RELEASE_SECRET_NAME.startswith(expected_secret_prefix):",
            self.launcher,
        )

    def test_modal_revision_is_a_protected_deployment_input(self):
        tree = ast.parse(self.launcher)
        function = next(
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "_require_modal_revision"
        )
        namespace = {"re": re}
        exec(
            compile(ast.Module(body=[function], type_ignores=[]), "launcher", "exec"),
            namespace,
        )
        require_revision = namespace["_require_modal_revision"]
        self.assertEqual(require_revision({"ALICE_MODAL_REVISION": "49"}), 49)
        self.assertEqual(require_revision({"ALICE_MODAL_REVISION": "50"}), 50)
        for invalid in ("", "48", "050", "latest", "49.0"):
            with self.assertRaisesRegex(RuntimeError, "exact production-core revision"):
                require_revision({"ALICE_MODAL_REVISION": invalid})

    def test_runtime_is_authenticated_scales_to_zero_and_has_no_ambient_authority(self):
        for setting in (
            "min_containers=0",
            "buffer_containers=0",
            "max_containers=1",
            "scaledown_window=300",
            "timeout=14400",
            "requires_proxy_auth=True",
            '"MILADY_AUTH_DISABLED": "0"',
            '"ELIZA_AUTH_DISABLED": "0"',
            '"API_AUTH_DISABLED": "0"',
            '"ENABLE_AUTONOMY": "false"',
            '"ELIZA_TRIGGERS_ENABLED": "false"',
        ):
            self.assertIn(setting, self.launcher)
        self.assertIn('modal.Secret.from_name("alice-ghcr-registry")', self.launcher)
        self.assertIn("ALICE_MODAL_RELEASE_SECRET_NAME", self.launcher)
        self.assertIn('modal.Secret.from_name(RELEASE_SECRET_NAME)', self.launcher)
        self.assertIn(
            'r"alice-production-core-[a-f0-9]{64}-[1-9][0-9]*-[1-9][0-9]*"',
            self.launcher,
        )
        self.assertNotIn('modal.Secret.from_name("alice-runtime")', self.launcher)
        self.assertNotIn('modal.Secret.from_name("alice-cloudflare-ai")', self.launcher)
        self.assertNotIn("CLOUDFLARE_API_TOKEN", self.launcher)
        for forbidden_secret in (
            "alice-wallet",
            "alice-stream-control",
            "alice-stream-destinations",
            "alice-capture-api-token",
        ):
            self.assertNotIn(forbidden_secret, self.launcher)
        for disabled_setting in (
            '"STREAM555_CONTROL_PLUGIN_ENABLED": "false"',
            '"STREAM_PLUGIN_ENABLED": "false"',
            '"SWAP_PLUGIN_ENABLED": "false"',
            '"FIVE55_SOCIAL_PLUGIN_ENABLED": "false"',
            '"CODING_ENABLED": "false"',
            '"WORKSPACE_ENABLED": "false"',
        ):
            self.assertIn(disabled_setting, self.launcher)
        self.assertIn('"ELIZA_SKIP_PLUGINS":', self.launcher)
        for forbidden_plugin in (
            "@rndrntwrk/plugin-555stream",
            "@elizaos/plugin-evm",
            "@elizaos/plugin-solana",
            "@elizaos/plugin-agent-orchestrator",
            "@elizaos/plugin-agent-skills",
            "@elizaos/plugin-commands",
            "@elizaos/plugin-shell",
            "@elizaos/plugin-code",
            "@elizaos/plugin-twitter",
            "@elizaos/plugin-discord",
            "@elizaos/plugin-telegram",
            "@elizaos/plugin-x402",
        ):
            self.assertIn(forbidden_plugin, self.denied_plugins)
        self.assertNotIn('"ELIZA_ALLOWED_HOSTS": "*"', self.launcher)
        self.assertIn(
            '"MILADY_ALLOWED_ORIGINS": "https://alice.rndrntwrk.com"',
            self.launcher,
        )
        self.assertNotIn(
            '"MILADY_ALLOWED_ORIGINS": "https://alice.rndrntwrk.com,https://rndrntwrk--alice.modal.run"',
            self.launcher,
        )
        self.assertIn('"HOME": "/tmp/alice-state/home"', self.launcher)
        self.assertIn("SCOPED_SECRET_KEYS = {", self.launcher)
        self.assertIn("RELEASE_METADATA_KEYS = {", self.launcher)
        for allowed_secret_key in (
            '"MILADY_API_TOKEN"',
            '"OPENAI_API_KEY"',
            '"MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET"',
            '"ELIZA_VAULT_PASSPHRASE"',
        ):
            self.assertIn(allowed_secret_key, self.launcher)
        for release_metadata_key in (
            '"ALICE_PROGRAM_DIGEST"',
            '"ALICE_RELEASE_DIGEST"',
            '"ALICE_POLICY_HASH"',
            '"ALICE_SOURCE_COMMIT"',
            '"ALICE_DEPLOYMENT_CONTROLLER_COMMIT"',
            '"ALICE_RUNTIME_IMAGE"',
            '"ALICE_RUNTIME_BUILD_MANIFEST_SHA256"',
            '"ALICE_DEPLOYMENT_MANIFEST_SHA256"',
            '"ALICE_ELIZA_COMMIT"',
            '"ALICE_MODAL_REVISION"',
        ):
            self.assertIn(release_metadata_key, self.launcher)
        self.assertNotIn('"LD_LIBRARY_PATH"', self.launcher)
        self.assertNotIn('"NODE_PATH"', self.launcher)
        self.assertIn("raise RuntimeError(\"Unexpected sensitive runtime environment key\")", self.launcher)
        self.assertIn("env=child_env", self.launcher)
        self.assertNotIn("env=os.environ", self.launcher)
        self.assertNotIn("os.environ.update(RUNTIME_ENV)", self.launcher)
        self.assertNotIn("${APP_CMD_START", self.launcher)
        self.assertNotIn("${APP_ENTRYPOINT", self.launcher)
        self.assertIn(
            'if key in {"APP_CMD_START", "APP_ENTRYPOINT"}:',
            self.launcher,
        )
        self.assertIn('"node",', self.launcher)
        self.assertIn('"milady.mjs",', self.launcher)

    def test_control_plane_and_ai_gateway_routes_are_explicit(self):
        self.assertNotIn('"ALICE_CONTROL_PLANE_URL":', self.launcher)
        self.assertIn('"ALICE_RUNTIME_AUTHORITY_MODE": "proposer-only"', self.launcher)
        self.assertIn(
            '"OPENAI_BASE_URL": "https://alice-ai-gateway.gl4sspr1sm.workers.dev/v1"',
            self.launcher,
        )

    def test_release_receipt_records_live_checks_and_idle_posture(self):
        release = self.receipt["release"]
        checks = self.receipt["verification"]
        boundary = self.receipt["upstreamBoundary"]

        self.assertEqual(release["modalRevision"], 48)
        self.assertEqual(release["rollbackModalRevision"], 47)
        self.assertEqual(checks["unauthenticatedHealthStatus"], 401)
        self.assertEqual(checks["authenticatedHealthStatus"], 200)
        self.assertEqual(checks["authenticatedAgentState"], "running")
        self.assertTrue(checks["danceHappyInCatalog"])
        self.assertEqual(checks["vrmBytes"], 58021632)
        self.assertEqual(checks["vrmMagic"], "glTF")
        self.assertEqual(checks["modalTasksAfterWindow"], 0)
        self.assertEqual(checks["modalContainersAfterWindow"], 0)
        self.assertEqual(boundary["latestOfficialHeadStatus"], "blocked-not-deployed")
        self.assertEqual(boundary["latestQualifiedOfficialHead"], release["elizaSource"])


if __name__ == "__main__":
    unittest.main()
