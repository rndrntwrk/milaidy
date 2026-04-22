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

- GitHub API token (personal access token, fine-grained token, or GitHub App credentials)

## Minimal Configuration

```json
{
  "connectors": {
    "github": {
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_API_TOKEN` | Yes | Personal access token or fine-grained token |
| `GITHUB_OWNER` | No | Default repository owner (username or org) |
| `GITHUB_REPO` | No | Default repository name |
| `GITHUB_BRANCH` | No | Default branch (e.g. `main`) |
| `GITHUB_WEBHOOK_SECRET` | No | For GitHub App webhook verification |
| `GITHUB_APP_ID` | No | GitHub App ID (for App-based auth) |
| `GITHUB_APP_PRIVATE_KEY` | No | GitHub App private key PEM (for App-based auth) |
| `GITHUB_INSTALLATION_ID` | No | GitHub App installation ID (for App-based auth) |

## Authentication Methods

### Fine-Grained Personal Access Token (recommended)

Fine-grained tokens are scoped to specific repositories and permissions, and they expire automatically.

1. Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. Set a token name (e.g. "Milady") and expiration (90 days is reasonable).
3. Under **Repository access**, select **Only select repositories** and pick the repos you want.
4. Under **Repository permissions**, grant at minimum:
   - **Contents**: Read (Read and write if you want the agent to push code)
   - **Issues**: Read and write
   - **Pull requests**: Read and write
   - **Metadata**: Read (always required)
5. Click **Generate token**. Copy it immediately — it starts with `github_pat_` and is only shown once.

### Classic Personal Access Token

Use a classic token when fine-grained tokens don't support the scope you need (e.g. private packages).

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens).
2. Click **Generate new token (classic)**.
3. Grant the scopes you need (`repo`, `read:org`, etc.).
4. Copy the token.

### GitHub App (for teams and production)

GitHub Apps are better for team use — installations are easier to audit and can be installed org-wide.

1. Register a new GitHub App at [github.com/settings/apps/new](https://github.com/settings/apps/new).
2. Generate a private key and note the App ID.
3. Install the app into the repos or org — note the Installation ID.
4. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_INSTALLATION_ID` in your environment or config.

## Features

- Repository management (read files, create branches, push code)
- Issue tracking and creation
- Pull request workflows (create, review, merge)
- Code search and file access
- Webhook-driven event handling (with GitHub App)

## Troubleshooting

**"401 Unauthorized" when the agent tries any action.**
Token is wrong, expired, or doesn't have the repo scoped. Re-check in GitHub settings.

**"403 Resource not accessible by personal access token."**
The token is valid but doesn't have permission for the specific action. Most common cause: you granted Contents: Read but the agent tried to write. Go back and grant Contents: Read and write.

**"Not found" when reading a repo you know exists.**
Fine-grained tokens are strictly allowlist — if the repo isn't in the list, the agent can't see it. Go back to the token page and add the repo.

## Related

- [GitHub plugin reference](/plugin-registry/platform/github)
- [Connectors overview](/guides/connectors#github)
- [Configuration reference](/configuration)
