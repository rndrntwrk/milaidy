---
title: "Twilio Plugin"
sidebarTitle: "Twilio"
description: "Twilio connector for Milady — SMS and voice integration via the Twilio API."
---

The Twilio plugin connects Milady agents to Twilio, enabling SMS messaging and voice interactions through Twilio phone numbers.

**Package:** `@elizaos/plugin-twilio`

## Installation

```bash
milady plugins install twilio
```

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
      "phoneNumber": "YOUR_PHONE_NUMBER"
    }
  }
}
```

Or via environment variables:

```bash
export TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
export TWILIO_AUTH_TOKEN=YOUR_AUTH_TOKEN
export TWILIO_PHONE_NUMBER=YOUR_PHONE_NUMBER
```

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `accountSid` | Yes | Twilio Account SID |
| `authToken` | Yes | Twilio Auth Token |
| `phoneNumber` | Yes | Twilio phone number (E.164 format) |
| `enabled` | No | Set `false` to disable (default: `true`) |
| `webhookUrl` | No | Webhook URL for inbound messages |
| `webhookPort` | No | Port for webhook listener |

### Voice Call Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `voiceCallEnabled` | No | Enable voice call capabilities |
| `voiceCallProvider` | No | Voice call provider selection |
| `voiceCallFromNumber` | No | Phone number for outbound calls |
| `voiceCallToNumber` | No | Default destination phone number |
| `voiceCallAllowFrom` | No | Comma-separated list of allowed caller numbers |
| `voiceCallPublicUrl` | No | Public URL for voice call webhooks |
| `voiceCallInboundPolicy` | No | Inbound call handling policy |
| `voiceCallInboundGreeting` | No | Greeting message for inbound callers |
| `voiceCallMaxConcurrentCalls` | No | Maximum number of concurrent calls |
| `voiceCallMaxDurationSeconds` | No | Maximum call duration in seconds |

## Environment Variables

```bash
export TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
export TWILIO_AUTH_TOKEN=YOUR_AUTH_TOKEN
export TWILIO_PHONE_NUMBER=YOUR_PHONE_NUMBER
```

## Related

- [Connectors Guide](/guides/connectors) — General connector documentation
