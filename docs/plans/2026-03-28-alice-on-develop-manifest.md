# Alice-on-Develop Preservation Manifest

Date: 2026-03-28
Base branch: `develop`
Integration branch: `integrate/alice-on-develop`
Legacy source branch: `alice`
Shared merge-base: `d6878b1ae315c6bbb88667d87a463410800df3d4`

## Objective

Preserve current `develop` as the canonical app shell, onboarding flow, cloud
contracts, and 3D environment. Selectively forward-port Alice-only value from
`alice`:

- Alice character identity and VRM routing
- streaming / go-live runtime
- arcade runtime and operator actions

Do **not** replay legacy Alice HUD, pro-streamer stage chrome, or broad Alice
ops / CI / monitoring payload.

## Develop-Canonical Surfaces

These files and subsystems stay authoritative unless a manifest item says
otherwise:

- `apps/app/src/main.tsx`
  - boot config, VRM roster derivation, character catalog injection
- `apps/app/src/character-catalog.ts`
  - current character catalog source
- `packages/shared/src/onboarding-presets.ts`
  - current preset names, avatar indices, voice preset mapping
- `packages/app-core/src/config/boot-config.ts`
  - typed roster and character catalog contract
- `packages/app-core/src/state/vrm.ts`
  - bundled VRM URL / preview / background resolution
- `packages/app-core/src/state/AppContext.tsx`
  - avatar selection, onboarding persistence, game state, launch wiring
- `packages/app-core/src/components/CompanionSceneHost.tsx`
- `packages/app-core/src/components/ChatAvatar.tsx`
- `packages/app-core/src/components/OnboardingWizard.tsx`
  - current environment and avatar surfaces
- `packages/app-core/src/components/StreamView.tsx`
- `packages/app-core/src/components/stream/StatusBar.tsx`
  - current user-facing stream surface
- `packages/agent/src/runtime/core-plugins.ts`
- `packages/agent/src/runtime/eliza.ts`
- `packages/agent/src/api/stream-routes.ts`
- `packages/agent/src/services/app-manager.ts`
  - current runtime, stream, and app launch contracts

## Legacy Alice Source Clusters

The Alice branch value is concentrated in older paths that need forward-porting
into the current package layout:

- `apps/app/src/AppContext.tsx`
  - Alice avatar identity routing, go-live orchestration, game launch flow
- `apps/app/src/stream555Readiness.ts`
  - go-live readiness logic
- `apps/app/avatar-preview.html`
- `apps/app/src/avatar-preview.tsx`
- `apps/app/public/vrms/alice.vrm`
- `apps/app/public/vrms/previews/alice.png`
  - Alice preview and stage asset handling
- `src/onboarding-presets.ts`
  - legacy preset and character identity definitions
- `src/plugins/stream555-control/index.ts`
- `src/plugins/stream555-auth/index.ts`
- `src/plugins/five55-games/index.ts`
- `src/plugins/five55-shared/*`
  - streaming, auth, arcade, and shared runtime behavior

## Must-Port

### Alice identity / VRM

- `6db4ee79` `fix(avatars): require alice.vrm before skipping sync`
- `be673c9e` `fix(app): route Alice VRM identity through agent-show`
- `61b00947` `fix: send VRM avatarIdentity on all avatar launch paths`
- `ede4ac9b` `fix(app): generate real alice preview thumbnail`

Current target surfaces:

- `apps/app/src/main.tsx`
- `apps/app/src/character-catalog.ts`
- `packages/shared/src/onboarding-presets.ts`
- `packages/app-core/src/state/vrm.ts`
- `packages/app-core/src/state/AppContext.tsx`
- `packages/app-core/src/components/ChatAvatar.tsx`
- `packages/app-core/src/components/CompanionSceneHost.tsx`

Required outcome:

- Alice becomes a real roster identity on current `develop`, not just a voice
  preset attached to another character.
- Alice VRM and preview assets are first-class and routable through current
  boot config and avatar launch paths.
- Current environment and shell remain unchanged.

### Streaming / go-live runtime

