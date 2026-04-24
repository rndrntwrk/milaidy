---
title: GitHub Connector
sidebarTitle: GitHub
description: Connect your agent to GitHub using the @elizaos/plugin-github package.
---

Connect your agent to GitHub for repository management, issue tracking, and pull request workflows.

## Overview

The GitHub connector is an elizaOS plugin that bridges your agent to the GitHub API. It supports repository management, issue tracking, pull request creation and review, and code search. This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-github` |
| Config key | `connectors.github` |
| Install | `milady plugins install github` |

## Setup Requirements

- GitHub API token (personal access token or fine-grained token)

## Setup

### 1. Create a GitHub Personal Access Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token** (classic) or **Fine-grained token**
3. Select the scopes needed for your use case (e.g., `repo`, `issues`, `pull_requests`)
4. Copy the generated token

### 2. Configure Milady

```json
{
  "connectors": {
    "github": {
      "apiToken": "YOUR_API_TOKEN",
      "owner": "YOUR_GITHUB_OWNER",
      "repo": "YOUR_GITHUB_REPO"
    }
  }
}
```

Or via environment variables:

```bash
export GITHUB_API_TOKEN=YOUR_API_TOKEN
export GITHUB_OWNER=YOUR_GITHUB_OWNER
export GITHUB_REPO=YOUR_GITHUB_REPO
```

## Configuration Reference

All fields are defined under `connectors.github` in `milady.json`.

| Field | Required | Description |
|-------|----------|-------------|
| `apiToken` | Yes | GitHub personal access token |
| `owner` | No | Default GitHub repository owner (username or organization) |
| `repo` | No | Default GitHub repository name |
| `branch` | No | Default branch name (defaults to `main`) |
| `enabled` | No | Set `false` to disable (default: `true`) |

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

- [GitHub plugin reference](/plugin-registry/platform/github)
- [Connectors overview](/guides/connectors#github)
- [Configuration reference](/configuration)
