# WP6: Eliza Fold to Latest Develop — Sub-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. V1 is detailed; V2-V5 carry scope + approach and get their bite-sized steps at execution (each needs the prior V's ground truth). Parent plan: `2026-07-07-alice-upstream-integration.md`. Baseline + findings: `docs/upstream-integration-evidence/WP0-baseline-record.md` (esp. §7).

**Goal:** Fold Alice's eliza from the pin (`17930c97b9`, alpha lineage) to elizaOS latest develop (`d7d3ed31a3d`, 2026-07-08, PINNED SHA — develop force-pushes), with the companion+emote surface VENDORED as permanent first-party Alice code (founder 2026-07-09: "we need to keep the companion"), zero Alice regression.

**Architecture:** elizaOS deleted the companion surface entirely at the target (baseline record §7). Alice vendors it: the patched pin tree's `plugins/app-companion` (283 tracked files; 98M on disk of which the bulk is provisioned-not-tracked emote animation assets) moves into the milaidy repo as a workspace package KEEPING THE NAME `@elizaos/app-companion` (the name is free post-fold; every existing import keeps working unchanged). Companion patches leave the patch chain and become source. The remaining fold re-homes non-companion anchors using strict mode (`MILAIDY_PATCH_STRICT=1`, shipped `5bbbfa4b2`) as the mechanical worklist generator.

**Branch/env:** `integration/alice-eliza-fold-2026-07-09` (worktree `.worktrees/milaidy-eliza-fold-2026-07-09`, off the integration tip so it carries strict mode + the ports; rebase after PR #207 merges). Its `eliza/` worktree is already at `d7d3ed31a3d`. No install yet — the canonical recipe (baseline record §1) must be re-run here, and WILL need adaptation (the July tree's layout differs: new packages incl. `elizaos`, `auth`, `cloud-ui`; `packages/app` exists; workspace membership changes).

## Global constraints (inherited + WP6-specific)

- All parent-plan constraints (pglite `^0.4.5`, protected divergences, identity/no-attribution, no em dashes).
- The vendored companion must keep serving, on the NEW runtime: `/companion` (VRM canvas + `GlobalEmoteOverlay`), `/api/emote` + stream555 broadcast relay, `/api/companion/stage`, operator routes, go-live.
- `MILAIDY_PATCH_STRICT=1` green is the WP6 exit gate for the patch chain (no silent skips; `KNOWN_INAPPLICABLE_AT_PIN` re-evaluated for the new pin — the `trusted-local-request` entry especially).
- Emote animation assets (`public/animations/emotes/*.glb.gz`, ~90M of the 98M): milaidy deliberately ignores `.glb` under `apps/app/public/animations` — decide tracked-vs-provisioned for the vendored package in V1 Step 2 and document; do NOT silently commit 90M of binaries without that decision.

## V1 — Vendor the companion (first, independent of the runtime fold)

**Seed = Alice's PATCHED pin tree** (`.worktrees/milaidy-integration-alice-upstream-2026-07-07/eliza/plugins/app-companion`, which includes the applied Alice patches) — this is byte-for-byte what runs live today.

- [ ] **Step 1:** Copy the seed to `packages/app-companion/` in the WP6 worktree, EXCLUDING `dist/`, `.storybook*/`, `node_modules`. Keep `package.json` name `@elizaos/app-companion`.
- [ ] **Step 2:** Asset decision: list `public/` payload sizes; propose tracked (git) vs provisioned (like plugin-browser-bridge / the VRM pipeline) to the founder if >20M would enter git history; implement the chosen mechanism and document it in the baseline record.
- [ ] **Step 3:** Workspace wiring: add `packages/app-companion` to root `package.json` workspaces; remove/adjust the `eliza/plugins/app-companion` entry; mirror tsconfig path + vite alias changes (guarded existsSync pattern, precedence: milaidy packages copy WINS over any future eliza copy).
- [ ] **Step 4:** Remove the 7 companion patches from `apply-alice-eliza-runtime-patches.mjs` (they are now source); update `PROTECTED_DIVERGENCES.md` 4.1 sentinel list accordingly (same commit); drift-gate test expectations updated.
- [ ] **Step 5:** Gates on the OLD pin env (integration worktree): full bar green with the vendored package resolving instead of the eliza copy (temporarily hide `eliza/plugins/app-companion` to prove precedence). This proves V1 causes zero regression BEFORE the runtime moves.

## V2 — Canonical install on the July tree

Re-run the baseline §1 recipe in the WP6 worktree against `d7d3ed31a3d`. Expected adaptations: workspace globs (new/removed eliza packages), `resolve-milaidy-missing-workspaces.mjs` behavior on the new layout, `plugin-browser-bridge` provisioning (upstream renamed it `plugin-browser` — re-evaluate the workspace entry entirely), possible bun-version sensitivities. Deliverable: install green + a WP6-env addendum to the baseline record.

## V3 — Strict-mode-driven re-home of the non-companion patches

Run `MILAIDY_PATCH_STRICT=1 node scripts/apply-alice-eliza-runtime-patches.mjs` against the July eliza. The failure list IS the worklist. Re-home each: source-main topology (the script is layout-aware but the 29-package floor + new `eliza-source` export maps need review), `SECRET_KEY_ALIASES` (moved to `constants/secrets.ts`), `cloud-api-key` (moved to plugin-elizacloud), onboarding/apps-routes deletions, the dual static-file-server. Mixed agent fleet: cheap models classify per-anchor, full-strength re-homes. Absorb `ALICE_SOURCE_PATCH` (Modal-only emote patch) into the chain here.

## V4 — Runtime integration + held features

Vendored companion mounts from Alice's own `apps/app/src/main.tsx` (already Alice-side). Check the July runtime's consumers (`packages/ui/src/components/shell/ShellOverlays.tsx` equivalent) and the boot-config surface: if `homeScreen`/`brandMark` slots exist at the July pin, wire gold-home + MiladyMark (held from WP2); de-stub VoicePill if `createVoiceCapture` shipped; `@elizaos/capacitor-bun-runtime` real plugin check (mobile boot goes functional). `upstreams.lock.json` bump to the new pin.

## V5 — Full gates + PR

Whole bar: strict patch run green, drift gates (updated), tsdown + `dist/entry.js`, tsc never-increase, surface smoke per the inventory doc, Modal build parity check. Dedicated PR (separate from #207 per founder directive), review before merge.
