# Beyond-Sprint Tracking Issues — Research Report

**All labeled:** `priority:beyond-sprint`, `type:tracking`
**Purpose:** Roadmap items tracked for future sprints

---

## #1814 — Plugin workspace Phase 3: Remove legacy override friction

### Summary
After W16 Phase 1+2, remove `WORKSPACE_PLUGIN_OVERRIDES` and any other fallback shims that were kept as safety nets. Clean up the plugin resolution path so it relies entirely on Bun workspace linking.

### Integration Analysis
- **Source doc:** `docs/plans/2026-04-05-plugin-workspace-architecture-review.md` Phase 3
- **Depends on:** W16 Runtime P0-1 (#1804) and P0-2 (#1805) must be stable for at least one sprint before removing fallbacks
- **Key files:** `packages/agent/src/runtime/plugin-resolver.ts`, `scripts/setup-upstreams.mjs`

### Risks
- **HIGH: Removing safety nets too early.** If Phase 1+2 have edge cases, removing overrides breaks those cases.
- **MEDIUM: Developer friction.** Developers on non-standard setups (CI, Docker, worktrees) may still need fallbacks.

### Work Estimate: M (3-4 pts)
### Verdict: KEEP — Valid next phase of plugin workspace evolution. Do NOT start until Phase 1+2 are proven stable.

---

## #1815 — Plugin workspace Phase 4: Version and provenance controls

### Summary
Committed manifest `upstreams.lock.json` recording vendored package versions, source hashes, and provenance data. Enables reproducible builds and drift detection.

### Integration Analysis
- **Source doc:** Same architecture review doc, Phase 4
- **Key files:** New `upstreams.lock.json` file, `scripts/check-upstream-drift.mjs`
- **Depends on:** Phase 3 (#1814) complete

### Risks
- **MEDIUM: Lock file maintenance.** Another file to keep in sync. Merge conflicts on lock files are common.
- **LOW: Well-scoped.** Builds on existing drift-detection script from #1806.

### Work Estimate: M (3-4 pts)
### Verdict: KEEP — Important for release reproducibility

---

## #1816 — Plugin workspace Phase 5 full: Pack-and-test release gating in CI

### Summary
Full CI integration of pack-and-test from #1806 scaffold. Every PR must pass tarball verification.

### Integration Analysis
- **Source doc:** Architecture review doc, Phase 5
- **Depends on:** Phase 5 scaffold (#1806) from W16
- **Key files:** CI configuration (.github/workflows/), scripts from #1806

### Risks
- **MEDIUM: CI time increase.** Pack-and-test adds build time to every PR.
- **LOW: Builds on scaffold.** Lower risk since the scripts already exist.

### Work Estimate: M (3-4 pts)
### Verdict: KEEP — Release quality gate

---

## #1817 — Plugin workspace Phase 6: Reduce patch-deps debt to zero

### Summary
Drive remaining `patch-deps.mjs` patches to zero for all locally-developed packages. After W16 cuts it roughly in half, finish the job.

### Integration Analysis
- **Source doc:** Architecture review doc, Phase 6
- **Depends on:** W16 #1810 (cut by half) + all upstream packages moved to local source
- **Key files:** `scripts/patch-deps.mjs`

### Risks
- **MEDIUM: Long tail.** Some patches may be truly necessary (upstream bugs). Zero may not be achievable.
- **LOW: Incremental.** Each patch removal is independently testable.

### Work Estimate: L (5-6 pts)
### Verdict: KEEP — Good tech debt target. Accept that "near-zero" may be more realistic than "zero."

---

## #1818 — Action callbacks: Persistence of intermediate progressive statuses (implementation)

### Summary
Full implementation of persisting progressive status lines so reloading a conversation preserves the trail.

### Integration Analysis
- **Source doc:** `docs/runtime/action-callback-streaming.md` Future/roadmap
- **Depends on:** W16 design spike (#1813) and merge metadata (#1809) landed
- **Key files:** DB schema, chat-routes.ts, conversation UI components

### Risks
- **MEDIUM: DB schema migration.** Adding columns or tables for status persistence requires migration handling.
- **MEDIUM: UI complexity.** Rendering a timeline of statuses in chat bubbles is non-trivial.

### Work Estimate: L (5-6 pts)
### Verdict: KEEP — Meaningful UX improvement. Wait for design spike results.

---

## #1819 — First-run UX: Experience-mode picker (full implementation + persistence)

### Summary
Full implementation of the experience-mode picker with persistence and mode-specific routing.

### Integration Analysis
- **Source doc:** User feedback 2026-03-08 + W16 scaffold (#1801)
- **Depends on:** W16 scaffold (#1801) landed
- **Key files:** Mode picker component, routing logic, config persistence

### Risks
- **HIGH: Mode definitions.** "Dev, companion, co-work, streaming, trading" — most of these modes don't have clear product specs yet.
- **MEDIUM: Routing complexity.** Different modes need different UI paths. This is a significant architectural decision.

### Work Estimate: XL (6-8 pts)
### Verdict: KEEP — Important for product differentiation, but needs product spec before implementation.

---

## #1820 — Desktop: Auto-updater reliability on slow/flaky connections

### Summary
Improve auto-updater resilience on slow or flaky GitHub download connections. Tester complaint from 2026-03-08.

### Integration Analysis
- **Source doc:** User feedback 2026-03-08
- **Key files:** Electrobun auto-updater configuration, download retry logic

### Risks
- **LOW: Well-scoped quality improvement.**
- **MEDIUM: GitHub rate limits.** Retrying downloads may hit GitHub rate limits or CDN throttling.
- **LOW: Testability.** Hard to simulate slow/flaky connections in CI.

### Work Estimate: M (3-4 pts)
### Verdict: KEEP — Real user pain point, should be addressed before wide release

---

## #1821 — Desktop: Linux packaging polish (.deb + AppImage)

### Summary
Linux packaging beyond "doesn't crash on launch" — first-run experience, tray icon, autostart, desktop file registration.

### Integration Analysis
- **Scope:** Platform-specific packaging for Linux
- **Key files:** Electrobun Linux build config, .desktop file, tray implementation

### Risks
- **MEDIUM: Linux distribution fragmentation.** Different distros handle tray, autostart, and desktop files differently.
- **MEDIUM: Testing coverage.** Need to test on at least Ubuntu/Debian and Fedora/RHEL families.
- **LOW: Not release-blocking.** macOS and Windows are the primary targets.

### Work Estimate: L (5-6 pts)
### Verdict: KEEP — Important for Linux users, but lower priority than macOS/Windows

---

## #1822 — Tracking: Repo cleanup — 14 open checklist items

### Summary
Tracks 14 remaining items from `docs/plans/2026-03-23-repo-cleanup-plan.md`. Includes knip unused files (212 found), dependency audit, CI cleanup.

### Integration Analysis
- **Source doc:** `docs/plans/2026-03-23-repo-cleanup-plan.md`
- **Scope:** Broad repo hygiene — dead code removal, dependency pruning, CI modernization

### Risks
- **MEDIUM: Scope.** 14 items is a lot. Some may be stale or no longer relevant.
- **LOW: Each item is independently safe.** Cleanup items are typically low-risk.

### Work Estimate: L (6-8 pts total across items)
### Verdict: KEEP — Valid hygiene work. Should be groomed — some items may have been addressed by subsequent work.

---

## #1823 — Tracking: Wallet routing and UX parity (Stream S3)

### Summary
10 open items across wallet routing abstraction, 0x integration, fallback, and UX parity.

### Integration Analysis
- **Source doc:** `docs/plans/2026-03-26-wallet-routing-and-ux-parity.md`
- **Scope:** Blockchain/wallet infrastructure

### Risks
- **HIGH: External service dependencies.** 0x and other DEX aggregators change APIs frequently.
- **MEDIUM: Security.** Wallet operations require careful security review.
- **LOW: Isolated subsystem.** Wallet code is relatively independent of core runtime.

### Work Estimate: XL (8-10 pts total across items)
### Verdict: KEEP — Important for crypto use cases. Needs security review before any implementation.

---

## #1824 — Tracking: zh-CN companion input lock fix (Stream S4)

### Summary
Companion input stays disabled after certain Chinese language inputs. 8 open items. Linked to existing issue #1359.

### Integration Analysis
- **Source doc:** `docs/plans/2026-03-26-zh-cn-companion-input-lock.md`
- **Linked issue:** #1359
- **Scope:** Internationalization / input handling bug

### Risks
- **MEDIUM: Input method editor (IME) interaction.** CJK input methods have complex state machines. Fixes may be platform-specific.
- **LOW: Well-documented.** 8 specific items with clear reproduction steps.

### Work Estimate: M (4-5 pts)
### Verdict: KEEP — Real user-facing bug for Chinese language users

---

## #1825 — Tracking: Milady browser workspace (Electrobun tabs)

### Summary
Desktop-owned browser workspace using isolated BrowserWindows rather than web-tab containment. Design decision for how Milady handles web browsing within the desktop app.

### Integration Analysis
- **Source doc:** `docs/plans/2026-04-05-milady-browser-workspace.md`
- **Scope:** Major Electrobun architectural feature
- **Labels include:** `security` — security-sensitive due to browser isolation requirements

### Risks
- **HIGH: Security.** Browser workspace with isolated windows must prevent cross-origin data leakage. Requires thorough security review.
- **HIGH: Complexity.** Browser embedding is one of the hardest desktop app challenges. Window lifecycle, navigation, cookies, permissions all need handling.
- **MEDIUM: Electrobun maturity.** Electrobun may not have all APIs needed for full browser workspace.

### Work Estimate: XXL (10+ pts)
### Verdict: KEEP — Ambitious feature. Needs architecture review before any implementation.

---

## #1826 — Tracking: Agentic games PRD

### Summary
Product thesis: not "launch a game in iframe" but long-running agent-driven game experiences where users watch, chat, and steer. Gap analysis against current capabilities.

### Integration Analysis
- **Source doc:** `docs/plans/2026-04-06-agentic-games-apps-prd-gap-analysis.md`
- **Scope:** Product direction, not implementation yet

### Risks
- **HIGH: Speculative.** This is a product thesis, not a defined feature. Significant unknowns around agent-driven game mechanics.
- **MEDIUM: Scope.** Could consume enormous engineering resources if not carefully bounded.

### Work Estimate: XXL (10+ pts for implementation; tracking issue itself is just a pointer)
### Verdict: KEEP — Worth tracking as a product direction. Do not staff until product specs are concrete.

---

## #1827 — Tracking: LifeOps — principal ownership primitive

### Summary
Core finding: the biggest missing primitive in LifeOps is principal ownership. Tracks the design and implementation of ownership semantics for life operations.

### Integration Analysis
- **Source doc:** `docs/plans/2026-04-04-lifeops-architecture-options.md`
- **Scope:** LifeOps subsystem architecture

### Risks
- **HIGH: Architectural decision.** Principal ownership affects authorization, data access, and multi-tenant scenarios. Wrong abstraction is expensive to fix.
- **MEDIUM: Cross-cutting concern.** Ownership touches many subsystems.

### Work Estimate: XL (6-8 pts)
### Verdict: KEEP — Important architectural gap. Needs careful design before implementation.