- `f1b6ab78` `Harden Alice guided go-live truth gates`
- `43bd5548` `Stabilize Alice go-live readiness contracts`
- `ea04fac4` `Make go-live modal wait for stream plugin state`
- `642610ec` `fix(stream): enforce stream start readiness for camera live`
- `6eac12e8` `feat(stream555): add stream status action to canonical control plugin`
- `72644126` `feat(stream555-auth): add wallet challenge/verify auth flow`
- `566e5291` `stream555: add auth plugin and enforce stream control policy gates`
- `0eabea42` `stream555: add agent api-key token exchange auth flow`
- `5ac2fe92` `feat(stream555): add GO_LIVE_APP action`
- `a22f6d3c` `fix(runtime): refresh exchanged agent tokens on go-live bootstrap`
- `4321f8d9` `fix(app): refresh stream555 state when go-live opens`
- `808aa844` `fix(app): honor structured go-live step results`

Current target surfaces:

- `packages/agent/src/runtime/core-plugins.ts`
- `packages/agent/src/runtime/eliza.ts`
- `packages/agent/src/api/stream-routes.ts`
- `packages/agent/src/actions/stream-control.ts`
- `packages/agent/src/plugins/*` for any restored stream555 runtime modules
- `packages/app-core/src/state/AppContext.tsx`
- `packages/app-core/src/components/StreamView.tsx`

Required outcome:

- stream capability exists as a current-runtime feature, not a legacy shell
  transplant
- go-live readiness is truthful and stateful
- stream auth and bootstrap paths align with current develop cloud/auth
  semantics

### Arcade runtime

- `ea94537b` `milaidy: unify 555 arcade canonical plugin surfaces`
- `58a7cdfd` `milaidy: consume action-first arcade plugin update`
- `f0b6e103` `milaidy: make 555 arcade operator panel action-first`
- `999ebcaf` `five55-games: add live capability sprint orchestration`
- `a32eeb9d` `Use combined action for Alice Play Games live`

Current target surfaces:

- `packages/agent/src/services/app-manager.ts`
- `packages/agent/src/runtime/eliza.ts`
- `packages/agent/src/plugins/*` for restored five55 runtime modules
- `packages/app-core/src/state/AppContext.tsx`
- `packages/app-core/src/components/AppsView.tsx`
- `packages/app-core/src/components/PluginsView.tsx`

Required outcome:

- arcade launches remain action-first
- current develop apps/game shell stays canonical
- only the runtime and minimal visible controls are restored

## Maybe-Port

- `b5a58d87` `fix(runtime): route 555stream base URL by agent role`
  - port only if current develop still requires agent-role-aware stream base URL
- `ae688bf6` `fix: restore alice-specific files deleted by rasp merge`
  - do not replay wholesale; mine only missing Alice-specific assets or helpers
- `3955b828` `Restore pro streamer stage scene wiring`
- `14aa1c74` `Restore pro streamer stage rendering`
- `39619231` `Fix pro streamer stage bootstrap race`
- `fa7fd5ac` `fix(app): ship alice raw stage animation pipeline`
- `9e5499c4` `Restore pro streamer avatar idle runtime`
  - mine only if needed to make Alice look correct inside current develop's
    environment

## Do-Not-Port

These remain out of scope unless explicitly requested later:

- old pro-streamer HUD / Milady OS HUD revamp
- old stage shell / action-log shell chrome
- broad Alice docs and ops payload
- CI / release / workflow backports from `alice`
- monitoring, autonomy, metrics, and supervisor work not required for arcade or
  go-live
- stream extras intentionally removed from current `develop`

## Mapping Notes

### Identity

- Legacy Alice assumed `alice.vrm` was the canonical first avatar.
- Current develop derives roster from `packages/shared/src/onboarding-presets.ts`
  and names avatar 1 `Chen`.
- Identity replay must therefore change the catalog / roster source, not only
  `selectedVrmIndex`.

### Streaming

- Current develop still has a minimal stream surface and local stream actions,
  but no `stream555-control` or `stream555-auth` modules.
- Restoring Alice stream behavior will require new runtime modules under the
  current `packages/agent` layout rather than replaying old root `src/plugins/*`
  files verbatim.

### Arcade

- Current develop still has game/app shell state and overlay handling in
  `packages/app-core`.
- Alice branch adds richer five55 orchestration that must be adapted into the
  current app-manager and runtime contracts instead of reviving legacy UI.

## Execution Order

1. Manifest and no-behavior-change prep
2. Alice identity and VRM assets
3. streaming / go-live runtime
4. arcade runtime and action plumbing
5. current-shell UI exposure and reconciliation

## Validation Gates

- Alice renders in the current develop 3D environment
- onboarding, cloud auth, and shell behavior remain unchanged
- go-live readiness and start flow are truthful
- arcade actions execute through the current runtime
- no legacy Alice HUD or pro-streamer shell is reintroduced
