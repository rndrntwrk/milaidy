"""Static safety contract for the first-release Modal rollback anchor."""

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class AliceSafeBootstrapContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.launcher = (
            ROOT / "deploy/modal/alice_safe_bootstrap.py"
        ).read_text()
        cls.server = (
            ROOT / "deploy/modal/alice_safe_bootstrap_server.mjs"
        ).read_text()

    def test_bootstrap_is_proxy_authenticated_zero_idle_and_inert(self):
        for setting in (
            "min_containers=0",
            "buffer_containers=0",
            "max_containers=1",
            "scaledown_window=300",
            "requires_proxy_auth=True",
            'modal.Secret.from_name("alice-ghcr-registry")',
        ):
            self.assertIn(setting, self.launcher)
        self.assertNotIn("secrets=[", self.launcher)
        for forbidden in (
            'modal.Secret.from_name("alice-runtime")',
            "alice-wallet",
            "alice-stream-control",
            "alice-stream-destinations",
            "alice-capture-api-token",
            "OPENAI_API_KEY",
            "MILADY_API_TOKEN",
            "milady.mjs",
        ):
            self.assertNotIn(forbidden, self.launcher)
        self.assertIn("alice_safe_bootstrap_server.mjs", self.launcher)

    def test_bootstrap_server_exposes_only_bound_health_and_fail_closed_503(self):
        self.assertIn('request.method === "GET"', self.server)
        self.assertIn('request.url === "/api/health"', self.server)
        self.assertIn('safeBootstrap: true', self.server)
        self.assertIn('paused: true', self.server)
        self.assertIn('ready: false', self.server)
        self.assertIn('response.statusCode = 503', self.server)
        for forbidden in (
            "/v1/chat/completions",
            "child_process",
            "fetch(",
            "OPENAI_API_KEY",
            "MILADY_API_TOKEN",
        ):
            self.assertNotIn(forbidden, self.server)


if __name__ == "__main__":
    unittest.main()
