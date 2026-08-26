"""Sanitized Modal provider admission for the protected Alice release.

This script uses the exact pinned Modal 1.5.4 client protocol. Capture mode is
strictly read-only and records that this client cannot observe autoscaler
settings. Candidate mode, which runs only after PAUSE_ALL, enforces the bounded
policy and records the complete effective settings from the mutation response.
"""

import asyncio
from datetime import datetime, timezone
import json
import re
import sys

from modal.client import _Client
from modal_proto import api_pb2


APP_NAME = "alice-runtime"
APP_ID = "ap-oFaCNy2jJDFalZienNB2Ht"
ENVIRONMENT = "main"
RELEASE_SECRET = re.compile(
    r"alice-production-core-[a-f0-9]{64}-[1-9][0-9]*-[1-9][0-9]*"
)
SECRET_ID = re.compile(r"st-[A-Za-z0-9]{20,32}")


def _invalid():
    raise RuntimeError("ALICE_MODAL_PROVIDER_READBACK_INVALID")


def _resolve_stopped_app_identity(app, app_items, task_items):
    """Admit the exact inert stopped Alice identity for recovery readiness."""
    candidates = [
        item
        for item in app_items
        if item.app_id == APP_ID
        or item.name == APP_NAME
        or item.description == APP_NAME
    ]
    retained = candidates[0] if len(candidates) == 1 else None
    if (
        app.app_id != ""
        or app.previous_app_id != APP_ID
        or app.environment_name != ENVIRONMENT
        or app.lifecycle.app_state != api_pb2.APP_STATE_STOPPED
        or not isinstance(app.lifecycle.version, int)
        or app.lifecycle.version < 1
        or not isinstance(app.lifecycle.stopped_at, (int, float))
        or app.lifecycle.stopped_at <= 0
        or len(candidates) > 1
        or (
            retained is not None
            and (
                retained.app_id != APP_ID
                or retained.name != APP_NAME
                or retained.description != APP_NAME
                or retained.state != api_pb2.APP_STATE_STOPPED
                or retained.n_running_tasks != 0
                or retained.stopped_at != app.lifecycle.stopped_at
            )
        )
        or len(task_items) != 0
    ):
        _invalid()
    return APP_ID


async def _resolve_app_identity(client, app, allow_stopped_recovery):
    if app.app_id:
        if (
            app.app_id != APP_ID
            or app.environment_name != ENVIRONMENT
            or app.lifecycle.app_state != api_pb2.APP_STATE_DEPLOYED
            or not isinstance(app.lifecycle.version, int)
            or app.lifecycle.version < 1
        ):
            _invalid()
        return APP_ID, False
    if not allow_stopped_recovery:
        _invalid()
    app_list = await client.stub.AppList(
        api_pb2.AppListRequest(environment_name=ENVIRONMENT)
    )
    task_list = await client.stub.TaskList(
        api_pb2.TaskListRequest(environment_name=ENVIRONMENT, app_id=APP_ID)
    )
    return (
        _resolve_stopped_app_identity(app, app_list.apps, task_list.tasks),
        True,
    )


def _resolve_mounted_secret_objects(layout_objects, secret_items):
    """Resolve every mounted st-* object to exactly one provider secret name."""
    secret_names_by_id = {}
    for item in secret_items:
        if item.secret_id in secret_names_by_id:
            _invalid()
        secret_names_by_id[item.secret_id] = item.label

    mounted_secret_ids = [
        item.object_id for item in layout_objects if item.object_id.startswith("st-")
    ]
    if (
        len(mounted_secret_ids) != len(set(mounted_secret_ids))
        or any(secret_id not in secret_names_by_id for secret_id in mounted_secret_ids)
    ):
        _invalid()
    mounted_secret_objects = sorted(
        (
            {"id": secret_id, "name": secret_names_by_id[secret_id]}
            for secret_id in mounted_secret_ids
        ),
        key=lambda item: (item["name"], item["id"]),
    )
    if (
        {item["id"] for item in mounted_secret_objects} != set(mounted_secret_ids)
        or len({item["name"] for item in mounted_secret_objects})
        != len(mounted_secret_objects)
    ):
        _invalid()
    return mounted_secret_objects


def _secret_inventory(secret_items):
    values = []
    for item in secret_items:
        if (
            not SECRET_ID.fullmatch(item.secret_id)
            or not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,127}", item.label)
        ):
            _invalid()
        values.append({"id": item.secret_id, "name": item.label})
    values.sort(key=lambda item: (item["name"], item["id"]))
    if (
        len({item["id"] for item in values}) != len(values)
        or len({item["name"] for item in values}) != len(values)
    ):
        _invalid()
    return values


