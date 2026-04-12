# W16 Desktop Sprint — Detailed Research Report

**Sprint:** Apr 13-17, 2026
**Theme:** Desktop app stability & polish
**Sprint goal:** First-run to first-reply works on signed macOS + Windows builds, and every button on the shell does something.

---

## #1794 — [P0] macOS: fix post-cloud-connect 'no response' path

### Summary
Users on macOS report that after successfully connecting Eliza Cloud, the agent still does not respond. The cloud connection flow appears to complete but messages get dropped somewhere in the AgentManager -> runtime -> cloud plugin pipeline.

### Integration Analysis
- **Scope:** Cross-layer bug spanning Electrobun main process (`apps/app/electrobun/src/native/agent.ts`), renderer, app-core runtime (`packages/app-core/src/runtime/eliza.ts`), and the cloud plugin (`@elizaos/plugin-elizacloud`).
- **Key files:**
  - `apps/app/electrobun/src/native/agent.ts` — AgentManager, startup guards, NODE_PATH setup
  - `packages/app-core/src/runtime/eliza.ts` — Agent loader, plugin initialization
  - Cloud plugin connection/handshake code
  - Recent commits: `033922412` (RPC trace), `01cf4a200` (renderer error mirror)
- **Repro required:** Must reproduce on both arm64 and x64 macOS before fix work begins

### Weaknesses & Risks
- **HIGH: Cross-layer debugging complexity.** The bug could be in Electrobun IPC, the runtime's plugin initialization, or the cloud plugin's post-connect handshake. Each layer has different tooling.
- **MEDIUM: Cloud submodule pin.** The Eliza Cloud submodule must be pinned correctly. If the issue is server-side, this team can't fix it alone.
- **MEDIUM: Regression test in packaged mode.** E2e tests in packaged builds are slower and harder to debug than dev-mode tests.
- **LOW: Dependency on cloud team.** If root cause is server-side, coordination with cloud team adds calendar risk.

### Work Involved
- **Estimated:** 6 story points (XL), 2 engineers, ~3 days
- Reproduce on develop (Day 1)
- Instrument traces (Day 1-2)
- Fix root cause (Day 2-3)
- Write regression test that runs in packaged mode (Day 3)
- Verify on signed macOS build (Day 3)

### Verdict: KEEP — Critical P0 bug blocking first-run-to-first-reply story

---

## #1795 — [P0] 'No buttons work' audit and fix sweep

### Summary
Tester report from 2026-03-08: "no buttons work" on macOS desktop app. Requires systematic audit of every top-level shell view to verify all buttons either work or have disabled states with explanatory tooltips.

### Integration Analysis
- **Scope:** UI layer — primarily `packages/app-core/src/components/` and `packages/app-core/src/App.tsx`
- **Key files:**
  - `packages/app-core/src/components/companion/CompanionHeader.tsx` — shell header buttons
  - `packages/app-core/src/components/companion/shell-control-styles.ts` — button styling
  - All top-level view components under `packages/app-core/src/components/`
- **Method:** Walk every primary button on every top-level view. Triage into: wiring broken / correctly disabled / wrong disabled state.

### Weaknesses & Risks
- **HIGH: Scope creep.** "Every button on every view" is open-ended. Must stay disciplined — shell-level wiring only, file follow-ups for interior view bugs.
- **MEDIUM: State-dependent buttons.** Some buttons only work when certain runtime conditions are met (agent running, provider connected, etc.). Test must cover all states.
- **LOW: Regression.** Fixing one broken handler could break another if state management is tangled.

### Work Involved
- **Estimated:** 5 story points (L), 2 engineers, ~2.5 days
- Full audit walk-through with logging (Day 1)
- Triage and categorize (Day 1)
- Fix shell-level wiring issues (Day 2-3)
- Screenshots before/after (Day 3)
- File follow-up issues for interior view bugs

### Verdict: KEEP — Critical UX bug, gate for desktop release

---

## #1796 — [P0] Provider onboarding UX pass

### Summary
Multiple provider onboarding paths (Anthropic OAuth, Claude console API key, Claude Pro subscription, `claude setup-token` CLI) are confusing. OAuth doesn't clearly lead users to completion. Users can't distinguish between the different Claude auth methods.

### Integration Analysis
- **Scope:** UI + copy changes across provider picker and Anthropic onboarding screens
- **Key files:**
  - Provider picker/selector UI components
  - Anthropic OAuth flow handler
  - Onboarding wizard views
  - Ties off review follow-ups from PR #1757 (cloud-coding-agents)
