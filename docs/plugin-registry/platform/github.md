---
title: "GitHub Plugin"
sidebarTitle: "GitHub"
description: "GitHub connector for Milady — interact with repositories, issues, and pull requests."
---

The GitHub plugin connects Milady agents to GitHub, enabling interactions with repositories, issues, pull requests, and other GitHub resources.

**Package:** `@elizaos/plugin-github`

## Installation

```bash
milady plugins install github
```

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

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `apiToken` | Yes | GitHub personal access token |
| `owner` | No | Default GitHub repository owner (username or organization) |
| `repo` | No | Default GitHub repository name |
| `branch` | No | Default branch name (defaults to `main`) |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_API_TOKEN` | Yes | Personal access token or fine-grained token |
| `GITHUB_OWNER` | No | Default repository owner (username or organization) |
| `GITHUB_REPO` | No | Default repository name |
| `GITHUB_BRANCH` | No | Default branch name (defaults to `main`) |
| `GITHUB_APP_ID` | No | GitHub App ID for app-based authentication |
| `GITHUB_APP_PRIVATE_KEY` | No | GitHub App private key |
| `GITHUB_INSTALLATION_ID` | No | GitHub App installation ID |
| `GITHUB_WEBHOOK_SECRET` | No | Secret for validating webhook payloads |

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
