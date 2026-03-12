# 555 Stream Plugin Independent SOW (P0 Release + Alice Migration)

## Mission
Ship a canonical, open-source stream plugin that lets developers and AI agents go live in **3 steps**:
1. **Authenticate**
2. **Configure**
3. **Go live**

Then migrate Alice off makeshift stream wiring to this canonical plugin path **without losing functionality**.

---

## Audit Summary (Current State)

### What is strong already
- `stream-plugin` has broad control-plane coverage (session, stream, studio, sources, guests, platforms, radio, app streaming).
- `stream-plugin` already contains additional action files for ads/chat/templates/alerts/transitions (partially wired).
- `milaidy` has mature Alice orchestration plugins (`five55-games`, `stream555-ads`, `stream555-auth`) and production safety controls.

### Gaps against expert plugin standards
- Canonical 3-step onboarding is not front-and-center in plugin docs and examples.
- Skill docs for agent operators are not packaged in the plugin repo.
- Extra action modules in `stream-plugin` are not fully exported through `src/actions/index.ts`.
- Alice still relies on internal stream control plugin wiring as primary path in runtime bootstrap.
- There is no explicit compatibility bridge documented for migration period.

---

## Target End State
- `stream-plugin` is the canonical stream control package for developers + agents.
- README + examples make 3-step onboarding executable in <10 minutes.
- Skills are bundled in repo for operator/agent workflows (including OpenClaw skill path).
- Alice loads canonical plugin as primary stream surface.
- Legacy/internal Milaidy stream control stays only as compatibility layer for non-overlapping features during migration.
- No regression in:
  - app go-live
  - ad workflows
  - guest invites
  - scene/layout controls
  - game go-live orchestration

---

## Scope

### In scope (this wave)
1. Plugin repo hardening for 3-step onboarding + expert structure.
2. Export and wire currently available advanced action modules.
3. Add skills in plugin repo (`stream` operator + OpenClaw integration profile).
4. Milaidy runtime migration to canonical stream plugin as primary for Alice.
5. Compatibility mode so legacy-only actions remain available while overlap collisions are suppressed.

### Out of scope (next wave)
- Full deprecation/removal of legacy Milaidy stream control internals.
- Marketplace publication automation across all registries/channels.
- Cross-repo policy unification for every non-stream plugin.

---

## Implementation Plan

### Phase 1 — Canonical plugin structure (P0)
- Make `stream-plugin` README/quickstart explicitly 3-step.
- Add operator-ready examples:
  - minimal character config,
  - auth env template,
  - go-live invocation sequence.
- Add skill docs under plugin repo for:
  - `stream-operator` workflows,
  - `openclaw` workflows.

### Phase 2 — Action surface completeness (P0)
- Wire advanced action files into `src/actions/index.ts` exports and registry.
- Ensure no hidden action modules remain unregistered.
- Keep naming consistent (`STREAM555_*`) and approval requirements explicit.

### Phase 3 — Alice migration (P0)
- Load canonical stream plugin in Milaidy runtime as primary stream surface for Alice.
- Keep internal stream control plugin as compatibility-only fallback path for non-overlapping capabilities.
- Suppress duplicate action-name collisions when both are present.

### Phase 4 — No-loss verification (P0/P1)
- Validate bootstrap, go-live app, ad trigger, guest invite, scene switch, stream stop.
- Validate Alice game go-live path still functions with canonical stream primary.
- Capture pass/fail matrix and rollback toggle.

---

## Functional No-Loss Matrix

| Capability | Canonical Plugin | Legacy Compat | Required for Cutover |
|---|---:|---:|---:|
| Healthcheck + session bootstrap | ✅ | ✅ | ✅ |
| Stream start/stop/status | ✅ | ✅ | ✅ |
| App go-live | ✅ | ✅ | ✅ |
| Ads trigger/list/schedule | ✅ (advanced actions) | ✅ | ✅ |
| Guests + scene/layout | ✅ | ✅ | ✅ |
| Segment controls + earnings estimate | Partial | ✅ | ✅ (via compat during migration) |
| Five55 game orchestration | via Milaidy plugins | via Milaidy plugins | ✅ |

---

## Release & Rollout
1. Merge plugin repo hardening + action wiring.
2. Merge Milaidy runtime primary-plugin migration behind env toggle.
3. Deploy Alice canary with canonical plugin enabled.
4. Run smoke pack:
   - authenticate → configure → go live,
   - ad trigger,
   - game switch,
   - stream stop.
5. Expand to additional agents once canary passes.

---

## Controls / Flags
- `STREAM555_CANONICAL_PLUGIN_ENABLED` (new): enables canonical stream plugin in Milaidy runtime.
- `STREAM555_LEGACY_COMPAT_PLUGIN_ENABLED` (new): keeps legacy stream control plugin loaded for compatibility-only actions.

Default policy for Alice:
- canonical = enabled
- legacy compat = enabled (temporary)

---

## Acceptance Criteria
- Plugin repo supports 3-step onboarding from README + examples without external tribal knowledge.
- Skills for stream operator + OpenClaw exist in plugin repo and are usable.
- Alice runs canonical stream plugin as primary path.
- No production regression in critical live operations.
- Legacy overlap conflicts eliminated during dual-run period.

