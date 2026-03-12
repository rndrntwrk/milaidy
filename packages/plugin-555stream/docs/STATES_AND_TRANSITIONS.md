# 555 Stream — States and Transitions

This document is the public state reference for the `555 Stream` plugin.

## Operator-visible lifecycle

```mermaid
stateDiagram-v2
    [*] --> NotInstalled
    NotInstalled --> InstalledDisabled: package present
    InstalledDisabled --> Enabled: host enables plugin
    Enabled --> Loaded: service start succeeds
    Loaded --> Authenticated: auth verify succeeds
    Authenticated --> SessionBound: bootstrap succeeds
    SessionBound --> Ready: stream actions available
    Ready --> Degraded: dependency or sync issue
    Degraded --> Ready: recovery succeeds
    Ready --> Live: stream start succeeds
    Live --> Ready: stream stop succeeds
    Loaded --> Failed: service start/runtime error
    Failed --> Enabled: reload after fix
```

## State meanings

| State | Meaning |
| --- | --- |
| `installed` | package exists in the host |
| `enabled` | host policy says it should load |
| `loaded` | `StreamControlService` is running |
| `authenticated` | HTTP auth is valid |
| `sessionBound` | realtime session is bound |
| `ready` | plugin can execute stream control actions |
| `live` | an active broadcast exists |
| `degraded` | stream control is up, but a dependency is degraded |

## Channel state

Channel state is independent from stream lifecycle.

```mermaid
stateDiagram-v2
    [*] --> Unconfigured
    Unconfigured --> Saved: credentials stored
    Saved --> Enabled: channel toggle on
    Enabled --> Ready: required values present
    Ready --> Live: stream start binds the channel
    Live --> Ready: stream stops
    Enabled --> Saved: channel toggle off
```

| Channel token | Meaning |
| --- | --- |
| `channelsSaved` | at least one channel has credentials persisted |
| `channelsEnabled` | at least one channel is enabled |
| `channelsReady` | enabled channels are fully configured |

## Approval state

```mermaid
stateDiagram-v2
    [*] --> Requested
    Requested --> Pending: approval created
    Pending --> Approved: operator resolves approval
    Pending --> Rejected: operator rejects approval
    Pending --> Expired: ttl exceeded
    Approved --> ReInvoked: action called with _approvalId
    ReInvoked --> Executed
```

Actions commonly approval-gated:
- `STREAM555_STREAM_START`
- `STREAM555_STREAM_STOP`
- `STREAM555_STREAM_FALLBACK`
- destructive delete actions
- guest invite/remove
- ad break mutations in production

## Auth flow

```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> ApiKeyConfigured
    Disconnected --> StaticBearerConfigured
    ApiKeyConfigured --> ExchangedToken
    ExchangedToken --> Authenticated
    StaticBearerConfigured --> Authenticated
    Authenticated --> Refreshing: token nearing expiry
    Refreshing --> Authenticated: refresh succeeds
    Refreshing --> Degraded: refresh fails
```

## Go-live flow

```mermaid
stateDiagram-v2
    [*] --> Ready
    Ready --> Launching: stream start or go-live app
    Launching --> Live: control-plane accepts job
    Launching --> Failed: validation or upstream failure
    Live --> Recovering: fallback/reconnect path
    Recovering --> Live: recovery succeeds
    Recovering --> Failed
    Live --> Stopping: stop requested
    Stopping --> Ready: stop confirmed
```

## Public rules

- `configured` must not be used as a synonym for `loaded`
- `authenticated` must not imply `sessionBound`
- `ready` means session-bound and action-capable, not merely installed
- channel readiness must be displayed separately from auth/session readiness
