# Tool Inventory Specification

## Overview

The autonomy kernel classifies and governs all tool calls through a risk
classification system and approval gate.

## Risk Classifications

| Class | Description | Approval Required | Examples |
|-------|-------------|-------------------|----------|
| `read-only` | No state change | No (auto-approved) | GET APIs, search, query |
| `reversible` | Mutable but undoable | Configurable | Send message, update config |
| `irreversible` | Cannot be undone | Always | Delete account, transfer funds |

## Classification Logic

See `src/autonomy/tools/risk-classification.ts`:

1. Extract tool permissions from `ToolContract.permissions`
2. Check against `DANGEROUS_PERMISSIONS` set
3. Any dangerous permission → `irreversible`
4. Any write permission → `reversible`
5. Otherwise → `read-only`

## Approval Flow

```
Tool Call → Risk Classification → Approval Gate
                                      │
                            ┌─────────┼─────────┐
                            ▼         ▼         ▼
                        read-only  reversible  irreversible
                            │         │         │
                        auto-approve  │    require approval
                                      │
                                 configurable
```

## Tool Contract

Every tool registered with the kernel must provide:
- `name`: Tool identifier
- `description`: Human-readable description
- `permissions`: Array of permission strings
- `parameters`: JSON Schema for input validation

## Governance Integration

Tools are subject to governance policies registered in the PolicyEngine.
Policies can override the default risk classification and add additional
approval requirements.
