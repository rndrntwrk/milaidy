---
title: Twilio Connector
sidebarTitle: Twilio
description: Connect your agent to Twilio for SMS and voice using the @elizaos/plugin-twilio package.
---

Connect your agent to Twilio for SMS messaging and voice call capabilities.

## Overview

The Twilio connector is an elizaOS plugin that bridges your agent to Twilio's communication APIs. It supports inbound and outbound SMS, as well as voice call capabilities. This connector is available from the plugin registry.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-twilio` |
| Config key | `connectors.twilio` |
| Install | `milady plugins install twilio` |

## Setup Requirements

- Twilio Account SID and Auth Token
- A Twilio phone number

## Configuration

```json
{
  "connectors": {
    "twilio": {
      "enabled": true
    }
  }
}
```

## Environment Variables

### SMS

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number for sending/receiving |

### Voice Calls

| Variable | Description |
|----------|-------------|
| `VOICE_CALL_ENABLED` | Enable voice call support (`true`/`false`) |
| `VOICE_CALL_PROVIDER` | Voice provider (e.g. `twilio`) |
| `VOICE_CALL_TO_NUMBER` | Default outbound number |
| `VOICE_CALL_FROM_NUMBER` | Caller ID number |
| `VOICE_CALL_PUBLIC_URL` | Public URL for webhook callbacks |
| `VOICE_CALL_WEBHOOK_PATH` | Webhook path for inbound calls |
| `VOICE_CALL_WEBHOOK_PORT` | Port for voice webhook server |
| `VOICE_CALL_ALLOW_FROM` | Comma-separated allowlist of inbound caller numbers |
| `VOICE_CALL_INBOUND_POLICY` | Policy for inbound calls (`allow`, `reject`, `allowlist`) |
| `VOICE_CALL_INBOUND_GREETING` | Greeting message for inbound calls |
| `VOICE_CALL_MAX_CONCURRENT_CALLS` | Max simultaneous calls |
| `VOICE_CALL_MAX_DURATION_SECONDS` | Max call duration in seconds |

## Features

- SMS messaging (send and receive)
- Voice call capabilities (inbound and outbound)
- Webhook-based inbound message and call handling
- Configurable inbound call policies and allowlists

## Related

- [Connectors overview](/guides/connectors#twilio)
