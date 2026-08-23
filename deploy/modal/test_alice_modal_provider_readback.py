"""Unit regressions for sanitized Modal provider layout admission."""

import importlib.util
import json
import sys
import types
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import AsyncMock, patch


modal_module = types.ModuleType("modal")
modal_client_module = types.ModuleType("modal.client")
modal_client_module._Client = object
modal_proto_module = types.ModuleType("modal_proto")
modal_proto_module.api_pb2 = types.SimpleNamespace()
sys.modules.setdefault("modal", modal_module)
sys.modules.setdefault("modal.client", modal_client_module)
sys.modules.setdefault("modal_proto", modal_proto_module)

MODULE_PATH = Path(__file__).with_name("alice_modal_provider_readback.py")
SPEC = importlib.util.spec_from_file_location("alice_modal_provider_readback", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Item:
    def __init__(self, *, object_id="", secret_id="", label=""):
        self.object_id = object_id
        self.secret_id = secret_id
        self.label = label


class ModalProviderSecretResolutionTests(unittest.TestCase):
    def test_resolves_exact_mounted_secret_set(self):
        objects = [
            Item(object_id="fu-function"),
            Item(object_id="st-release"),
            Item(object_id="st-registry"),
        ]
        secrets = [
            Item(secret_id="st-registry", label="alice-ghcr-registry"),
            Item(
                secret_id="st-release",
                label="alice-production-core-" + "a" * 64 + "-12345-1",
            ),
            Item(secret_id="st-unmounted", label="unmounted-secret"),
        ]
        self.assertEqual(
            MODULE._resolve_mounted_secret_objects(objects, secrets),
            [
                {"id": "st-registry", "name": "alice-ghcr-registry"},
                {
                    "id": "st-release",
                    "name": "alice-production-core-" + "a" * 64 + "-12345-1",
                },
            ],
        )

    def test_rejects_unmapped_mounted_st_object(self):
        objects = [Item(object_id="st-release"), Item(object_id="st-unknown")]
        secrets = [Item(secret_id="st-release", label="alice-release")]
        with self.assertRaisesRegex(
            RuntimeError, "ALICE_MODAL_PROVIDER_READBACK_INVALID"
        ):
            MODULE._resolve_mounted_secret_objects(objects, secrets)

    def test_safe_bootstrap_enforces_bounds_without_a_release_secret(self):
        readback = AsyncMock(return_value={"mode": "enforced"})
        with (
            patch.object(sys, "argv", [str(MODULE_PATH), "--safe-bootstrap"]),
            patch.object(MODULE, "_readback", readback),
            redirect_stdout(StringIO()),
        ):
            MODULE.main()
        readback.assert_awaited_once_with(None, enforce_autoscaler=True)

    def test_secret_inventory_retains_exact_provider_object_ids(self):
        items = [
            Item(secret_id="st-bbbbbbbbbbbbbbbbbbbbbb", label="secret-b"),
            Item(secret_id="st-aaaaaaaaaaaaaaaaaaaaaa", label="secret-a"),
        ]
        self.assertEqual(
            MODULE._secret_inventory(items),
            [
                {"id": "st-aaaaaaaaaaaaaaaaaaaaaa", "name": "secret-a"},
                {"id": "st-bbbbbbbbbbbbbbbbbbbbbb", "name": "secret-b"},
            ],
        )

    def test_delete_secret_requires_the_exact_provider_object_id(self):
        delete = AsyncMock(return_value={"deleted": True})
        name = "alice-production-core-" + "a" * 64 + "-12345-1"
        with (
            patch.object(
                sys,
                "argv",
                [
                    str(MODULE_PATH),
                    "--delete-secret",
                    name,
                    "st-aaaaaaaaaaaaaaaaaaaaaa",
                ],
            ),
            patch.object(MODULE, "_delete_secret", delete),
            redirect_stdout(StringIO()),
        ):
            MODULE.main()
        delete.assert_awaited_once_with(name, "st-aaaaaaaaaaaaaaaaaaaaaa")

    def test_capture_current_remains_read_only(self):
        readback = AsyncMock(return_value={"mode": "captured"})
        with (
            patch.object(sys, "argv", [str(MODULE_PATH), "--capture-current"]),
            patch.object(MODULE, "_readback", readback),
            redirect_stdout(StringIO()),
        ):
            MODULE.main()
        readback.assert_awaited_once_with(None, enforce_autoscaler=False)

    def test_terminal_capture_wraps_fresh_bounded_autoscaler_enforcement(self):
        provider = {"providerVersion": 52}
        readback = AsyncMock(return_value=provider)
        stdout = StringIO()
        with (
            patch.object(sys, "argv", [str(MODULE_PATH), "--capture-terminal"]),
            patch.object(MODULE, "_readback", readback),
            redirect_stdout(stdout),
        ):
            MODULE.main()
        value = json.loads(stdout.getvalue())
        self.assertEqual(
            set(value),
            {"schemaVersion", "observedAt", "provider"},
        )
        self.assertEqual(
            value["schemaVersion"],
            "alice.modal-current-provider-readback.v1",
        )
        self.assertRegex(value["observedAt"], r"^\d{4}-\d{2}-\d{2}T.*Z$")
        self.assertEqual(value["provider"], provider)
        readback.assert_awaited_once_with(None, enforce_autoscaler=True)


if __name__ == "__main__":
    unittest.main()