- **Dependency:** Must validate post-onboarding agent response (depends on #1794 fix)

### Weaknesses & Risks
- **HIGH: Dependency on #1794.** If post-cloud-connect is still broken, onboarding "success" can't be validated end-to-end.
- **MEDIUM: UX design ambiguity.** "One unambiguous path per mode" requires design decisions that aren't fully specified in the issue.
- **MEDIUM: OAuth redirect handling.** OAuth flows involve external services (Anthropic) whose behavior may change.
- **LOW: Copy review.** Copy needs review but this is low-risk work.

### Work Involved
- **Estimated:** 5 story points (L), 1 engineer, ~2.5 days
- UX audit of current provider picker (Day 1)
- Redesign copy and flow for each auth method (Day 1-2)
- Implementation (Day 2-3)
- End-to-end test: fresh install -> pick provider -> connect -> first reply (Day 3)
- Screenshots of new flow for PR

### Verdict: KEEP — Critical P0 for first-run experience

---

## #1797 — [P0] Signed macOS smoke gate green on both arch (arm64 + x64)

### Summary
macOS code signing and packaging must pass on both Apple Silicon and Intel. The signed smoke test (`bun run test:desktop:packaged`) needs to be green for both architectures.

### Integration Analysis
- **Scope:** Build/release engineering — Electrobun packaging, code signing, notarization
- **Key files:**
  - Electrobun build configuration in `apps/app/electrobun/`
  - Test suite: `bun run test:desktop:packaged`
  - CI configuration for artifact publishing
- **External dependency:** Developer ID identity must be loaded on the smoke box

### Weaknesses & Risks
- **HIGH: External dependency on Apple Developer ID.** If the signing identity isn't available, Day 1 is blocked.
- **MEDIUM: Architecture-specific bugs.** Some packaging issues only manifest on one arch (typically x64 on Apple Silicon build machines via Rosetta).
- **MEDIUM: Notarization timing.** Apple's notarization service can be slow/flaky, adding unpredictable CI time.
- **LOW: Existing unsigned fallback.** `bun run test:desktop:packaged:unsigned` exists as a dev fallback, so development isn't blocked even if signing issues persist.

### Work Involved
- **Estimated:** 4 story points (M), 2 engineers, ~2 days
- Verify Dev ID identity on smoke box (Day 1)
- Fix packaging/signing issues (Day 1-2)
- Green run for arm64 + x64 (Day 2)
- Publish artifacts to sprint branch CI (Day 2)

### Verdict: KEEP — Release-blocking. No signed build = no public release.

---

## #1798 — [P1] Plugin / settings / config persistence verification

### Summary
Prove that Settings panels (Media, Providers, plugins) persist across a full shell restart. Build on the live-diagnostics bundle from `4010fbfa5`.

### Integration Analysis
- **Scope:** E2e test writing + potential config persistence bug fixes
- **Key files:**
  - Settings UI components (`packages/app-core/src/components/settings/`)
  - Config persistence layer (`~/.milady/milady.json`, `MILADY_CONFIG_PATH`)
  - Shell restart handling in Electrobun
  - Diagnostics bundle from `4010fbfa5`
- **E2e pattern:** Open Settings -> toggle persisted keys -> restart shell -> assert state

### Weaknesses & Risks
- **MEDIUM: Shell restart in e2e.** Restarting the full Electrobun shell in a test is complex — need to handle process lifecycle.
- **MEDIUM: Partial persistence.** Some settings may persist via config file, others via localStorage, others via IPC state. Inconsistent storage could cause partial failures.
- **LOW: Screenshot artifacts.** Diagnostics bundle captures screenshots — large artifacts in CI.

### Work Involved
- **Estimated:** 4 story points (M), 1 engineer, ~2 days
- Identify all persisted settings keys (Day 1)
- Write e2e test (Day 1-2)
- Fix any persistence bugs discovered (Day 2)
- Ensure failure mode is clear diff, not a hang

### Verdict: KEEP — Important for desktop reliability

---

## #1799 — [P1] Provider/cloud renderer error mirroring polish

### Summary
Extend error mirroring so provider auth failures and post-connect RPC errors are captured in `/api/dev/console-log` with enough context to debug from a bug report alone. Builds on existing commits `01cf4a200` and `033922412`.

### Integration Analysis
- **Scope:** Diagnostics/observability — extending existing error mirroring
- **Key files:**
  - Electrobun renderer error mirroring (from `01cf4a200`)
  - Desktop RPC/network failure tracing (from `033922412`)
  - `/api/dev/console-log` endpoint
  - Bug-report bundle generation
- **Constraint:** No PII/secrets in captured logs (follow existing sanitization)

### Weaknesses & Risks
- **LOW: Well-scoped.** Builds on existing patterns, clear deliverable.
- **MEDIUM: Sanitization.** Must carefully avoid logging API keys, tokens, or user data in error captures.
- **LOW: Performance.** Additional logging in hot path (RPC calls) could add overhead — but this is diagnostic-only.

### Work Involved
- **Estimated:** 3 story points (M), 1 engineer, ~1.5 days
- Extend error mirroring for provider-path RPC errors (Day 1)
- Add sanitization for URLs and status codes (Day 1)
- Verify bug-report bundle captures new data (Day 2)

### Verdict: KEEP — Low-risk, high-value observability improvement

---

## #1800 — [P1] 'Reset Milady...' regression test

### Summary
Lock in the main-process reset flow with a packaged-mode test so the tray/menu "Reset Milady" entry can't silently drift from the Settings `handleReset` path.

### Integration Analysis
- **Scope:** Test-only — covers two reset paths
- **Key files:**
  - `docs/apps/desktop/desktop-main-process-reset.md` — describes the flow
  - Main-process `reset-milady` menu handler (Electrobun)
  - Settings `handleReset` path (renderer)
- **Test runs in packaged mode** — must work with signed builds

### Weaknesses & Risks
- **MEDIUM: Packaged-mode testing.** Tests in packaged mode are slower and harder to debug.
- **LOW: Well-scoped.** Two specific paths to test, clear success criteria.

### Work Involved
- **Estimated:** 2 story points (S), 1 engineer, ~1 day
- Write test covering both reset paths (Day 1)
- Verify in packaged mode (Day 1)

### Verdict: KEEP — Small, targeted, prevents regression

---

## #1801 — [P2] First-run experience-mode selector (design + scaffold only)

### Summary
Design spike + behind-flag UI scaffold for experience-mode selection during first run. Modes: dev, companion, co-work, streaming, trading. No persistence wiring this sprint.

### Integration Analysis
- **Scope:** Design exploration + scaffolded UI (behind feature flag)
- **Key files:**
  - New component under `packages/app-core/src/components/` (to be created)
  - Feature flag system
- **Out of scope:** Mode persistence, companion-vs-other routing changes

### Weaknesses & Risks
- **LOW: Explicitly scoped as stretch/design-only.** No risk to existing functionality since it's behind a flag.
- **MEDIUM: Design alignment.** Modes need clear definitions before scaffold is useful. "Streaming" and "trading" modes are aspirational features.
- **LOW: Feature flag debt.** Behind-flag code that never ships becomes tech debt.

### Work Involved
- **Estimated:** 3 story points (M stretch), 1 engineer, ~1.5 days
- Design spike: define modes, mock UI (Day 1)
- Scaffold component behind flag (Day 2)

### Verdict: KEEP — Low-risk stretch item, valuable UX exploration

---

## #1802 — [P2] Regression-matrix: convert 3 manual tray/vibrancy items to automated checks

### Summary
Pick 3 items from the manual release regression checklist and move them into `test/regression-matrix.json` with real assertions. Candidates: tray persistence, vibrancy effect, context menu dismiss.

### Integration Analysis
- **Scope:** Test automation — move manual checks to automated
- **Key files:**
  - `docs/apps/desktop/release-regression-checklist.md` — source checklist
  - `test/regression-matrix.json` — target for automated checks
  - Electrobun tray/vibrancy/context menu implementation

### Weaknesses & Risks
- **MEDIUM: Platform-specific assertions.** Vibrancy effect is macOS-only. Tray behavior differs across platforms.
- **LOW: Well-scoped.** 3 specific items, clear pass/fail criteria.

### Work Involved
- **Estimated:** 2 story points (S stretch), 1 engineer, ~1 day
- Choose 3 items and write assertions
- Integrate into regression-matrix.json

### Verdict: KEEP — Low-risk quality improvement

---

## #1803 — [P2] Releases page UX pass — 'which file do I download?'

### Summary
Create a clear "which file do I download?" screen that dispatches by OS + architecture. Document the 2 macOS DMGs (arm64 vs x64) issue.

### Integration Analysis
- **Scope:** Release page UX + documentation
- **Key files:**
  - GitHub Releases page configuration
  - `docs/apps/desktop.md` — macOS which-file section
- **Out of scope:** Auto-updater changes

### Weaknesses & Risks
- **LOW: Documentation and UX copy work.** Minimal code risk.
- **LOW: External dependency.** GitHub Releases formatting is limited but sufficient.

### Work Involved
- **Estimated:** 2 story points (S stretch), 1 engineer, ~1 day
- Design one-screen dispatch by OS + arch
- Update docs
- Consider adding a release page template or helper

### Verdict: KEEP — Low-risk UX improvement for downloads
