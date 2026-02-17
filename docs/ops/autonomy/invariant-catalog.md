# Invariant Catalog

This catalog defines the built-in cross-system invariants with explicit severity and ownership.

| Invariant ID | Severity | Owner | Description |
| --- | --- | --- | --- |
| `invariant:state-machine:consistency` | `critical` | `autonomy:workflow` | State machine is in a valid state after pipeline execution. |
| `invariant:event-store:integrity` | `warning` | `autonomy:event-store` | Pipeline execution produced at least proposed and validated events. |
| `invariant:approval:no-orphans` | `warning` | `autonomy:approvals` | No orphaned approval requests after pipeline completion. |
