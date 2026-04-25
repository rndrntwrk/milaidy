# GitHub Connector

Connect your agent to GitHub for repository management, issue tracking, and pull request workflows using the `@elizaos/plugin-github` package.

## Prerequisites

- A GitHub personal access token or fine-grained token with the required scopes
- Optionally, a GitHub App with installation credentials

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
  "connectors": {
    "github": {
      "enabled": true
    }
  }
}
```

## Setup

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens) and generate a token with the scopes you need (e.g., `repo`, `issues`, `pull_requests`).
2. Install the plugin: `milady plugins install github`.
3. Set `GITHUB_API_TOKEN` as an environment variable or in your config.
4. Optionally set `GITHUB_OWNER` and `GITHUB_REPO` for a default repository context.
5. Start your agent.

## Features

- Repository management
- Issue tracking and creation
- Pull request workflows (create, review, merge)
- Code search and file access
- GitHub App authentication support
- Webhook-based event handling

## Related

- [Connectors overview](/guides/connectors#github)
