# Five55 Alice Parity Matrix (555-bot/alice -> milaidy/alice)

This document tracks capability parity for legacy `555-bot` Alice surfaces after migration into `milaidy` Alice.

## Action Parity

| Legacy (`555-bot` plugin-arcade) | `milaidy` action/plugin | Status | Notes |
| --- | --- | --- | --- |
| `UPDATE_THEME` | `FIVE55_THEME_SET` (`five55-admin`) | Captured | Uses `/admin/theme` with modern + legacy auth env fallback. |
| `TRIGGER_EVENT` | `FIVE55_EVENT_TRIGGER` (`five55-admin`) | Captured | Uses `/admin/event` with typed duration handling. |
| `CHALLENGE_USER` | `FIVE55_BATTLES_CREATE` (`five55-battles`) | Captured | Supports open/targeted challenge creation and wager metadata. |
| `POSSESS_CABINET` | `FIVE55_CABINET_POSSESS` (`five55-admin`) | Captured | Uses `/admin/cabinet/possess`. |
| `RELEASE_CABINET` | `FIVE55_CABINET_RELEASE` (`five55-admin`) | Captured | Uses `/admin/cabinet/release`. |
| `POSSESS_GAME` | `FIVE55_GAMES_PLAY` + Chat quick-layer orchestration | Captured | Routed through `five55-games` and UI quick actions. |
| `PLAY_GAME` (simulated score mode) | Not ported (intentional) | Superseded | Removed as primary path; production path is real gameplay/score capture. |
| `RUN_GAUNTLET` | Catalog + play action loop orchestration | Captured (composable) | Implemented via action pipeline patterns rather than monolithic legacy action. |
| `LOG_MEMORY` | Native Milaidy memory/runtime services | Captured (platform-native) | Uses Milaidy memory/trajectory systems, not arcade-local JSON memory. |

## Provider/Surface Parity

| Legacy provider/surface | `milaidy` equivalent | Status | Notes |
| --- | --- | --- | --- |
| Arcade state context | `five55-admin`, `five55-games`, `five55-battles`, `five55-leaderboard` providers | Captured | Split into dedicated capability plugins. |
| Leaderboard context | `five55-leaderboard` | Captured | Read/write actions preserved in dedicated plugin. |
| Cabinet context | `five55-admin` | Captured | Cabinet control elevated as dedicated admin surface. |
| Stream scheduler/control | `stream` plugin + autonomy run/preview flow | Captured | Supports `agent-v1` and legacy `v1` dialects with session continuity. |

## Capability Policy Parity

- Added `battles.create` capability and routing so challenge creation is explicitly authorized.
- Preserved existing `stream`, `games`, `quests`, `social`, `rewards`, and `swap` policy gates.

## Validation Coverage

- `src/runtime/five55-capability-routing.test.ts`
  - request routing for `battles.create` / `battles.resolve` / `battles.read`
  - action routing precedence (`challenge` battle intent vs quest intent)
  - policy grant for `battles.create`
- `apps/app/test/app/chat-quick-layers.test.ts`
  - quick-layer Go Live path
  - quick-layer Play Games autonomous spectate path

