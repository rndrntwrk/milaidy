# GitHub Connector

Connect your agent to GitHub for repository management, issue tracking, and pull request workflows using the `@elizaos/plugin-github` package.

> **Note:** GitHub is registered as a **feature** plugin (not a connector) in the plugin registry. It provides GitHub API integration but is categorized under features in `plugins.json`.

## Overview

The GitHub plugin is an elizaOS feature plugin that bridges your agent to the GitHub API. It supports repository management, issue tracking, pull request creation and review, and code search. This plugin is available from the plugin registry.

> **Note:** GitHub is categorized as a feature plugin, not a connector. It does not use the `connectors.github` config pattern. Install it via the plugin registry and configure with environment variables.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-github` |
| Config key | `connectors.github` |
| Install | `milady plugins install @elizaos/plugin-github` |

## Setup Requirements

- GitHub API token (personal access token or fine-grained token)

## Setup

### 1. Create a GitHub Personal Access Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token** (classic) or **Fine-grained token**
3. Select the scopes needed for your use case (e.g., `repo`, `issues`, `pull_requests`)
4. Copy the generated token

### 2. Configure Milady

| Name | Required | Description |
|------|----------|-------------|
| `GITHUB_API_TOKEN` | Yes | Personal access token or fine-grained token for API authentication |
| `GITHUB_OWNER` | No | Default repository owner (username or organization) |
| `GITHUB_REPO` | No | Default repository name |
| `GITHUB_BRANCH` | No | Default branch name (default: `main`) |
| `GITHUB_APP_ID` | No | GitHub App ID for app-based authentication |
| `GITHUB_APP_PRIVATE_KEY` | No | GitHub App private key for app-based authentication |
| `GITHUB_INSTALLATION_ID` | No | GitHub App installation ID |
| `GITHUB_WEBHOOK_SECRET` | No | Secret for validating GitHub webhook payloads |

Install the plugin from the registry:

```bash
milady plugins install github
```

Configure in `~/.milady/milady.json`:

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
| `GITHUB_BRANCH` | Default branch name |
| `GITHUB_APP_ID` | GitHub App ID (for GitHub App authentication) |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (for GitHub App authentication) |
| `GITHUB_INSTALLATION_ID` | GitHub App installation ID |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret for verifying GitHub webhook payloads |

## Features

- Repository management
- Issue tracking and creation
- Pull request workflows (create, review, merge)
- Code search and file access
- GitHub App authentication support
- Webhook-based event handling

## Related

- [GitHub plugin reference](/plugin-registry/platform/github)
- [Connectors overview](/guides/connectors#github)
- [Configuration reference](/configuration)
