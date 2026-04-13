# Beyond-Sprint: Tracking / Epic Issues — #1822-#1828

**Priority:** Beyond current sprint
**Theme:** Future work tracking
**Status recommendation:** Mixed — see individual assessments

---

## #1828 — Tester feedback burn-down tracker

### RECOMMEND: CLOSE — Redundant

Every bullet in this issue is already tracked by an individual W16 issue:
- Experience modes → #1801 (W16), #1819 (beyond)
- Anthropic OAuth → #1796 (W16)
- Claude API key confusion → #1796 (W16)
- "No buttons work" → #1795 (W16)
- Connect Eliza Cloud → no response → #1794 (W16)
- Plugin/settings persistence → #1798 (W16)
- Confusing release page → #1803 (W16)
- macOS Apple Silicon + Intel → #1797 (W16)
- GitHub download speed → #1820 (beyond)

This tracker adds no value beyond the individual issues.

---

## #1827 — LifeOps: principal ownership primitive

### RECOMMEND: KEEP — Valid future architecture work

### Current State
- LifeOps actions exist at `packages/agent/src/actions/life*.ts` (life.ts, life-param-extractor.ts, life-update-extractor.ts, life.extractor.ts)
- Tests at `life.test.ts`
- Detailed architecture plan at `docs/plans/2026-04-04-lifeops-architecture-options.md` (536 lines)
- Implementation plan at `docs/plans/2026-04-04-milaidy-life-ops-implementation-plan.md`

### Key Finding
Records are keyed by `agent_id`, not by user or agent subject. This is the core architectural gap — a multi-user scenario can't distinguish whose life data is whose.

### Integration Work
- Add principal (user/subject) ownership to LifeOps schema
- Migrate existing records
- Update all LifeOps actions to be principal-aware
- Wire chat sidebar to render LifeOps-specific widgets (not generic todo)

### Estimated Effort: 2-3 weeks

---

## #1826 — Agentic games PRD: watch/chat/steer implementation

### RECOMMEND: KEEP — Valid, backed by substantial planning

### Current State
- Detailed PRD gap analysis at `docs/plans/2026-04-06-agentic-games-apps-prd-gap-analysis.md` (1098 lines)
- Supported apps: `@elizaos/app-2004scape`, `@hyperscape/plugin-hyperscape`, `@elizaos/app-babylon`, `@elizaos/app-defense-of-the-agents`
- Some game plugins already in `plugins/` (app-2004scape, app-babylon, app-defense-of-the-agents, app-clawville)
- BabylonTerminal component exists at `packages/app-core/src/components/apps/BabylonTerminal.tsx`
- GameView exists at `packages/app-core/src/components/apps/GameView.tsx`

### Integration Work
- Watch mode: spectator view for agent-driven game sessions
- Chat mode: interact with game agents without taking control
- Steer mode: influence agent decisions through natural language
- Long-running agent-driven worlds (not just iframe game embeds)

### Estimated Effort: 3-4 weeks
### Risks: Complex real-time coordination between game runtime and agent runtime

---

## #1825 — Milady browser workspace (Electrobun tabs)

### RECOMMEND: KEEP — Valid, actively has code scaffold

### Current State
- Design doc at `docs/plans/2026-04-05-milady-browser-workspace.md`
- **Code already exists:**
  - `apps/app/electrobun/src/native/browser-workspace.ts` — manages hidden/showable browser tabs
  - `packages/agent/src/services/browser-workspace.ts` — agent-side client
  - `packages/agent/src/api/browser-workspace-routes.ts` — API surface
  - `packages/app-core/src/components/pages/BrowserWorkspaceView.tsx` — UI
  - `plugins/app-browser` (`@elizaos/app-browser`) — browser workspace + wallet actions

### Integration Work (follow-ups from doc)
- Richer page introspection beyond raw JS eval/screenshot
- True in-page wallet-provider injection for external dapps
- Tab lifecycle management (persistence, session restore)
- Security: sandboxing, CSP, cross-origin isolation

### Estimated Effort: 2-3 weeks
### Risks: Security surface of desktop-controlled browser tabs is significant

---

## #1824 — zh-CN companion input lock fix

### RECOMMEND: KEEP — Valid bug, but low priority

### Current State
- Companion components at `packages/app-core/src/components/companion/`
- No `inputDisabled` or `isInputDisabled` pattern found in companion components (search returned no results)
- Bug may be in a different layer (CompanionHeader, shell controls, state machine)
- Linked to existing issue #1359

### Integration Work
- Reproduce with zh-CN locale
- Trace input enable/disable state machine
- Fix whatever prevents input re-enabling after agent response

### Estimated Effort: 1-3 days
### Risks: Locale-specific bugs can be hard to reproduce without native speakers

---

## #1823 — Wallet routing and UX parity

### RECOMMEND: KEEP — Valid, linked to existing PR #1363

### Current State
- Related to existing PR #1363
- 10 open checklist items in `docs/plans/2026-03-26-wallet-routing-and-ux-parity.md`
- Covers: routing abstraction, 0x integration, fallback, UX parity

### Integration Work
- Complete wallet routing abstraction
- 0x integration for swap/trade
- Fallback handling for failed transactions
- UX parity across wallet providers

### Estimated Effort: 2-3 weeks
### Risks: Wallet interactions are security-critical; needs thorough audit

---

## #1822 — Repo cleanup: 14 open checklist items

### RECOMMEND: KEEP — Valid tech debt work

### Current State
- Source doc: `docs/plans/2026-03-23-repo-cleanup-plan.md`
- Baseline: 212 unused files (cleaned), 84 unused exported types remaining, 133 dep findings
- 72 cross-package re-export bridge files
- 212 package-boundary violations before manifest fixes

### Integration Work
- Address remaining 84 unused exported types
- Clean up 133 dependency findings
- Reduce cross-package re-export bridges
- Complete the 14 open checklist items

### Estimated Effort: 1-2 weeks (incremental)
### Risks: LOW — cleanup work with clear checklist
