# WP0 Baseline Record — 2026-07-09

The true, measured state of Alice's tip (`deploy/alice-companion-render` @ `e855a9bb1`) on a fresh, isolated environment. Every later work-package verifies against THIS record. Environment: integration worktree `.worktrees/milaidy-integration-alice-upstream-2026-07-07`, isolated eliza worktree at `eliza/` (detached @ `17930c97b9`, gitdir shared with `milaidy/.git/modules/eliza`), macOS arm64, node v24.9.0.

## 1. The install recipe (canonical, proven)

Vanilla `bun install` DOES NOT WORK on Alice's tip and never did locally. The proven path is the Modal build recipe (`scripts/awsless/modal/alice_runtime.py`, `_BUILD`), reproduced locally as:

```bash
# one-time: isolated eliza worktree + the ignored plugin (see §2)
git -C milaidy/eliza worktree add --detach <worktree>/eliza 17930c97b9
# provision eliza/plugins/plugin-browser-bridge (§2.2)

export PUPPETEER_SKIP_DOWNLOAD=1 CYPRESS_INSTALL_BINARY=0 \
       NODE_LLAMA_CPP_SKIP_DOWNLOAD=true PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
node 555-bot/scripts/resolve-milaidy-missing-workspaces.mjs <worktree>
node 555-bot/scripts/pin-alice-release-runtime-deps.mjs <worktree>
bun@1.3.10 install --no-progress --ignore-scripts --linker=hoisted --network-concurrency=8
node 555-bot/scripts/build-milaidy-runtime-plugin-workspaces.mjs <worktree>
# then the milaidy postinstall chain explicitly (Modal skips it because its
# tarball eliza is pre-patched; a clean eliza checkout must run it):
node scripts/run-repo-setup.mjs && node scripts/ensure-eliza-generated-types.mjs && node scripts/patch-eliza-bun-compat.mjs
```

Result: 2996 packages (root) + nested eliza install (~5.1G) + eliza package builds + the 505-anchor Alice patch chain applied (43 mutated files in the eliza worktree, sentinels present).

## 2. Discoveries (defects/facts surfaced by WP0)

1. **`bun.lock` is unparseable by bun 1.3.14** (duplicate keys -> "Ignoring lockfile"). Pre-existing on the deploy tip. Modal's bun 1.3.10 + the pin script make installs deterministic enough; fresh resolution WITHOUT the pin/resolve scripts fails outright (phantom `@elizaos/plugin-localdb` workspace dep; `@elizaos/plugin-shell` DependencyLoop). Durable lockfile regeneration = future task, own commit, verified against this baseline.
2. **`eliza/plugins/plugin-browser-bridge` is git-ignored on-disk content** (a bare `dist/`, no package.json, tracked at NO eliza ref — the plugin was renamed `plugin-browser` upstream). Root workspaces reference it, so any fresh checkout must provision it: copy `dist/` from the main checkout + a minimal manifest (name `@elizaos/plugin-browser-bridge`, version `2.0.0-beta.0`, exports for `.`/`./schema`/`./contracts` -> dist). `resolve-milaidy-missing-workspaces.mjs` handles the rest of the phantom-workspace class.
3. **A deploy-only Alice patch lives in the Modal script, not the patch chain**: `ALICE_SOURCE_PATCH` in `alice_runtime.py` patches `eliza/packages/agent/src/api/misc-routes.ts` (emote catalog import + logger). Drift risk: it is invisible to the drift gates. WP6 should absorb it into `apply-alice-eliza-runtime-patches.mjs`.
4. **`@discordjs/opus` native build fails on macOS arm64** during the nested eliza install (node-pre-gyp); the setup script's automatic retry recovers. Cosmetic locally.

## 3. Gate results (the baseline bar)

| Gate | Command | Result |
|---|---|---|
| **Patch-chain drift (Alice integrity)** | `bunx vitest run scripts/apply-alice-eliza-runtime-patches.test.ts` | **GREEN 38/38** |
| **Shipping build (Modal parity)** | `NODE_OPTIONS=--max-old-space-size=8192 ./node_modules/.bin/tsdown --config-loader native --fail-on-warn false` + `test -f dist/entry.js` | RECORDED BELOW (§4) |
| Startup-drift contract | `bunx vitest run scripts/startup-e2e-script-drift.test.ts` | 3/6 green; **3 pre-existing red**: asserts `vitest.e2e.config.ts` + `vitest.startup-e2e.config.ts` which were deleted on Alice's line (commits `592693153` "thinning out" era). Not resurrected in WP0. |
| Typecheck (`bun run verify` leg 1) | `tsc --noEmit` | **466 pre-existing errors** (435 `packages/app-core`, 30 `packages/agent`, 1 `packages/plugin-selfcontrol`) — fork state-layer drift vs its own api/client. Full log: `/tmp/claude-501/wp0-verify2.log` (session) — regenerate with the command. Never green on the tip; the deploy path never typechecks. |
| Lint (`verify` leg 2) | short-circuited by leg 1 | not yet measured on the tip |

