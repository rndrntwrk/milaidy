# Open Issues Review — 2026-04-12

## Summary

**Total open issues reviewed:** 38
**Verdict: Keep (valid):** 35
**Verdict: Close:** 3

---

## Triage Verdicts

### CLOSE (3 issues) — all were already closed at time of review

| # | Title | Reason | Status |
|---|-------|--------|--------|
| #1782 | sprint check list | Redundant meta-issue. Full W16 sprint plan copy-pasted as HTML. All items already tracked as individual issues #1794-#1813. Labels (bug, connector, performance) were misapplied. | Already closed |
| #1130 | ChatGPT Subscription OAuth token lacks API scope | 3+ weeks old. Root cause is entirely external: upstream OAuth client in `@mariozechner/pi-ai` requests only identity scopes, not `api.model.read`. Not fixable in milady codebase. Workaround: use Claude Subscription. | Already closed |
| #1828 | [Docs] Tester feedback burn-down tracker | Pure tracking issue whose items are already covered by W16 sprint issues. Source doc is ground truth; this issue adds nothing. | Already closed |

### KEEP — Active Sprint W16 Desktop Track (10 issues)

| # | Priority | Title | Complexity | Report |
|---|----------|-------|------------|--------|
| #1794 | P0 | macOS: fix post-cloud-connect 'no response' path | XL (6 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1795 | P0 | 'No buttons work' audit and fix sweep | L (5 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1796 | P0 | Provider onboarding UX pass | L (5 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1797 | P0 | Signed macOS smoke gate green on both arch | M (4 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1798 | P1 | Plugin / settings / config persistence verification | M (4 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1799 | P1 | Provider/cloud renderer error mirroring polish | M (3 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1800 | P1 | 'Reset Milady...' regression test | S (2 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1801 | P2 | First-run experience-mode selector (design + scaffold) | M (3 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1802 | P2 | Regression-matrix: convert 3 manual tray/vibrancy items | S (2 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |
| #1803 | P2 | Releases page UX pass | S (2 pts) | [sprint-w16-desktop.md](sprint-w16-desktop.md) |

### KEEP — Active Sprint W16 Runtime Track (10 issues)

| # | Priority | Title | Complexity | Report |
|---|----------|-------|------------|--------|
| #1804 | P0 | Plugin workspace — Phase 1: repo-local source layout | XL (6 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1805 | P0 | Plugin workspace — Phase 2: Bun workspaces + exact pins | XL (6 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1806 | P0 | Pack-and-test scaffold (Phase 5 minimal) | M (4 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1807 | P0 | Proof of life — one plugin + one core from vendored source | M (3 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1808 | P1 | Orchestrator consolidation — test + type coverage | M (4 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1809 | P1 | Action callback streaming — optional merge metadata | M (3 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1810 | P1 | Cut patch-deps.mjs by ~half | M (3 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1811 | P2 | scripts/sync-upstream-versions.mjs | S (2 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1812 | P2 | Doctor + docs refresh for new repo-local workflow | S (2 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |
| #1813 | P2 | Action callback — persistence of intermediate statuses (design spike) | S (2 pts) | [sprint-w16-runtime.md](sprint-w16-runtime.md) |

### KEEP — Beyond-Sprint / Future Roadmap (14 issues)

| # | Title | Report |
|---|-------|--------|
| #1814 | [Plugin workspace Phase 3] Remove legacy override friction | [beyond-sprint.md](beyond-sprint.md) |
| #1815 | [Plugin workspace Phase 4] Add version and provenance controls | [beyond-sprint.md](beyond-sprint.md) |
| #1816 | [Plugin workspace Phase 5 full] Pack-and-test release gating in CI | [beyond-sprint.md](beyond-sprint.md) |
| #1817 | [Plugin workspace Phase 6] Reduce patch-deps debt to zero | [beyond-sprint.md](beyond-sprint.md) |
| #1818 | [Action callbacks] Persistence of intermediate progressive statuses | [beyond-sprint.md](beyond-sprint.md) |
| #1819 | [First-run UX] Experience-mode picker — full implementation | [beyond-sprint.md](beyond-sprint.md) |
| #1820 | [Desktop] Auto-updater reliability on slow/flaky connections | [beyond-sprint.md](beyond-sprint.md) |
| #1821 | [Desktop] Linux packaging polish (.deb + AppImage) | [beyond-sprint.md](beyond-sprint.md) |
| #1822 | [Tracking] Repo cleanup — 14 open checklist items | [beyond-sprint.md](beyond-sprint.md) |
| #1823 | [Tracking] Wallet routing and UX parity | [beyond-sprint.md](beyond-sprint.md) |
| #1824 | [Tracking] zh-CN companion input lock fix | [beyond-sprint.md](beyond-sprint.md) |
| #1825 | [Tracking] Milady browser workspace (Electrobun tabs) | [beyond-sprint.md](beyond-sprint.md) |
| #1826 | [Tracking] Agentic games PRD | [beyond-sprint.md](beyond-sprint.md) |
| #1827 | [Tracking] LifeOps — principal ownership primitive | [beyond-sprint.md](beyond-sprint.md) |

### KEEP — Major Architectural Proposal (1 issue)

| # | Title | Report |
|---|-------|--------|
| #1848 | Migration: Move milady packages into eliza plugins | [1848-migration.md](1848-migration.md) |

---

## Risk Summary

### Highest-Risk Sprint Items
1. **#1804 + #1805 (Plugin workspace Phase 1+2):** Foundational changes to repo layout. If this breaks, every developer is blocked. Must be landed carefully with fresh-clone verification.
2. **#1794 (Post-cloud-connect no response):** P0 user-facing bug spanning Electrobun main process, renderer, runtime, and cloud plugin. Cross-layer debugging required.
3. **#1795 (No buttons work):** Systemic UI wiring failure. Risk of partial fix that leaves some views broken.
4. **#1797 (Signed macOS smoke gate):** Depends on Dev ID identity being available on smoke box. External dependency on Apple signing infra.

### Cross-Issue Dependencies (Critical Path)
```
#1804 (Phase 1) → #1805 (Phase 2) → #1807 (Proof of life)
                                   → #1806 (Pack-and-test)
                                   → #1810 (Cut patch-deps)
                                   → #1811 (Sync versions)
                                   → #1812 (Doctor refresh)

#1794 (No response) → #1796 (Provider onboarding) depends on this fix
#1801 (Experience selector scaffold) → #1819 (Full implementation, beyond-sprint)
#1813 (Design spike) → #1818 (Full implementation, beyond-sprint)
```

### Capacity Concern
W16 sprint plans 33 story points across 5 engineers after overhead adjustment. The two P0 plugin workspace items alone consume 12 points (36% of capacity). If Phase 1 slips past Wed, Phase 2 and all downstream items are at risk.
