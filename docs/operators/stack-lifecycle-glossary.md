# Stack Lifecycle Glossary

## Purpose

Normalize the operator vocabulary across Milady, stream, and arcade so runtime
state can be reasoned about without translating product-specific terms.

## Canonical stack vocabulary

| Canonical term | Meaning | Milady mapping | Stream mapping | Arcade mapping |
| --- | --- | --- | --- | --- |
| Installed | package or runtime is present but not necessarily usable | CLI/app installed, config directory exists | plugin package present | plugin package present |
| Enabled | host intends to load the surface | plugin configured in character/runtime | plugin enabled in host | plugin enabled in host |
| Loaded | runtime/service started successfully | `startEliza()` completed bootstrap and plugin resolution | `loaded` in `STATES_AND_TRANSITIONS.md` | session/runtime ready after plugin load |
| Authenticated | external credentials are accepted | provider and connector credentials validate | `authenticated` after auth verify/token exchange | `ARCADE555_AUTH_VERIFY` succeeds |
| Session Bound | operator is attached to an active working session | active runtime/workspace context | `sessionBound` after `STREAM555_BOOTSTRAP_SESSION` | `ARCADE555_SESSION_BOOTSTRAP` succeeds |
| Ready | safe to execute normal actions | runtime initialized and action-capable | `ready` after auth + session bind | health, auth, and session bootstrap complete |
| Live | an externally visible operation is actively running | interactive runtime is answering/acting | active stream is broadcasting | active play/live gameplay flow is running |
| Degraded | partially functioning but not operator-safe without intervention | provider/plugin/runtime issue | explicit `degraded` stream state | session/play state is inconsistent or partially failed |
| Recovering | operator is executing a repair path | restart/reload/reconfigure path | fallback/reconnect/stop-start cycle | stop/rebind/re-enter gameplay/session path |
| Stopped | deliberately offline or disposed | process exited or runtime disposed | stream stopped | game/session stopped |

## Product-specific notes

### Milady

- The runtime lifecycle is defined in `docs/agents/runtime-and-lifecycle.md`.
- `Starting`, `Running`, `Restarting`, and `Stopped` are the lower-level runtime
  states.
- For operator docs, prefer the shared terms above when speaking across repos.

### Stream

- The canonical stream state reference is
  `stream-plugin/docs/STATES_AND_TRANSITIONS.md`.
- `ready` must mean action-capable, not merely installed.
- Channel readiness is separate from session readiness.

### Arcade

- Public operator docs should treat health/auth/session bootstrap as the path to
  `Ready`.
- Gameplay states like `MENU`, `PLAYING`, `PAUSED`, `GAME_OVER`, and `WIN`
  describe in-game progress, not installation or auth lifecycle.

## Translation rules

- Do not use `configured` as a synonym for `loaded`.
- Do not use `authenticated` as a synonym for `ready`.
- Do not use a game state like `PLAYING` to imply the overall arcade surface is
  healthy.
- When a doc mixes host lifecycle with product lifecycle, split them into
  separate state descriptions.