async def _list_secret_inventory():
    client = await _Client.from_env()
    response = await client.stub.SecretList(
        api_pb2.SecretListRequest(environment_name=ENVIRONMENT)
    )
    return _secret_inventory(response.items)


async def _delete_secret(name, secret_id):
    if not RELEASE_SECRET.fullmatch(name) or not SECRET_ID.fullmatch(secret_id):
        _invalid()
    client = await _Client.from_env()
    before_response = await client.stub.SecretList(
        api_pb2.SecretListRequest(environment_name=ENVIRONMENT)
    )
    before = _secret_inventory(before_response.items)
    if [item for item in before if item["name"] == name] != [
        {"id": secret_id, "name": name}
    ]:
        _invalid()
    await client.stub.SecretDelete(api_pb2.SecretDeleteRequest(secret_id=secret_id))
    after_response = await client.stub.SecretList(
        api_pb2.SecretListRequest(environment_name=ENVIRONMENT)
    )
    after = _secret_inventory(after_response.items)
    if any(item["id"] == secret_id or item["name"] == name for item in after):
        _invalid()
    return {"deleted": True, "id": secret_id, "name": name}


async def _readback(
    expected_release_secret,
    enforce_autoscaler=False,
    allow_stopped_recovery=False,
    require_stopped_recovery=False,
):
    if require_stopped_recovery and not allow_stopped_recovery:
        _invalid()
    client = await _Client.from_env()
    app = await client.stub.AppGetByDeploymentName(
        api_pb2.AppGetByDeploymentNameRequest(
            name=APP_NAME,
            environment_name=ENVIRONMENT,
        )
    )
    app_id, stopped_recovery = await _resolve_app_identity(
        client, app, allow_stopped_recovery
    )
    if require_stopped_recovery and not stopped_recovery:
        _invalid()
    layout_response = await client.stub.AppGetLayout(
        api_pb2.AppGetLayoutRequest(app_id=app_id)
    )
    history_response = await client.stub.AppDeploymentHistory(
        api_pb2.AppDeploymentHistoryRequest(app_id=app_id)
    )
    secret_response = await client.stub.SecretList(
        api_pb2.SecretListRequest(environment_name=ENVIRONMENT)
    )
    layout = layout_response.app_layout
    function_ids = dict(layout.function_ids)
    if set(function_ids) != {"alice_web"}:
        _invalid()
    function_id = function_ids["alice_web"]
    function_object = next(
        (item for item in layout.objects if item.object_id == function_id),
        None,
    )
    if function_object is None or not function_object.HasField(
        "function_handle_metadata"
    ):
        _invalid()
    metadata = function_object.function_handle_metadata
    mounted_secret_objects = _resolve_mounted_secret_objects(
        layout.objects, secret_response.items
    )
    mounted_secret_names = {
        item["name"] for item in mounted_secret_objects
    }
    if (
        expected_release_secret is not None
        and expected_release_secret not in mounted_secret_names
    ):
        _invalid()
    history = list(history_response.app_deployment_histories)
    if (
        not history
        or app.lifecycle.version < 1
        or history_response.production_app_version != app.lifecycle.version
        or history[0].version != app.lifecycle.version
    ):
        _invalid()
    head = history[0]
    commit_hash = head.commit_info.commit_hash
    if not re.fullmatch(r"[a-f0-9]{40}", commit_hash):
        _invalid()
    autoscaler_enforcement = {"status": "provider-unverifiable"}
    if enforce_autoscaler:
        autoscaler_response = await client.stub.FunctionUpdateSchedulingParams(
            api_pb2.FunctionUpdateSchedulingParamsRequest(
                function_id=function_id,
                settings=api_pb2.AutoscalerSettings(
                    min_containers=0,
                    max_containers=1,
                    buffer_containers=0,
                    scaledown_window=300,
                ),
            )
        )
        current = autoscaler_response.current_settings
        if (
            current.min_containers != 0
            or current.max_containers != 1
            or current.buffer_containers != 0
            or current.scaledown_window != 300
        ):
            _invalid()
        autoscaler_enforcement = {
            "status": "provider-enforced",
            "functionId": function_id,
            "minContainers": current.min_containers,
            "maxContainers": current.max_containers,
            "bufferContainers": current.buffer_containers,
            "scaledownWindow": current.scaledown_window,
        }
    terminal_app = await client.stub.AppGetByDeploymentName(
        api_pb2.AppGetByDeploymentNameRequest(
            name=APP_NAME,
            environment_name=ENVIRONMENT,
        )
    )
    terminal_app_id, terminal_stopped_recovery = await _resolve_app_identity(
        client, terminal_app, allow_stopped_recovery
    )
    terminal_layout_response = await client.stub.AppGetLayout(
        api_pb2.AppGetLayoutRequest(app_id=terminal_app_id)
    )
    terminal_history_response = await client.stub.AppDeploymentHistory(
        api_pb2.AppDeploymentHistoryRequest(app_id=terminal_app_id)
    )
    terminal_secret_response = await client.stub.SecretList(
        api_pb2.SecretListRequest(environment_name=ENVIRONMENT)
    )
    terminal_mounted_secret_objects = _resolve_mounted_secret_objects(
        terminal_layout_response.app_layout.objects,
        terminal_secret_response.items,
    )
    if (
        terminal_app_id != app_id
        or terminal_stopped_recovery != stopped_recovery
        or terminal_app.environment_name != app.environment_name
        or terminal_app.lifecycle.version != app.lifecycle.version
        or (
            stopped_recovery
            and terminal_app.lifecycle.SerializeToString(deterministic=True)
            != app.lifecycle.SerializeToString(deterministic=True)
        )
        or terminal_layout_response.app_layout.SerializeToString(
            deterministic=True
        )
        != layout.SerializeToString(deterministic=True)
        or terminal_history_response.production_app_version
        != history_response.production_app_version
        or not terminal_history_response.app_deployment_histories
        or terminal_history_response.app_deployment_histories[0].SerializeToString(
            deterministic=True
        )
        != head.SerializeToString(deterministic=True)
        or terminal_mounted_secret_objects != mounted_secret_objects
    ):
        _invalid()
    return {
        "appId": app_id,
        "environment": app.environment_name or ENVIRONMENT,
        "providerVersion": app.lifecycle.version,
        "providerHistory": [
            {
                "providerVersion": head.version,
                "rollbackVersion": head.rollback_version,
                "clientVersion": head.client_version,
                "deployedBy": head.deployed_by,
                "commitHash": commit_hash,
                "dirty": head.commit_info.dirty,
            }
        ],
        "functionIds": function_ids,
        "function": {
            "name": metadata.function_name,
            "id": function_id,
            "webUrl": metadata.web_url,
            "inputFormats": [
                api_pb2.DataFormat.Name(value)
                for value in metadata.supported_input_formats
            ],
        },
        "mountedSecretObjects": mounted_secret_objects,
        "mountedVolumeIds": sorted(
            item.object_id
            for item in layout.objects
            if item.object_id.startswith("vo-")
            or item.HasField("volume_metadata")
        ),
        "imageObjectIds": sorted(
            item.object_id
            for item in layout.objects
            if item.object_id.startswith("im-")
        ),
        "autoscalerEnforcement": autoscaler_enforcement,
    }


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--secret-inventory":
        result = asyncio.run(_list_secret_inventory())
        sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")))
        sys.stdout.write("\n")
        return
    if len(sys.argv) == 2 and sys.argv[1] == "--capture-terminal":
        provider = asyncio.run(
            _readback(
                None,
                enforce_autoscaler=True,
                allow_stopped_recovery=False,
            )
        )
        result = {
            "schemaVersion": "alice.modal-current-provider-readback.v1",
            "observedAt": datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "provider": provider,
        }
        sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")))
        sys.stdout.write("\n")
        return
    if len(sys.argv) == 4 and sys.argv[1] == "--delete-secret":
        result = asyncio.run(_delete_secret(sys.argv[2], sys.argv[3]))
        sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")))
        sys.stdout.write("\n")
        return
    if len(sys.argv) != 2:
        _invalid()
    capture_mode = sys.argv[1]
    read_only_capture = capture_mode in {
        "--capture-current",
        "--capture-recovery-readiness",
        "--capture-stopped-reentry",
    }
    expected_release_secret = (
        None
        if capture_mode
        in {
            "--capture-current",
            "--capture-recovery-readiness",
            "--capture-stopped-reentry",
            "--enforce-current",
            "--safe-bootstrap",
        }
        else capture_mode
    )
    if (
        expected_release_secret is not None
        and not RELEASE_SECRET.fullmatch(expected_release_secret)
    ):
        _invalid()
    options = {
        "enforce_autoscaler": not read_only_capture,
        "allow_stopped_recovery": capture_mode
        in {"--capture-recovery-readiness", "--capture-stopped-reentry"},
    }
    if capture_mode == "--capture-stopped-reentry":
        options["require_stopped_recovery"] = True
    result = asyncio.run(_readback(expected_release_secret, **options))
    sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
