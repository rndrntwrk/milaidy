---
title: "Obsidian Plugin"
sidebarTitle: "Obsidian"
description: "Obsidian vault integration for Milady — read, search, and manage notes in your Obsidian vault."
---

> **Not in plugin registry.** `@elizaos/plugin-obsidian` is not registered in `plugins.json`. This plugin may not be installable via `milady plugins install`.

The Obsidian plugin connects Milady agents to your local [Obsidian](https://obsidian.md) vault, enabling agents to read, search, and interact with your notes and knowledge base.

**Package:** `@elizaos/plugin-obsidian`

> **Note:** This plugin is an upstream elizaOS feature plugin and is not included in the bundled `plugins.json` registry. It auto-enables when `OBSIDIAN_VAULT_PATH` is set and is installable from the remote elizaOS plugin registry.

## Installation

```bash
milady plugins install obsidian
```

## Auto-Enable

The plugin auto-enables when `OBSIDIAN_VAULT_PATH` is set:

```bash
export OBSIDIAN_VAULT_PATH=/path/to/your/vault
```

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `OBSIDIAN_VAULT_PATH` | Yes | Path to your Obsidian vault directory |

### milady.json Example

```json
{
  "features": {
    "obsidian": true
  }
}
```

## Features

- Read and search notes in your Obsidian vault
- Access your personal knowledge graph
- Note management via CLI integration

## Related

- [Knowledge Plugin](/plugin-registry/knowledge) — RAG-based knowledge retrieval
- [Browser Plugin](/plugin-registry/browser) — Web content access
