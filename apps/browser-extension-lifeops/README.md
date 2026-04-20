# LifeOps browser extension

Chrome (Manifest V3) extension for LifeOps. Reports per-hostname focus time
to the local Milady / LifeOps agent over a loopback WebSocket
(default `ws://127.0.0.1:31339/ext`).

> **Status — backend is NOT wired.** The default WebSocket endpoint has no
> server-side handler yet. The extension will connect-retry in a 5-second
> loop and buffer telemetry in-memory. A separate companion extension at
> `eliza/apps/app-lifeops/extensions/lifeops-browser/` uses the existing
> REST route at `/api/lifeops/browser/companions/sync`; this new extension
> is a parallel effort that still needs an agent-side listener.

## Build

```sh
bun install
bun run build            # → dist/chrome/
bun run package:chrome   # → dist/artifacts/lifeops-chrome-<version>.zip
```

Safari is not currently a build target: there is no committed Xcode Safari
Web Extension wrapper, and the repo's iOS platform ships only a Content
Blocker (different extension type). Re-add the `safari` target once a real
wrapper project exists.

## Load unpacked in Chrome

1. `bun run build`
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select `dist/chrome/`.
5. Click the LifeOps action to open the popup, or right-click →
   **Options** to change the agent WebSocket URL.

## What it tracks

- Per-hostname focus time. Sessions open on tab/window focus and on
  `visibilitychange`; they close when focus leaves the host.
- `mail.google.com` and `drive.google.com` are tracked as distinct
  domains. True eTLD+1 rollup requires the public-suffix list and is
  out of scope for this package.
- Buckets are flushed to the agent every `flushIntervalMs` (default 60s).
  `chrome.alarms` enforces a 1-minute minimum period, so sub-minute
  intervals round up.
- No page content is reported — only hostname + focus duration.

## Privacy

- Honors the `activityReportingEnabled` toggle on the options page.
  When disabled the flush loop stays idle.

## Tests

```sh
bunx vitest run
bunx tsc --noEmit
```
