---
title: GitHub Connector
sidebarTitle: GitHub
description: Connect your agent to GitHub using the @elizaos/plugin-github package.
---

Connect your agent to GitHub for repository management, issue tracking, and pull request workflows.

## Overview

The GitHub plugin is an elizaOS feature plugin that bridges your agent to the GitHub API. It supports repository management, issue tracking, pull request creation and review, and code search. This plugin is available from the plugin registry.

> **Note:** GitHub is categorized as a feature plugin, not a connector. It does not use the `connectors.github` config pattern. Install it via the plugin registry and configure with environment variables.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-github` |
| Category | Feature plugin |
| Install | `milady plugins install github` |

## Setup Requirements

- GitHub API token (personal access token or fine-grained token)

## Configuration

```json
{
  "plugins": {
    "allow": ["@elizaos/plugin-github"]
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_API_TOKEN` | Personal access token or fine-grained token |
| `GITHUB_OWNER` | Default repository owner |
| `GITHUB_REPO` | Default repository name |

## Features

- Repository management
- Issue tracking and creation
- Pull request workflows (create, review, merge)
- Code search and file access

## Related

- [Connectors overview](/guides/connectors#github)
