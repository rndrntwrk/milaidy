---
title: "milady setup"
sidebarTitle: "setup"
description: "Initialize the Milady config file and agent workspace."
---

Initialize the Milady configuration file (`~/.milady/milady.json`) and bootstrap the agent workspace directory with required scaffold files. Run this command once before starting the agent for the first time, or to repair a missing or incomplete workspace.

## Usage

```bash
milady setup [options]
```

## Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--workspace <dir>` | string | (from config or `~/.milady/workspace/`) | Custom agent workspace directory to create or verify |
| `--provider <name>` | string | (interactive wizard) | Set a model provider non-interactively |
| `--key <value>` | string | (none) | Provider API key or URL passed on argv. Prefer `--key-stdin` for secrets |
| `--key-stdin` | boolean | false | Read the provider API key or URL from stdin |
| `--no-wizard` | boolean | false | Skip the interactive provider wizard entirely |

Global flags:

| Flag | Description |
|------|-------------|
| `-v, --version` | Print the current Milady version and exit |
| `--help`, `-h` | Show help for this command |
| `--profile <name>` | Use a named configuration profile (state dir becomes `~/.milady-<name>/`) |
| `--dev` | Shorthand for `--profile dev` (also sets the gateway port to `19001`) |
| `--verbose` | Enable informational runtime logs |
| `--debug` | Enable debug-level runtime logs |
| `--no-color` | Disable ANSI colors |

## Examples

```bash
# Run default setup (uses config or built-in defaults)
milady setup

# Initialize with a custom workspace directory
milady setup --workspace ~/my-agent-workspace

# Setup for a named profile
milady --profile staging setup

# Setup with an absolute path
milady setup --workspace /srv/milady/workspace

# Non-interactive Ollama setup for an isolated operator profile
milady --profile alice setup \
  --workspace ~/.milady-alice/workspace \
  --provider ollama \
  --key http://localhost:11434 \
  --no-wizard

# Read a provider key from stdin instead of argv
printf '%s\n' "$ANTHROPIC_API_KEY" | milady setup \
  --provider anthropic \
  --key-stdin \
  --no-wizard
```

## Behavior

`milady setup` performs the following steps in order:

1. **Load existing config** -- attempts to read `~/.milady/milady.json`. If the file does not exist (ENOENT), setup continues with default values. Any other error is re-thrown.

2. **Resolve workspace directory** -- the workspace path is resolved using this priority order:
   - `--workspace <dir>` flag (highest priority)
   - `agents.defaults.workspace` value from the loaded config
   - Built-in default (`~/.milady/workspace/`)

3. **Ensure the workspace** -- creates the workspace directory if it does not exist and writes all required bootstrap files (character definition, default settings, etc.). This step is idempotent -- running setup on an existing workspace is safe.

4. **Optionally persist provider config** -- if `--provider` and `--key` / `--key-stdin` are supplied, setup writes the resolved provider value into the config `env` section before continuing.

5. **Report success** -- prints the resolved workspace path and a "Setup complete." message.

## Output

```
→ No config found, using defaults
✓ Agent workspace ready: /Users/you/.milady/workspace
Setup complete.
```

When a provider is set non-interactively, setup prints an extra confirmation first:

```
✓ Saved OLLAMA_BASE_URL
✓ Config loaded
✓ Agent workspace ready: /Users/you/.milady/workspace

Setup complete.
```

If a config file exists:

```
✓ Config loaded
✓ Agent workspace ready: /Users/you/.milady/workspace
Setup complete.
```

## Configuration File Location

The config file path is resolved from environment variables:

| Variable | Effect |
|----------|--------|
| `MILADY_CONFIG_PATH` | Use this exact path for the config file |
| `MILADY_STATE_DIR` | Look for `milady.json` inside this directory |

If neither is set, the default is `~/.milady/milady.json`.

## What the Workspace Contains

The agent workspace is the directory where Milady stores:

- Character definition files
- Memory databases
- Session state
- Plugin data

Bootstrap files are only written on first setup or if they are missing. Existing files are not overwritten.

In a fresh workspace, Milady bootstraps these operator-facing files:

- `AGENTS.md`
- `BOOTSTRAP.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `TOOLS.md`
- `USER.md`

## Important Notes

- `milady setup` prepares config and workspace state, but it does **not** set the agent name by itself. If `agents.list[].name` is missing, the first `milady start` still opens onboarding.
- `MILADY_STATE_DIR` changes where `milady.json` lives, but the workspace path still follows the normal resolution order. In isolated environments, pass `--workspace` explicitly or set `agents.defaults.workspace` in config so setup, start, and doctor all point at the same directory.
- For source-checkout verification before the CLI is installed globally, use the repo runner:

```bash
bun scripts/run-node.mjs setup --no-wizard
```

## Related

- [milady start](/cli/start) -- start the agent runtime after setup
- [milady configure](/cli/configure) -- view configuration guidance
- [milady config](/cli/config) -- read and inspect config values
- [Environment Variables](/cli/environment) -- all environment variables
