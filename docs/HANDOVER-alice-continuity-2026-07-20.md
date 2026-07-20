# Alice Continuity Synthesis (2026-07-20)

Read this first. It reconciles the three concurrent Alice work streams into one
continuity picture: what is done, where it lives, what is verified, what was
ephemeral and must be regenerated, and the exact next actions per lane.

## 1. Branch topology (all verified on disk 2026-07-20)

All three branches root at the same base: `deploy/alice-companion-render` @
`e855a9bb1` (the live Alice deploy tip). Eliza runtime pin for the deploy line:
`17930c97b97cedb8fe64124e327c023cd526cc8b`.

| Lane | Branch | Worktree | Tip | Pushed |
|---|---|---|---|---|
| Upstream program (milady fold) | `integration/alice-upstream-2026-07-07` | `.worktrees/milaidy-integration-alice-upstream-2026-07-07` | `3191bb1a7` | yes, PR #207 OPEN |
| Upstream program (eliza fold, WP6) | `integration/alice-eliza-fold-2026-07-09` | `.worktrees/milaidy-eliza-fold-2026-07-09` | `d747565d1` | yes |
| Release candidate (livestream recovery) | `release/alice-livestream-recovery-2026-07-18` | `.worktrees/milaidy-alice-livestream-recovery-2026-07-18` | see git log | pushed 2026-07-20 with this doc |

Key relationship: the recovery branch deliberately REPLAYED the reviewed content
of the two program branches (plan Tasks 2 and 3) instead of merging them. Its
release ledger (`docs/alice/release/alice-livestream-recovery-2026-07-18.json`)
records `miladyPullRequest: 207`, `companionVendorCommit: d747565d1`, and
`elizaUpstreamFoldIncluded: false`. Duplicate carriers of WP0-WP2 and the
companion vendoring exist BY DESIGN; the founder picks the merge order at
promotion time (recommended: land the recovery release first, then rebase or
close #207 against what shipped).

## 2. Recovery campaign state (plan: `docs/superpowers/plans/2026-07-18-alice-application-livestream-recovery.md`)

- Tasks 0 through 6: complete (Task 0 Step 5, the deterministic-build-input
  commit, was folded into the later script commits `c94681c62`..`4172e995a`).
- Task 7 (local build, runtime, visual gates): substantially complete in
  session; its discovered fixes are the commits landing WITH this document:
  1. Public companion route: `packages/app-core/src/App.tsx` exempts
     `/companion` from the StartupCoordinator gate so a fresh browser renders
     the stage instead of onboarding (mirrors upstream `@elizaos/ui` behavior,
     with tests).
  2. Mobile go-live header: `CompanionHeader.tsx` responsive fix so the
     language control no longer overlaps and intercepts the Go Live button at
     390px width (with tests).
  3. LifeOps route registration: registry entry now points at
     `@elizaos/app-lifeops/routes/plugin` (server-safe module, 188 routes,
     no CSS import in Node), plus `copy-eliza-app-core-registry-assets.mjs`
     so the packaged server finds `dist/entries/apps/*.json`.
  4. Release packaging completion: `build-milaidy-runtime-plugin-workspaces.mjs`
     builds the full required server set in dependency order (browser, Discord,
     cloud, coordinator before companion/orchestrator, LifeOps, app-control,
     Google, Edge TTS, video), `alice-eliza-agent-tsdown.config.mjs` emits the
     focused `@elizaos/agent/lifeops-runtime` facade bundle, and the patch chain
     gained the operator-action restoration contract (POST route, persistence,
     transcript replay, broadcast, startup-activity isolation) plus resolver
     self-heals for previously mutated assemblies.

### Verified in session (2026-07-19/20 runs, recorded in the campaign log)

- Patch harness: 52/52 assertions green under pinned Node 22.22.
- Builder suites green (up to 20/20 including build-order and fail-closed
  stale-artifact tests).
- Packaged runtime from immutable assembly of `4172e995a`: 12/12 resolver
  plugins, health ready with 21 loaded / 0 failed, 323 actions, all 41 emotes,
  Google/LifeOps routes reach handlers, operator-action HTTP contract green
  end to end (create 200, action 200, transcript replay, invalid kind 400).
- Visual probes green on BOTH the source Vite build and the packaged bundle:
  desktop companion with moving Milady #9 VRM, full action drawer (Live
  Controls + 7 pinned avatar actions + 41 emotes), Wave action, desktop and
  mobile Go Live modal within 390x844 with contained scroll.
