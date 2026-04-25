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

## Configuration

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
| `GITHUB_OWNER` | No | Default repository owner (username or organization) |
| `GITHUB_REPO` | No | Default repository name |
| `GITHUB_BRANCH` | No | Default branch name (defaults to `main`) |
| `GITHUB_APP_ID` | No | GitHub App ID for app-based authentication |
| `GITHUB_APP_PRIVATE_KEY` | No | GitHub App private key for app-based authentication |
| `GITHUB_INSTALLATION_ID` | No | GitHub App installation ID |
| `GITHUB_WEBHOOK_SECRET` | No | Secret for validating GitHub webhook payloads |

## Features

- Repository management
- Issue tracking and creation
- Pull request workflows (create, review, merge)
- Code search and file access

## Related

- [Connectors overview](/guides/connectors#github)
