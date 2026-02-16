# Safe Mode Design Specification

## Overview

Safe mode is an automatic safety mechanism that pauses all autonomous tool
execution when the kernel detects consecutive errors exceeding a configurable
threshold.

## State Machine

```
                   ┌──────────┐
            ──────▶│  READY   │◀──────────────────┐
           │       └────┬─────┘                    │
           │            │ execute()                 │
           │       ┌────▼─────┐                    │
           │       │ PLANNING │                    │
           │       └────┬─────┘                    │
           │            │                          │
           │       ┌────▼──────┐    error ≥ N  ┌───┴────────┐
           │       │ EXECUTING │──────────────▶│ SAFE_MODE  │
           │       └────┬──────┘               └────────────┘
           │            │ success                  │
           │       ┌────▼──────┐            exitSafeMode()
           └───────│ EVALUATING│                   │
                   └───────────┘                   │
                                                   ▼
                                              ┌─────────┐
                                              │  READY  │
                                              └─────────┘
```

## Configuration

```json
{
  "safeMode": {
    "maxConsecutiveErrors": 3,
    "cooldownMs": 60000
  }
}
```

## Behavior in Safe Mode

1. All `execute()` calls return immediately with a safe-mode error
2. Read-only operations continue (getConfig, getStatus, etc.)
3. Safe mode status is exposed via `GET /api/agent/safe-mode`
4. Exit requires explicit `POST /api/agent/safe-mode/exit`
5. Consecutive error counter resets on successful exit

## UI Integration

The `SafeModePanel` component in the React UI provides:
- Real-time status display (3-second polling)
- Exit request button with confirmation
- Error count and kernel state display

## Monitoring

Prometheus gauge `autonomy_safe_mode_active` (0/1) tracks safe mode state.
Alert rule fires when safe mode is active for > 5 minutes.
