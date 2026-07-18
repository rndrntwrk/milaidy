# Alice Application and Livestream Recovery

## Status

Approved design for the first shippable recovery project. This specification
covers the Alice application, companion, capture, livestream, and production
promotion rail. The large Eliza upstream fold is a separate follow-up project
and cannot enter this release until it independently passes the same parity
gates.

## Goal

Restore Alice as a working production application on the updated Milady base,
then prove a real livestream in which operator-side avatar actions are visible
in the broadcast and a game or application window is the primary source with
Alice visible in picture-in-picture.

## Why This Release Is Split

The last proven Alice deployment is `deploy/alice-companion-render` at
`e855a9bb16e9b19809e4ac0d8f93fb5effb672d0`. It contains the working Alice
surface and points to the proven Eliza runtime at
`17930c97b97cedb8fe64124e327c023cd526cc8b`.

Milady's reviewed July upstream ports are available on
`integration/alice-upstream-2026-07-07` at
`3191bb1a788074b617c903fc111058246b1c7845`. Alice's first-party companion
vendoring work is available on `integration/alice-eliza-fold-2026-07-09` at
`d747565d1b3d01f8c141597e9bdc61ad69190eda`, but its wider Eliza fold was not
completed. The current Eliza `develop` branch has advanced by 1,177 commits
beyond the July target.

Combining that large runtime migration with livestream recovery would make it
impossible to distinguish companion regressions from upstream-runtime changes.
This release therefore keeps the proven Eliza pin, ports the reviewed Milady
work, completes ownership of Alice's companion surface, and proves broadcast
behavior. The current Eliza fold begins only after this release is stable.

## Release Branch and Source Inputs

Implementation occurs in the isolated worktree:

```text
/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-alice-livestream-recovery-2026-07-18
```

The owning branch is:

```text
release/alice-livestream-recovery-2026-07-18
```

The release starts from `e855a9bb1`. Changes are admitted from the following
sources only after commit-level review:

1. The reviewed Milady WP0-WP2 ports represented by PR #207 and branch head
   `3191bb1a7`.
2. The first-party companion package introduced by `d747565d1`, including the
   protected Alice controls and tests.
3. The relevant runtime-boundary fixes from
   `alice-runtime-boundary-browser-entry`: browser/server barrel separation,
   build-variant exports, build orchestration, and safe registry loading.
4. The capture-service and Modal launcher changes already proven during the
   June broadcast exercise, after their uncommitted state is converted into
   reviewable commits in their owning repositories.

No branch is merged wholesale. Each admitted commit must have an explicit
reason, affected-surface list, and focused verification result. Conflict
resolution must preserve the protected Alice surfaces below.

## Protected Alice Surface

The release is not acceptable unless all of these remain present and usable:

- The Milady #9 model, preview, and background assets.
- A full-viewport companion stage with the avatar correctly framed.
- Bottom chat composer, microphone affordance, send action, and chat bubbles.
- The left-side action pill and expandable action drawer.
- The complete avatar action and emote catalog; the prior catalog exposed 41
  emotes and must not silently collapse to a stub or empty list.
- Go Live button and the existing in-companion Go Live modal.
- Camera, screen-share, and supported launch-mode selection.
- Operator controls, action log, emote picker, audio, language, and theme
  controls that exist in the proven Alice surface.
- A single shared avatar state for operator view and broadcast output so an
  operator-triggered emote or action is reflected in the live capture.
- Screen or game sharing where the selected source is primary and Alice is the
  small picture-in-picture participant.

No generic upstream companion, substitute avatar, older Alice layout, or
separate broadcast-only avatar instance satisfies this contract.

## Architecture

### 1. Milady application and companion

The Milady application remains the user-facing shell. Alice's companion is a
first-party package in the Milady repository rather than an opaque patch inside
the Eliza submodule. The Vite/browser entry may expose UI-only symbols, while
the Node/server entry must remain free of React and browser-only imports.

The companion owns rendering and operator interaction. It consumes the
existing authenticated Milady APIs for chat, action catalog, emote execution,
stream setup, and broadcast control. Milady #9 assets are provisioned as an
explicit release input and verified before build and at runtime.

### 2. Runtime and control plane

The release keeps Eliza pinned at `17930c97b9`. Railway remains the 555stream
control-plane, Postgres, and Redis rail. Cloudflare remains the DNS, edge,
Stream, Worker, and R2 rail. This release does not reconstruct the retired AWS
deployment and does not reopen RunPod unless Modal is demonstrably unable to
run the tested artifact.

Authentication remains enabled on every public runtime and capture endpoint.
The browser receives its Milady API token through the URL fragment and sends it
as a bearer token. Capture API authentication remains enabled. Secret values
must never appear in commits, terminal evidence, screenshots, or chat output.

### 3. Capture and broadcast

Modal runs two on-demand applications:

- `alice-runtime` serves the authenticated Milady application and `/companion`.
- `alice-capture-service` launches Chromium against that same `/companion`
  instance and sends the rendered output to the configured RTMP destination.

