# GitHub Connector

Connect your agent to GitHub for repository management, issue tracking, and pull request workflows using the `@elizaos/plugin-github` package.

## Prerequisites

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
  "plugins": {
    "allow": ["@elizaos/plugin-github"]
  }
}
```

## Setup

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_API_TOKEN` | Yes | Personal access token or fine-grained token |
| `GITHUB_OWNER` | No | Default repository owner |
| `GITHUB_REPO` | No | Default repository name |
| `GITHUB_BRANCH` | No | Default branch name (default: `main`) |
| `GITHUB_APP_ID` | No | GitHub App ID (for GitHub App authentication) |
| `GITHUB_APP_PRIVATE_KEY` | No | GitHub App private key |
| `GITHUB_INSTALLATION_ID` | No | GitHub App installation ID |
| `GITHUB_WEBHOOK_SECRET` | No | Secret for webhook verification |

## Features

- Repository management
- Issue tracking and creation
- Pull request workflows (create, review, merge)
- Code search and file access
- GitHub App authentication support
- Webhook-based event handling

## Related

- [Connectors overview](/guides/connectors#github)
