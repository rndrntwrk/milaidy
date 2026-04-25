# Twilio Connector

Connect your agent to Twilio for SMS messaging and voice call capabilities using the `@elizaos/plugin-twilio` package.

## Prerequisites

The Twilio plugin is an elizaOS feature plugin that bridges your agent to Twilio's communication APIs. It supports inbound and outbound SMS, as well as voice call capabilities. This plugin is available from the plugin registry.

> **Note:** Twilio is categorized as a feature plugin, not a connector. Configure it with environment variables rather than the `connectors` section.

## Package Info

| Field | Value |
|-------|-------|
| Package | `@elizaos/plugin-twilio` |
| Category | Feature plugin |
| Install | `milady plugins install twilio` |

## Setup Requirements

- Twilio Account SID and Auth Token
- A Twilio phone number

## Configuration

| Name | Required | Description |
|------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number for sending/receiving |
| `TWILIO_WEBHOOK_URL` | No | Webhook URL for inbound messages |
| `TWILIO_WEBHOOK_PORT` | No | Port for the webhook server |
| `VOICE_CALL_ENABLED` | No | Enable voice call capabilities |
| `VOICE_CALL_PROVIDER` | No | Voice call provider selection |
| `VOICE_CALL_FROM_NUMBER` | No | Phone number for outbound calls |
| `VOICE_CALL_TO_NUMBER` | No | Default destination phone number |
| `VOICE_CALL_ALLOW_FROM` | No | Comma-separated list of allowed caller numbers |
| `VOICE_CALL_PUBLIC_URL` | No | Public URL for voice call webhooks |
| `VOICE_CALL_WEBHOOK_PATH` | No | Webhook path for voice call events |
| `VOICE_CALL_WEBHOOK_PORT` | No | Port for voice call webhook listener |
| `VOICE_CALL_INBOUND_POLICY` | No | Inbound call handling policy |
| `VOICE_CALL_INBOUND_GREETING` | No | Greeting message for inbound connections |
| `VOICE_CALL_MAX_CONCURRENT_CALLS` | No | Maximum number of concurrent calls |
| `VOICE_CALL_MAX_DURATION_SECONDS` | No | Maximum call duration in seconds |

Install the plugin from the registry:

```bash
milady plugins install twilio
```

Configure in `~/.milady/milady.json`:

```json
{
  "connectors": {
    "twilio": {
      "enabled": true
    }
  }
}
```

## Setup

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number for sending/receiving |
| `TWILIO_WEBHOOK_URL` | No | Webhook URL for inbound messages |
| `TWILIO_WEBHOOK_PORT` | No | Port for webhook listener |
| `VOICE_CALL_ENABLED` | No | Enable voice call capabilities |
| `VOICE_CALL_PROVIDER` | No | Voice call provider selection |
| `VOICE_CALL_FROM_NUMBER` | No | Phone number for outbound calls |
| `VOICE_CALL_TO_NUMBER` | No | Default destination phone number |
| `VOICE_CALL_ALLOW_FROM` | No | Comma-separated list of allowed caller numbers |
| `VOICE_CALL_PUBLIC_URL` | No | Public URL for voice call webhooks |
| `VOICE_CALL_INBOUND_POLICY` | No | Inbound call handling policy |
| `VOICE_CALL_INBOUND_GREETING` | No | Greeting message for inbound calls |
| `VOICE_CALL_WEBHOOK_PATH` | No | Webhook endpoint path for voice calls |
| `VOICE_CALL_WEBHOOK_PORT` | No | Port for voice call webhook listener |
| `VOICE_CALL_MAX_CONCURRENT_CALLS` | No | Maximum number of concurrent calls |
| `VOICE_CALL_MAX_DURATION_SECONDS` | No | Maximum call duration in seconds |

## Features

- SMS messaging (send and receive)
- Voice call capabilities (inbound and outbound)
- Webhook-based inbound message handling
- Configurable inbound call policies and greetings
- Concurrent call management
- Call duration limits

## Related

- [Connectors overview](/guides/connectors#twilio)
