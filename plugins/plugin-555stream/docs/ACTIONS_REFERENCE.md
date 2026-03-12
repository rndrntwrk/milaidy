# 555 Stream — Actions Reference

This is the canonical public action list for `@rndrntwrk/plugin-555stream`.

## Approval policy

Approval labels below mean:
- `No` — action is expected to execute immediately
- `Yes` — action is approval-gated in normal production use
- `Conditional` — approval depends on payload or host policy

## Core connection and stream actions

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_HEALTHCHECK` | Connection | No | Verify API reachability and auth viability | none |
| `STREAM555_BOOTSTRAP_SESSION` | Connection | No | Create/resume a session and bind the realtime channel | `sessionId` |
| `STREAM555_STREAM_STATUS` | Stream | No | Read current stream and platform status | none |
| `STREAM555_STREAM_START` | Stream | Yes | Start a live stream with a concrete input source | `input`, `title`, `description` |
| `STREAM555_APP_LIST` | Stream | No | List known app-viewer sources for website capture | optional filters |
| `STREAM555_GO_LIVE_APP` | Stream | Yes | Start a website/app capture stream | `url` or app descriptor |
| `STREAM555_STREAM_FALLBACK` | Stream | Yes | Switch to fallback/always-on source | fallback mode/source |
| `STREAM555_STREAM_STOP` | Stream | Yes | Stop the active broadcast | `_approvalId` on re-invoke |

## Channel and routing actions

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_PLATFORM_CONFIG` | Channels | Conditional | Save channel RTMP URL and stream key | `platformId`, `rtmpUrl`, `streamKey` |
| `STREAM555_PLATFORM_TOGGLE` | Channels | No | Enable or disable a channel for go-live | `platformId`, `enabled` |

## Ads and monetization

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_AD_LIST` | Ads | No | List ads configured for the bound session | optional filters |
| `STREAM555_AD_BREAK_TRIGGER` | Ads | Yes | Trigger an L-bar / squeeze-back ad break | `adId`, `duration` |
| `STREAM555_AD_BREAK_DISMISS` | Ads | Yes | Dismiss an active ad break | none |
| `STREAM555_AD_BREAK_SCHEDULE` | Ads | Yes | Schedule an ad break for later execution | `adId`, `startAt`, `duration` |

## Alerts, templates, scenes, and overlays

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_ALERT_CREATE` | Alerts | No | Create and queue a stream alert | `eventType`, `message`, `username`, `amount` |
| `STREAM555_ALERT_CONTROL` | Alerts | Conditional | Skip, pause, resume, or clear the alert queue | `action` |
| `STREAM555_TEMPLATE_LIST` | Templates | No | List available overlay templates | `category`, `type` |
| `STREAM555_TEMPLATE_APPLY` | Templates | No | Create a graphic from a template | `templateId`, template overrides |
| `STREAM555_OVERLAY_SUGGEST` | Overlays | No | Suggest overlays based on context/state | contextual text/options |
| `STREAM555_SCENE_TRANSITION` | Scenes | No | Transition to another scene/effect | `sceneId`, `transition` |
| `STREAM555_LAYOUT_SET` | Layout | No | Apply a known layout arrangement | `layoutId` or layout payload |
| `STREAM555_SCENE_SET_ACTIVE` | Scenes | No | Set the active scene directly | `sceneId` |
| `STREAM555_STATE_PATCH` | State | No | Patch studio state deterministically | `patch` |

## Graphics

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_GRAPHICS_CREATE` | Graphics | No | Create a graphic/overlay element | graphic payload |
| `STREAM555_GRAPHICS_UPDATE` | Graphics | No | Update an existing graphic | `graphicId`, patch |
| `STREAM555_GRAPHICS_TOGGLE` | Graphics | No | Show or hide a graphic | `graphicId`, `visible` |
| `STREAM555_GRAPHICS_DELETE` | Graphics | Yes | Permanently delete a graphic | `graphicId`, `_approvalId` |

## Sources

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_SOURCE_CREATE` | Sources | No | Create a source in the studio | source payload |
| `STREAM555_SOURCE_UPDATE` | Sources | No | Update an existing source | `sourceId`, patch |
| `STREAM555_SOURCE_DELETE` | Sources | Yes | Permanently delete a source | `sourceId`, `_approvalId` |