The capture URL must target `/companion#token=<token>`. It must not target a
separate avatar renderer or `/broadcast` onboarding surface. This preserves one
logical avatar state across operator interaction and live output.

For screen or game sharing, the selected source fills the broadcast canvas and
the companion avatar is composited as picture-in-picture. The first recovery
proof uses one representative game or application window. Bespoke per-game
automation, game agents, and reaction intelligence are follow-up projects.

## Data Flow

```text
Authenticated operator opens /companion
  -> Milady loads Milady #9 and the action catalog
  -> operator opens Go Live and selects a configured destination
  -> 555stream validates destination readiness
  -> capture service opens the same authenticated companion URL
  -> capture service sends the composed canvas to RTMP
  -> operator triggers an avatar action or emote
  -> Milady runtime publishes the action to the shared companion state
  -> operator canvas and capture canvas render the same action
  -> platform playback shows the action

For screen/game share:
  -> operator selects a browser, application, or game source
  -> the shared scene promotes that source to the primary layer
  -> Alice remains visible in the picture-in-picture layer
  -> the capture service broadcasts the composed scene
```

## User Experience Requirements

### Companion stage

- The avatar must be visible without scrolling and remain correctly framed at
  desktop and mobile viewport sizes.
- Controls must not overlap the avatar, chat composer, or each other.
- The action pill must remain discoverable without expanding by itself.
- Expanding the action drawer must not shift or resize the stage.
- Empty, loading, unauthorized, and API-failure states must be explicit and
  must not produce request storms.

### Action drawer

- Keyboard focus enters the drawer when opened and returns to the trigger when
  closed.
- Escape and the close control dismiss it.
- Action groups remain scan-friendly and usable with keyboard and pointer.
- Disabled or unauthorized actions explain their state without exposing
  credentials or raw backend errors.
- Triggering an action provides immediate pending, success, or failure feedback
  and does not create duplicate requests.

### Go Live modal

- The modal preserves the existing Setup, Channels, Mode, and Review sequence.
- The content area scrolls independently while the header, progress context,
  and primary navigation remain reachable.
- The modal fits short desktop and mobile viewports without content escaping
  behind the footer.
- Continue is disabled until the current step has valid input.
- Authentication, destination pairing, readiness, and launch errors are shown
  at the step where they can be corrected.
- Closing or cancelling the modal does not start capture or create a live
  session.

### Screen and game sharing

- The source picker identifies a concrete browser, screen, application, or
  game source rather than silently falling back to the avatar-only scene.
- The selected source is visibly primary before Go Live can continue.
- Alice remains legible in picture-in-picture without covering critical source
  content.
- Stopping source sharing returns to the avatar camera scene without ending the
  live session unless the operator explicitly ends it.

## Error and Retry Behavior

- A `401` ends background polling for that authenticated resource and surfaces
  one re-authentication state. It must not retry continuously.
- A `429` respects `Retry-After` when supplied and otherwise uses bounded
  exponential backoff with jitter. Concurrent duplicate requests are
  coalesced.
- WebSocket or event-stream reconnects use a single owner and bounded backoff;
  React remounts must not create duplicate streams.
- Capture start is idempotent for one operator session. A repeated click cannot
  create two ffmpeg or RTMP sessions.
- A failed broadcast start leaves the companion usable and exposes a retry.
- A failed platform playback probe does not masquerade as success merely
  because ffmpeg is running.
- Every stop path attempts capture shutdown first, records the final state, and
  then allows compute teardown.

## Verification Gates

The gates are sequential. A failure stops promotion and returns the release to
the owning implementation task.

### Gate A: source and asset integrity

- The release diff contains only reviewed Alice/Milady changes.
- Eliza remains pinned at `17930c97b9`.
- Milady #9 model, preview, background, emotes, Draco assets, and companion
  static assets are present in the assembled artifact.
- No secret value or private credential file is tracked.

### Gate B: build and focused tests

- Dependency hydration uses Node `22.22.0` from `.nvmrc` and the repository's
  Bun lockfile.
- Companion, action-catalog, Go Live, API backoff, stream relay, and capture
  security tests pass.
- The full production build exits zero.
- The server build does not import React or `import.meta.env` through its root
  barrel.
- The SPA resolves all required browser exports without a runtime export error.

### Gate C: local application acceptance

- The host-local backend or a disposable local container reaches its ready
  marker and health endpoint.
- `/companion` renders Milady #9, chat, action pill, action drawer, and Go Live.
- Chat sends and receives a response.
- The action catalog is populated and one emote visibly completes.
- The Go Live modal completes all non-live setup steps using test-safe local or
  configured staging state.
- Desktop and mobile screenshots demonstrate no overlap, clipped modal footer,
  broken scroll, blank canvas, or substitute avatar.
- Browser console and network evidence show no unresolved exports, uncaught
  exceptions, sustained `401` loops, or sustained `429` loops.

### Gate D: on-demand staging acceptance

Before deployment, record the active operator as owner, an absolute UTC expiry
no later than four hours after start, and the evidence directory. Modal apps
remain stopped until Gates A-C pass.

