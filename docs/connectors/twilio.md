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

## Setup

### 1. Get Your Twilio Credentials

1. Sign up at [twilio.com](https://www.twilio.com/)
2. From the Twilio Console dashboard, copy your **Account SID** and **Auth Token**
3. Purchase or configure a Twilio phone number

### 2. Configure Milady

```json
{
  "connectors": {
    "twilio": {
      "accountSid": "YOUR_ACCOUNT_SID",
      "authToken": "YOUR_AUTH_TOKEN",
      "phoneNumber": "+1234567890"
    }
  }
}
```

Or via environment variables:

```bash
export TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
export TWILIO_AUTH_TOKEN=YOUR_AUTH_TOKEN
export TWILIO_PHONE_NUMBER=+1234567890
```

## Environment Variables

### Core

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Yes | Twilio phone number (E.164 format) |
| `TWILIO_WEBHOOK_URL` | No | Webhook URL for inbound messages |
| `TWILIO_WEBHOOK_PORT` | No | Port for webhook listener |

### Voice Calls

| Variable | Required | Description |
|----------|----------|-------------|
| `VOICE_CALL_ENABLED` | No | Enable voice call capabilities |
| `VOICE_CALL_PROVIDER` | No | Voice call provider selection |
| `VOICE_CALL_FROM_NUMBER` | No | Phone number for outbound calls |
| `VOICE_CALL_TO_NUMBER` | No | Default destination phone number |
| `VOICE_CALL_ALLOW_FROM` | No | Comma-separated list of allowed caller numbers |
| `VOICE_CALL_PUBLIC_URL` | No | Public URL for voice call webhooks |
| `VOICE_CALL_INBOUND_POLICY` | No | Inbound call handling policy |

## Configuration Reference

| Field | Required | Description |
|-------|----------|-------------|
| `accountSid` | Yes | Twilio Account SID |
| `authToken` | Yes | Twilio Auth Token |
| `phoneNumber` | Yes | Twilio phone number (E.164 format) |
| `enabled` | No | Set `false` to disable (default: `true`) |

## Features

- SMS messaging (send and receive)
- Voice call capabilities (inbound and outbound)
- Webhook-based inbound message handling
- Configurable inbound call policies and greetings
- Concurrent call management

## Related

- [Twilio Plugin Reference](/plugin-registry/platform/twilio)
- [Connectors overview](/guides/connectors#twilio)
