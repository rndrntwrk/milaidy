---
title: "milady doctor"
sidebarTitle: "doctor"
description: "Run diagnostics to verify your Milady installation."
---

`milady doctor` runs a real health check over the current Milady environment. It inspects runtime prerequisites, config resolution, model-provider setup, storage paths, and optional port availability, then prints either a human-readable report or JSON for CI.

## Usage

```bash
milady doctor
```

## Options

| Flag | Description |
|------|-------------|
| `--no-ports` | Skip the port availability checks |
| `--fix` | Auto-run any safe Milady sub-command fixes |
| `--json` | Emit machine-readable JSON instead of terminal output |

## Checks

### Runtime

| Check | Pass Condition |
|-------|---------------|
| Runtime | Bun or Node meets the minimum runtime requirement |
| `node_modules` | Dependencies are installed in the current project root |
| Build artifacts | `dist/entry.js` exists, or a source-run warning is emitted |

### Configuration

| Check | Pass Condition |
|-------|---------------|
| Config file | Resolved config file exists and parses successfully |
| Model API key | At least one supported provider variable is configured |
| Host binding | Bind/token configuration is safe for the current host exposure |

### Storage

| Check | Pass Condition |
|-------|---------------|
| State directory | Resolved state directory exists or is safely creatable |
| Database | Database path exists, or a warning explains that it will be created on first start |
| Disk space | The state volume has enough free space |

### Connectivity

| Check | Pass Condition |
|-------|---------------|
| Port `31337` | The runtime port is available, or doctor warns who is using it |
| Port `2138` | The Control UI/API port is available, or doctor warns who is using it |

## Example

```bash
milady doctor --no-ports
```

```text
Milady Health Check

  System
  ✓ Runtime              Bun 1.3.1
  ✓ node_modules         /path/to/repo/node_modules
  ✓ Build artifacts      /path/to/repo/dist

  Configuration
  ✓ Config file          /tmp/mld008-state-proof/milady.json
  ✓ Model API key        OLLAMA_BASE_URL set (Ollama (local))
  ✓ Host binding         Loopback only (default)

  Storage
  ✓ State directory      /tmp/mld008-state-proof
  ✓ Database             /tmp/mld008-state-proof/workspace/.eliza/.elizadb
  ✓ Disk space           15.5 GB free

  Everything looks good. Ready to run milady start.
```

## JSON Mode

Use JSON mode for automation or acceptance evidence:

```bash
milady doctor --json --no-ports
```

Doctor exits non-zero when any check returns `fail`.

## Auto-fix

`--fix` only runs safe Milady subcommands such as `milady setup`. It does not shell out to arbitrary remediation strings.

## Source Checkout Validation

If you are validating from a source checkout instead of an installed CLI, use the repo runner:

```bash
bun scripts/run-node.mjs doctor --no-ports
```

## Related

- [milady setup](/cli/setup) -- initialize the workspace
- [milady config](/cli/config) -- inspect configuration values
- [milady models](/cli/models) -- verify model provider key configuration
- [milady plugins test](/cli/plugins) -- validate custom drop-in plugins
- [Environment Variables](/cli/environment) -- all environment variables that affect diagnostics
