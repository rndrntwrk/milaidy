# Issues Research — 2026-04-12

Research reports for all open GitHub issues as of 2026-04-12.

## Triage Summary

### Issues to CLOSE (5)

| # | Title | Reason |
|---|-------|--------|
| #1782 | Sprint check list | Redundant — all items tracked in individual issues #1794-#1828 |
| #1804 | Plugin workspace Phase 1 | Already completed — eliza/ submodule + plugins/ directory + workspaces configured |
| #1805 | Plugin workspace Phase 2 | Already completed — all @elizaos/* deps use workspace:* |
| #1828 | Tester feedback burn-down tracker | Redundant — every bullet already has its own W16 issue |
| #1130 | ChatGPT OAuth scope bug | Upstream dependency issue — not fixable in milady, workaround exists |

### Issues to KEEP (32)

**W16 Desktop Sprint (10 issues: #1794-#1803)**
- All valid, active sprint work for Apr 13-17
- P0s: cloud-connect no-response, no-buttons-work audit, provider onboarding, macOS signing
- P1s: settings persistence, error mirroring, reset test
- P2s (stretch): experience-mode scaffold, regression-matrix, releases page

**W16 Runtime Sprint (8 issues: #1806-#1813)**
- All valid after #1804/#1805 closures
- P0s: pack-and-test scaffold, proof-of-life demo
- P1s: orchestrator consolidation, action callback metadata, patch-deps reduction
- P2s (stretch): sync-versions script, doctor refresh, callback persistence spike

**Beyond-Sprint Plugin Workspace (4 issues: #1814-#1817)**
- Phase 3-6 of plugin workspace architecture
- Valid future work, depends on W16 stabilization

**Beyond-Sprint Desktop (3 issues: #1819-#1821)**
- Experience-mode full impl, auto-updater reliability, Linux packaging

**Beyond-Sprint Runtime (1 issue: #1818)**
- Action callback persistence implementation

**Beyond-Sprint Tracking (6 issues: #1822-#1827)**
- Repo cleanup, wallet routing, zh-CN input lock, browser workspace, agentic games, LifeOps principal ownership

**Migration (1 issue: #1848)**
- Move milady packages upstream — valid but high-risk, defer until after W16

## Reports

- [1848-migration-packages-upstream.md](1848-migration-packages-upstream.md) — Package migration to elizaOS upstream
- [w16-desktop-stability-sprint.md](w16-desktop-stability-sprint.md) — W16 Desktop Sprint (#1794-#1803)
- [w16-runtime-sprint.md](w16-runtime-sprint.md) — W16 Runtime Sprint (#1804-#1813)
- [beyond-sprint-plugin-workspace.md](beyond-sprint-plugin-workspace.md) — Plugin Workspace Phases 3-6 (#1814-#1817)
- [beyond-sprint-desktop.md](beyond-sprint-desktop.md) — Desktop polish (#1819-#1821)
- [beyond-sprint-runtime.md](beyond-sprint-runtime.md) — Action callback persistence (#1818)
- [beyond-sprint-tracking-issues.md](beyond-sprint-tracking-issues.md) — Tracking/epic issues (#1822-#1828)
- [1130-openai-oauth-scope.md](1130-openai-oauth-scope.md) — OpenAI OAuth upstream bug
- [1782-sprint-checklist.md](1782-sprint-checklist.md) — Sprint plan meta-tracker