- The final packaged visual re-capture after the operator-action server fix was
  blocked by a macOS browser-sandbox denial; the UI bundle hash
  (`main-VOtx1dN6.js`) was unchanged from the accepted captures, so the server
  fix does not invalidate them.

### Ephemeral state that did NOT survive (regenerate, do not trust)

- The disposable hydrated assemblies under `/private/tmp` are gone (pruned).
  This is by design: hydration is reproducible from any commit via the plan's
  Task 0/1 scripts and the release ledger.
- `evidence/alice-livestream/2026-07-18/local/screenshots/` was empty at the
  time this document was first written. RESOLVED 2026-07-20 later the same
  day: a fresh assembly was hydrated from the tip (all steps exit 0 through
  the production build), the packaged runtime passed every API gate (ready,
  Alice, 41 emotes, no 401/429 storms in 60s, zero console errors), and the
  full viewport matrix is captured and tracked with an accepted
  `manifest.json`. The rerun also exposed and fixed one real landscape
  defect: at 844x390 the masked floating chat layer (dock z-index 24)
  covered the z-10 header and swallowed the Go Live tap; the header now
  stacks at z-30 with a contract test locking the relationship.
- The recovery worktree has no `node_modules`; test suites run inside
  hydrated assemblies, not in this worktree. Known harness gap: vitest 4
  no longer runs explicit test files outside a config's `include` list, so
  the package-level contract tests under `packages/app-core/src` need an
  include-bearing config (the plan's enumerated Task 7 suites are
  unaffected).

## 3. Remaining recovery tasks (8 through 15)

- Task 8: consolidate 555stream capture/simulcast fixes. The plan's sidecar
  worktree `.worktrees/stream-alice-modal-livestream-2026-07-18` does NOT
  exist yet. The 555stream main checkout sits on
  `fix/alice-eliza-submodule-archive` with ~14 dirty files; the ledger pins the
  media commits (`0d00fc75`, `04bffeb6`, `acfb6e4a`, `4e4b6cd1`).
- Task 9: the Modal launcher is STALE: it still builds the June encrypted R2
  backend-only artifact and skips the Vite SPA. Deploying it as-is would
  regress the restored companion. It must consume the exact built release
  candidate before any staging window.
- Tasks 10 through 14: bounded staging window (owner, expiry within 4 hours,
  teardown, evidence paths declared BEFORE start), camera-to-Twitch emote
  proof, promotion of the exact accepted Modal revision, teardown + redacted
  evidence index. RunPod and AWS stay off.
- Task 15: scope the eliza fold follow-up (see below).

## 4. Upstream program lanes (unchanged by recovery, still live)

- PR #207 (WP0-WP2 milady ports) awaits founder review. Review before merge.
- WP6 eliza fold to `d7d3ed31a3d` continues on
  `integration/alice-eliza-fold-2026-07-09` per
  `docs/superpowers/plans/2026-07-09-alice-eliza-fold-wp6.md`:
  V1 vendoring committed; V1 remainder = drop the 7 companion patches from the
  chain + registry update + old-pin precedence gate; then V2 canonical install
  on the July tree; V3 strict-mode re-home; V4 runtime integration; V5 gates
  and a dedicated PR.
- NEW OBLIGATION for WP6 created by the recovery campaign: the patch chain on
  the recovery branch grew by roughly 900 lines of new anchored contracts
  (operator-action restoration, LifeOps registry rewrite, agent
  lifeops-runtime facade, ElizaCloud lifeops-cloud subpath, resolver
  self-heals, Discord/browser server dist conditions). WP6 V3's strict-mode
  worklist must run against the RECOVERY branch's chain, not the older
  integration copy, once recovery lands. Reconcile the two chain copies before
  the fold's V3 begins.

## 5. Ground rules that produced this state (unchanged)

Eliza stays pinned at `17930c97b9` on the release lane. No wholesale merge of
PR #207 or the fold branch into the release lane. Preserve Milady #9, the
action drawer/pills, the 41-emote catalog, Go Live Setup/Channels/Mode/Review,
camera and screen-share-with-PiP, and the modal scroll contract. Secrets are
never printed or committed. Staging is on-demand and bounded; 555stream and
555-bot keep their host-side production rails.
