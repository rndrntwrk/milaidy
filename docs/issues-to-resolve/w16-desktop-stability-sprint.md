# W16 Desktop Stability Sprint — Issues #1794-#1803

**Sprint:** W16 (Apr 13-17, 2026)
**Theme:** First-run to first-reply works on signed macOS + Windows builds
**Status recommendation:** ALL VALID — active sprint work

---

## #1794 — macOS: fix post-cloud-connect 'no response' path (P0, 6pts)

### Current State
- Bug confirmed in tester feedback doc (`docs/apps/desktop/user-feedback-2026-03-08.md`)
- Cloud plugin exists at `plugins/plugin-elizacloud` (submodule)
- Electrobun agent integration at `apps/app/electrobun/src/native/agent.ts`
- Recent commits added RPC tracing (`033922412`) and error mirroring (`01cf4a200`)

### Integration Work
- Reproduce on develop → instrument AgentManager → runtime → cloud plugin path
- Coordinate with cloud team if server-side issue
- Add regression test for connect-then-respond path
- Verify on signed macOS build (both arm64 and x64)

### Risks
- May require cloud submodule changes (cross-repo coordination)
- "No response" could have multiple root causes (token refresh, SSE reconnect, state machine)

---

## #1795 — 'No buttons work' audit and fix sweep (P0, 5pts)

### Current State
- Tester report from 2026-03-08 doc
- Shell-level views: companion, settings, plugins, chat, games, coding, cloud
- Recent high commit velocity (~700 commits in 10 days) likely introduced wiring regressions

### Integration Work
- Walk every top-level shell view, log every dead/disabled button
- Triage: wiring broken vs correctly disabled vs wrong state
- Fix shell-level issues; file follow-ups for interior bugs

### Risks
- Scope creep — "every button" can expand if interior views are included
- Dependency on provider state (some buttons correctly disabled without provider)

---

## #1796 — Provider onboarding UX pass (P0, 5pts)

### Current State
- `@mariozechner/pi-ai` handles OAuth flows
- Provider picker exists in `packages/app-core/src/components/onboarding/`
- `ConnectionProviderDetailScreen.tsx` has pi-ai references
- Provider switcher at `packages/app-core/src/components/settings/ProviderSwitcher.tsx`

### Integration Work
- UX + copy pass on provider picker and Anthropic onboarding screens
- Distinct paths: Claude console API key, Claude Pro subscription, `claude setup-token`
- Validate post-onboarding → first reply works (depends on #1794)

### Risks
- OAuth flow is partially upstream (`pi-ai` package) — limited control
- Multiple provider modes means combinatorial testing surface

---

## #1797 — Signed macOS smoke gate green on both arch (P0, 4pts)

### Current State
- Release regression checklist exists at `docs/apps/desktop/release-regression-checklist.md`
- Electrobun build at `apps/app/electrobun/`
- No desktop test directory (`apps/app/electrobun/test/` is empty)

### Integration Work
- Ensure Dev ID identity loaded on smoke box
- Fix packaging/signing issues for arm64 + x64
- Keep unsigned test as dev fallback only

### Risks
- Hardware dependency — need both Intel and Apple Silicon boxes
- Notarization can add unpredictable delays

---

## #1798 — Plugin/settings/config persistence verification (P1, 4pts)

### Current State
- Settings persistence in `packages/app-core/src/components/pages/SettingsView.tsx`
- Reset handling exists in multiple files
- Diagnostics bundle from commit `4010fbfa5`

### Integration Work
- Write e2e: Settings → toggle → restart → assert
- Use diagnostics bundle for screenshot artifacts

### Risks
- Electrobun restart behavior may differ between dev and packaged mode

---

## #1799 — Provider/cloud renderer error mirroring polish (P1, 3pts)

### Current State
- Commits `01cf4a200` and `033922412` added initial tracing
- Console log API at `/api/dev/console-log`

### Integration Work
- Extend error capture for provider auth failures and post-connect RPC errors
- Ensure no PII/secrets in captured logs

### Risks
- LOW — incremental polish on existing infrastructure

---

## #1800 — 'Reset Milady' regression test (P1, 2pts)

### Current State
- Reset handling exists in `SettingsView.tsx`, `WelcomeStep.tsx`, `IdentityStep.tsx`, `CharacterEditor.tsx`, `AppContext.tsx`
- `docs/apps/desktop/desktop-main-process-reset.md` likely documents the flow

### Integration Work
- Test both main-process menu path and Settings `handleReset` path
- Must run in packaged mode

### Risks
- LOW — well-scoped test

---

## #1801 — First-run experience-mode selector scaffold (P2 stretch, 3pts)

### Current State
- No existing experience-mode picker scaffold found
- References to `experienceMode` only in config-ui and cloud-dashboard-utils
- Modes proposed: dev, companion, co-work, streaming, trading

### Integration Work
- Design spike + behind-flag UI scaffold only
- No persistence wiring this sprint

### Risks
- LOW — behind a flag, no production impact

---

## #1802 — Regression-matrix: convert 3 manual items to automated checks (P2 stretch, 2pts)

### Current State
- `test/regression-matrix.json` already exists
- `docs/apps/desktop/release-regression-checklist.md` exists with manual gates
- No desktop e2e test infrastructure visible

### Integration Work
- Pick 3 items (tray persistence, vibrancy, context menu)
- Move to regression-matrix.json with real assertions

### Risks
- May need Electrobun-specific test harness that doesn't exist yet

---

## #1803 — Releases page UX pass (P2 stretch, 2pts)

### Current State
- macOS ships 2 DMGs (arm64 + x64) — confusing for users
- No existing "which file do I download?" logic found

### Integration Work
- One-screen dispatch by OS + arch
- Document the 2 macOS DMGs issue

### Risks
- LOW — documentation + UX only
