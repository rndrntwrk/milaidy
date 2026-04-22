---
title: "Zalo User Plugin"
sidebarTitle: "Zalo User"
description: "Zalo personal-account connector for one-to-one messaging workflows"
---

Zalo personal-account connector for direct messaging.

**Package:** `@elizaos/plugin-zalouser`

## Overview

The Zalo User plugin connects Milady agents to a Zalo personal account, enabling one-to-one messaging workflows. Agents can send and receive messages through the user's Zalo account.

## Installation

```bash
milady plugins install zalouser
```

## Auto-Enable

This plugin auto-enables when the `ZALO_USER_PHONE` environment variable is set.

## Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ZALO_USER_PHONE` | string | Yes | Zalo account phone number |
| `ZALO_USER_PASSWORD` | string | Yes (sensitive) | Zalo account password |
| `ZALO_USER_IMEI` | string | No | Device IMEI for authentication |