**No-regression bar adopted for every WP:** (a) patch-chain drift gate stays 38/38; (b) tsdown build + `dist/entry.js` stays green; (c) tsc error count NEVER increases (baseline: 466) and every new/ported file is clean; (d) the 3 startup-drift reds may not grow; (e) surface smoke per `docs/alice-surface-inventory-2026-07-07.md` on deploy-bound changes.

## 4. Shipping-gate result

**GREEN.** `TSDOWN_EXIT: 0`, `dist/entry.js` PRESENT. 66 files, 5085.41 kB total, build complete in 364ms (2026-07-09). The exact Modal-parity backend build succeeds on this fresh environment. **BASELINE IS GREEN on the adopted bar** (§3): patch-chain drift 38/38 + shipping build green, with the 466 tsc errors and 3 startup-drift reds recorded as pre-existing debt with a never-increase rule.

## 5. Baseline repairs made (tracked, this branch)

1. `vitest.config.ts` — root config's bridge-stub aliases only covered `@elizaos/app-core/bridge*`; Alice's `apps/app/test/setup.ts:142` mocks `@miladyai/app-core/bridge/electrobun-rpc.js`. Added the `@miladyai` mirrors (same stub target). Unblocked both drift-gate files from loading.
2. `tsconfig.json` — added `"ignoreDeprecations": "6.0"` (caret `^6.0.3` now resolves a TS 6.x where TS5101 `baseUrl` deprecation escalates to an error and masks all real diagnostics).

## 6. Environment mutations NOT committed (documented working-tree state)

- The pin/resolve scripts mutate manifests at install time (root `package.json`, several package `package.json`s, `bun.lock`): kept as working-tree state, same as the Modal build's ephemeral mutations. Snapshot: `/tmp/claude-501/wp0-pre-scripts-status.txt` vs `git status`.
- The eliza worktree carries the patch chain's 43 mutated files (by design; regenerable via the chain).
- `eliza/plugins/plugin-browser-bridge/` provisioned manifest (see §2.2) — inside the gitignored eliza worktree.

## 7. WP6 pre-flight finding (2026-07-09): companion ABSENT at the chosen eliza target

Verified against the WP6 eliza worktree (`.worktrees/milaidy-eliza-fold-2026-07-09/eliza` @ `d7d3ed31a3d`, elizaOS develop 2026-07-08):

- `plugins/app-companion`: GONE (whole app-* tree removed; `plugins.json` = empty; `upstreams/` = electrobun only — NOT externalized to another repo).
- `packages/ui/src/companion`: GONE.
- `CompanionShell` and `GlobalEmoteOverlay`: ZERO hits in the entire tracked tree.
- By contrast: v2.0.3 (fa240156ed9, May 20) has 15 companion files; the June-1 develop snapshot (5f70793a3c) has 10 + both symbols. The July develop lineage (force-pushed) simply does not carry the companion surface.

Implication: "fold to latest develop" cannot adopt an upstream companion — there is none. Alice's companion+emote system must be VENDORED as Alice-owned fork code (seeded from a companion-bearing ref + Alice's patches) if the latest-develop target stands. Founder decision required; recorded in the session log.

### §7 resolution (founder, 2026-07-09): KEEP THE COMPANION — vendor it

Founder decision: "we need to keep the companion." WP6 direction confirmed:
the companion+emote surface becomes PERMANENT first-party Alice code (vendored
into the fork, seeded from Alice's currently-running patched source at the pin),
and the eliza fold proceeds against latest develop (d7d3ed31a3d). Vendoring
removes the companion from the patch-chain re-anchoring problem entirely: those
patches become source. The vendored package must keep serving /companion
(VRM canvas + GlobalEmoteOverlay), /api/emote + stream555 relay, stage/operator
routes on top of the new runtime.
