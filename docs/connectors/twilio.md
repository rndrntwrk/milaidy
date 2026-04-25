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

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number for sending/receiving |
| `TWILIO_WEBHOOK_URL` | No | Webhook URL for inbound messages |
| `TWILIO_WEBHOOK_PORT` | No | Port for the webhook server |
| `VOICE_CALL_ENABLED` | No | Enable voice call capabilities |
| `VOICE_CALL_PROVIDER` | No | Voice call provider selection |
| `VOICE_CALL_FROM_NUMBER` | No | Outbound caller ID number |
| `VOICE_CALL_TO_NUMBER` | No | Default destination number |
| `VOICE_CALL_ALLOW_FROM` | No | Comma-separated allowed inbound callers |
| `VOICE_CALL_INBOUND_POLICY` | No | Inbound call policy |
| `VOICE_CALL_INBOUND_GREETING` | No | Greeting message for inbound calls |
| `VOICE_CALL_MAX_CONCURRENT_CALLS` | No | Maximum concurrent calls |
| `VOICE_CALL_MAX_DURATION_SECONDS` | No | Maximum call duration in seconds |

## Features

- SMS messaging (send and receive)
- Voice call capabilities (inbound and outbound)
- Webhook-based inbound message handling
- Configurable inbound call policy and greeting
- Concurrent call limiting

## Related

- [Connectors overview](/guides/connectors#twilio)
