"""Static release-contract tests for the Alice Modal launcher."""

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

    def test_exact_smoked_release_is_pinned(self):
        expected = {
            "044157c3d7d7f5dc97b7236ed4cbcfdb52d3b0b1",
            "dd57a68ef1e6c28c93c9974de61d4402492a0f31",
            "32374476301",
            "ghcr.io/rndrntwrk/milaidy-agent@sha256:e19d305b2bb619c0b84cad6b44caf4b5132efaafe90883283fe4dcb8859b548f",
        }
        for value in expected:
            self.assertIn(value, self.launcher)
            self.assertIn(value, self.runbook)
        self.assertRegex(
            self.launcher,
            re.compile(r'^REGISTRY_IMAGE = "ghcr\.io/rndrntwrk/milaidy-agent@sha256:[a-f0-9]{64}"$', re.MULTILINE),
        )
        self.assertNotIn("milaidy-agent:cloud-", self.launcher)

    def test_runtime_is_authenticated_and_scales_to_zero(self):
        for setting in (
            "min_containers=0",
            "buffer_containers=0",
            "max_containers=1",
            "scaledown_window=300",
            "timeout=14400",
            '"MILADY_AUTH_DISABLED": "0"',
            '"ELIZA_AUTH_DISABLED": "0"',
            '"API_AUTH_DISABLED": "0"',
        ):
            self.assertIn(setting, self.launcher)
        self.assertIn('modal.Secret.from_name("alice-ghcr-registry")', self.launcher)
        self.assertIn('modal.Secret.from_name("alice-runtime")', self.launcher)
        self.assertNotIn("CLOUDFLARE_API_TOKEN", self.launcher)

    def test_stream_and_ai_gateway_routes_are_explicit(self):
        self.assertIn('"STREAM555_BASE_URL": "https://stream.rndrntwrk.com"', self.launcher)
        self.assertIn('"STREAM555_CONTROL_PLUGIN_ENABLED": "true"', self.launcher)
        self.assertIn(
            '"OPENAI_BASE_URL": "https://alice-ai-gateway.gl4sspr1sm.workers.dev/v1"',
            self.launcher,
        )
        self.assertIn('modal.Secret.from_name("alice-cloudflare-ai")', self.launcher)

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
