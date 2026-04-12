# Beyond-Sprint: Runtime Issues — #1818

**Priority:** Beyond current sprint
**Theme:** Action callback streaming maturation
**Status recommendation:** VALID

---

## #1818 — Action callbacks: Persistence of intermediate progressive statuses

### Current State
- `docs/runtime/action-callback-streaming.md` documents current behavior thoroughly
- `replaceCallbackText` / `preCallbackText` implemented in `chat-routes.ts`
- Progressive statuses (e.g., "Searching..." → "Now playing...") work in real-time
- On page reload, only final text persists — intermediate statuses are lost
- Design spike (#1813) is a W16 stretch goal that would inform this implementation

### Integration Work
- Schema change to persist intermediate callback statuses alongside final text
- Options: JSON array of status snapshots vs separate status_history column
- UI changes to replay status trail on conversation reload
- Consider storage cost — each action could generate many intermediate statuses
- Backwards compatibility with existing persisted conversations

### Estimated Effort
- 1-2 weeks depending on schema approach
- Depends on #1813 design spike landing first

### Risks
- Storage bloat — some actions generate dozens of intermediate statuses
- Migration complexity for existing conversation data
- Performance impact of storing + querying status history
- May need PGlite schema migration which has its own complexity in this project

### Weaknesses
- Not user-facing critical — most users don't reload mid-action
- Adds complexity to an already-nuanced streaming path
- Could be deferred indefinitely without user impact