Deploy commands run from the 555 workspace root:

```bash
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_runtime.py
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_capture_service.py
```

The direct Modal revision URLs are the release-candidate endpoints. Production
traffic is not moved during this gate. Record the deployed revision and image
digest before testing so the accepted runtime can be promoted without a
different source build.

Staging must prove:

- Runtime health is ready and required plugins report no startup failure.
- Authenticated `/companion` renders the same protected surface as local.
- Chat and avatar actions work without request storms.
- The Go Live flow reads configured destinations without exposing secret
  values.
- Capture health is green and one authenticated capture session starts.

If active testing pauses for more than 15 minutes, both Modal apps are stopped.
The test window can be resumed with a fresh deployment while still before the
recorded expiry.

### Gate E: livestream and game-source proof

Use one configured platform destination, with Twitch preferred because the
June proof used it. The evidence must show:

1. Capture start response and running status.
2. Operator companion before the action.
3. Broadcast playback before the action.
4. Operator-triggered emote or avatar action.
5. Operator companion after the action.
6. Broadcast playback showing the same action.
7. A selected game or application source as the primary broadcast content.
8. Alice visible in the picture-in-picture layer over that source.
9. Clean capture stop and platform-session end.

An RTMP connection alone is not completion. Platform playback or an equivalent
authenticated platform readback must show the rendered output.

### Gate F: production promotion

Promote the exact immutable artifact and configuration set that passed Gates
A-E. Rebuilding from a different checkout is prohibited. Alice runtime and
capture promotion routes production traffic to the accepted Modal revision.
Any required 555stream or 555-bot deployment continues to use that service's
established host-side/manual production rail. No new GitHub Actions deployment
path is introduced.

After promotion, perform a short production smoke covering health,
authentication, Milady #9 rendering, chat, action catalog, Go Live readiness,
one avatar action, and capture start/stop. A public livestream is only repeated
if the platform destination is explicitly designated for the smoke.

## Evidence Contract

Each run creates a timestamped directory containing:

- `manifest.json`: repository, branch, commit, Eliza pin, artifact digest,
  environment name, operator, start time, expiry, and final result.
- `local-build.log`: command, exit code, and the relevant success markers.
- `runtime-health.json` and `capture-health.json` with secrets redacted.
- Desktop and mobile companion screenshots.
- Action drawer and Go Live modal screenshots.
- Browser console and failed-request summary.
- Capture start, status, and stop responses with tokens and RTMP keys redacted.
- Operator-before, operator-after, playback-before, playback-after, and
  game-source-with-Alice-PiP screenshots.
- `teardown.txt`: stop commands, exit codes, and final `modal app list` readback.

Evidence distinguishes build success, runtime success, capture success, RTMP
transport, and platform playback. No earlier stage can be reported as proof of
a later stage.

## Cost-Control Contract

- Modal `min_containers` remains zero.
- The named test window expires within four hours.
- Runtime plus capture is expected to cost approximately $0.40-$0.50 per active
  hour based on the last verified configuration; this is an estimate, not a
  billing guarantee.
- Idle pauses longer than 15 minutes require immediate stop.
- Teardown commands are:

```bash
~/.venvs/modal/bin/modal app stop alice-runtime --yes
~/.venvs/modal/bin/modal app stop alice-capture-service --yes
~/.venvs/modal/bin/modal app list
```

- The final app list must show no active Alice runtime or capture task.
- RunPod, AWS, and any additional paid service remain off unless a documented
  Modal blocker is reviewed and the user approves the alternative.

## Rollback

The rollback target is the proven Alice release at `e855a9bb1` with Eliza pin
`17930c97b9` and its matching deployment configuration. Rollback is required if
the promoted build loses Milady #9, chat, the action catalog, Go Live, shared
operator/live action state, authenticated capture, or stable API behavior.

Rollback redeploys the known artifact rather than reconstructing it from a
moving branch. After rollback, run health, companion render, action catalog,
and capture start/stop checks and attach them to the failed release record.

## Explicit Non-Goals

- Folding the current Eliza `develop` branch into this release.
- Building bespoke integrations for multiple games.
- Adding new livestream destinations beyond existing configured support.
- Redesigning the companion, action drawer, or Go Live flow beyond fixes needed
  for usability, accessibility, responsiveness, and restored behavior.
- Recreating AWS infrastructure or moving compute back to RunPod.
- Disabling authentication to simplify staging.
- Claiming platform-live success from local rendering, build output, capture
  process state, or RTMP transport alone.

## Follow-Up Project: Current Eliza Fold

After this release is stable, a separate design and implementation plan will:

1. Pin the current Eliza upstream SHA at execution start.
2. Rebase or replay the first-party companion package onto that exact tree.
3. Rehome the remaining Alice patches by ownership rather than blindly
   reapplying the old patch chain.
4. Run the complete Gates A-E acceptance matrix against the new runtime.
5. Canary the new runtime before it can replace the recovered production
   release.

The follow-up cannot weaken any protected surface or evidence requirement in
this specification.