## Guests and chat

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_GUEST_INVITE` | Guests | Yes | Invite an external guest/participant | guest metadata |
| `STREAM555_GUEST_REMOVE` | Guests | Yes | Remove a guest from the session | `guestId`, `_approvalId` |
| `STREAM555_CHAT_START` | Chat | No | Start chat ingestion/relay | `platforms[]` |
| `STREAM555_CHAT_READ` | Chat | No | Read recent chat messages | `platform`, `limit` |
| `STREAM555_CHAT_SEND` | Chat | No | Send a chat message | `message`, `platform` |
| `STREAM555_CHAT_STOP` | Chat | No | Stop chat ingestion | none |

## Media

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_UPLOAD_IMAGE` | Media | No | Upload an image from URL | `url` |
| `STREAM555_UPLOAD_VIDEO` | Media | No | Upload a video from URL | `url` |
| `STREAM555_VIDEO_ADD_URL` | Media | No | Create a video asset from HLS or direct URL | `url`, `name` |
| `STREAM555_VIDEO_DELETE` | Media | Yes | Permanently delete a video asset | `videoId`, `_approvalId` |

## Radio

| Action | Category | Approval | Purpose | Typical inputs |
| --- | --- | --- | --- | --- |
| `STREAM555_RADIO_CONFIG` | Radio | No | Configure radio/audio behavior | config payload |
| `STREAM555_RADIO_CONTROL` | Radio | No | Start/stop/pause/resume radio control | `action` |

## Compatibility actions

These remain available for migration safety. New public operator docs should prefer the canonical actions above.

| Action | Compatibility surface | Purpose |
| --- | --- | --- |
| `STREAM555_GO_LIVE` | Legacy stream start alias | Older go-live flow |
| `STREAM555_GO_LIVE_SEGMENTS` | Legacy segmented go-live | Segment-driven launch |
| `STREAM555_SCREEN_SHARE` | Legacy screen-share alias | Screen-share start |
| `STREAM555_END_LIVE` | Legacy stop alias | Stream stop alias |
| `STREAM555_DESTINATIONS_APPLY` | Legacy routing alias | Apply configured outputs |
| `STREAM555_AD_CREATE` | Legacy ad inventory helper | Create ad entity |
| `STREAM555_AD_TRIGGER` | Legacy ad trigger alias | Trigger ad |
| `STREAM555_AD_DISMISS` | Legacy ad dismiss alias | Dismiss ad |
| `STREAM555_EARNINGS_ESTIMATE` | Legacy monetization read | Revenue estimate |
| `STREAM555_SEGMENT_STATE` | Legacy segments read | Read segment state |
| `STREAM555_SEGMENT_OVERRIDE` | Legacy segments write | Override segment behavior |
| `STREAM555_PIP_ENABLE` | Legacy PiP helper | Enable PiP |
| `STREAM555_ADS_SETUP_DEFAULTS` | Legacy ad bootstrap | Seed ad defaults |
| `STREAM555_ADS_ROTATION_START` | Legacy rotation helper | Start rotation |
| `STREAM555_ADS_TRIGGER_NEXT` | Legacy rotation helper | Trigger next scheduled ad |
| `STREAM555_ADS_STATUS` | Legacy ads read | Read ad rotation status |
| `STREAM555_ADS_EARNINGS` | Legacy monetization read | Ad earnings |
| `STREAM555_AUTH_APIKEY_CREATE` | Legacy auth admin helper | Create API key |
| `STREAM555_AUTH_APIKEY_LIST` | Legacy auth admin helper | List API keys |
| `STREAM555_AUTH_APIKEY_REVOKE` | Legacy auth admin helper | Revoke API key |
| `STREAM555_AUTH_APIKEY_SET_ACTIVE` | Legacy auth admin helper | Mark API key active |
| `STREAM555_AUTH_DISCONNECT` | Legacy auth UI helper | Disconnect auth |
| `STREAM555_AUTH_WALLET_PROVISION_LINKED` | Legacy wallet helper | Provision wallet via sw4p |
| `STREAM555_AUTH_WALLET_CHALLENGE` | Legacy wallet helper | Get wallet challenge |
| `STREAM555_AUTH_WALLET_VERIFY` | Legacy wallet helper | Verify wallet challenge |
| `STREAM555_AUTH_WALLET_LOGIN` | Legacy wallet helper | Full wallet login |

## Public guidance

- New integrations should start with `STREAM555_HEALTHCHECK`, `STREAM555_BOOTSTRAP_SESSION`, `STREAM555_STREAM_STATUS`.
- New operator UX should use canonical names and categories, not legacy aliases.
- If an action requires `_approvalId`, the correct approval flow is part of `COMPLEX_FLOWS.md`.
