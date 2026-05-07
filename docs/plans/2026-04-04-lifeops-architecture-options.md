# LifeOps / Todo / Goals Architecture Options

Date: 2026-04-04
Owner: Shaw / Milady
Related plan: `docs/plans/2026-04-04-milaidy-life-ops-implementation-plan.md`
Input PRD: `/Users/shawwalters/Downloads/milaidy_prd_v1.docx`

> **Update (2026-04-10):** Milady no longer ships `@elizaos/plugin-todo` (see `plugins.json` and root dependencies). Todos use the workbench API and LifeOps-related runtime tasks. Later sections still name `plugin-todo` where they compare integration options against that historical baseline.

## 1. Research baseline

### 1.1 Current Milady state

- Milady already has a substantial LifeOps domain in core:
  - recurring definitions
  - occurrences
  - reminder plans and attempts
  - goals and goal links
  - workflows
  - browser sessions
  - channel policies
  - connector grants
  - Google Calendar and Gmail support
  - audit events
- The biggest missing primitive is principal ownership. Current LifeOps records are keyed by `agent_id`, not by user or agent subject.
- Workbench already aggregates `lifeops`, but the chat sidebar still renders a generic todo widget and ignores the richer LifeOps payload.
- Reminder execution exists, but proactive scheduling is still not wired into durable background execution.

### 1.2 Former `plugin-todo` baseline (historical)

- Milady previously shipped `@elizaos/plugin-todo@2.0.0-alpha.13-milady.0`, not the older upstream snapshot; that package has since been removed from the product.
- The package statically loaded from `packages/agent/src/runtime/eliza.ts`.
- The shipped plugin auto-bootstraps its own `todo` schema namespace and exposes `createTodoDataService`.
- Its core record model is still `agentId + worldId + roomId + entityId + todo fields`.
- Its reminder service still runs its own autonomous loop.
- That means it is good for agent/runtime task management and compatibility projections, but dangerous as a mirror target for user LifeOps unless duplicate reminder delivery is explicitly suppressed.

### 1.3 Current `plugin-goals` reality

- `plugin-goals` is not currently installed in this checkout.
- The public repo defaults to `alpha`, and `main` is a minimal TypeScript variant.
- The TypeScript goal model is notably better than `plugin-todo` on one axis: it already has `ownerType` and `ownerId`, so it can distinguish agent goals from entity goals.
- It is still shallow relative to the PRD:
  - no occurrence model
  - no reminder ladder
  - no escalation engine
  - no workflow linkage
  - no durable calendar or Gmail integration
  - no principal-aware privacy policy beyond owner selection

### 1.4 What this means

- `plugin-todo` is the current agent task substrate and compatibility surface.
- `plugin-goals` is a usable ownership-aware goal reference plugin, but not a full life-support system.
- LifeOps is already the only place in Milady that has the right PRD-shaped primitives.
- The real decision is not whether to use LifeOps.
- The real decision is where the source of truth lives, and how `plugin-todo` and `plugin-goals` should coexist with it.

## 2. Non-negotiable requirements

Any acceptable approach must satisfy all of the following:

- Support both owner goals/todos and agent goals/todos in v1.
- Enforce role-gated privacy:
  - owner items visible only to the owner, admins, and the agent
  - agent items visible only to admins and the agent
- Keep private items out of unrelated conversation context by default.
- Support PRD cadence shapes:
  - once
  - once daily
  - twice daily
  - weekly
  - ongoing / progression-based support
  - occasional / soft goals
- Support proactive reminders without requiring a manual API call.
- Integrate with queue, task, cron, and trigger systems in a restart-safe way.
- Allow `plugin-todo` and `plugin-goals` to run and be tested together with LifeOps.
- Avoid duplicate reminders, duplicate source-of-truth records, and privacy leaks.

### 2.1 V1 scope reduction

We should explicitly narrow the shipped scope.

- V1 should support the world owner/admin plus the agent.
- We should not build broad multi-user LifeOps UX yet.
- The data model should still leave room for future per-user expansion.
- All LifeOps actions, providers, and admin surfaces should be gated to `OWNER` / `ADMIN` in v1 using the existing roles plugin.
- Non-admin users should not be able to invoke LifeOps CRUD actions, list private LifeOps objects, or receive LifeOps provider context in general conversations.

## 3. Shared design decisions we need regardless of approach

These decisions do not go away in any option.

### 3.1 Principal model

We need an explicit subject model on every user-or-agent-owned object:

- `domain`: `user_lifeops` or `agent_ops`
- `subject_type`: `owner` or `agent` in v1, with room to expand to `entity` later
- `subject_id`: stable UUID for the owner/admin principal or agent
- `visibility_scope`: `owner_only`, `agent_and_admin`, or `owner_agent_admin`
- `context_policy`: `never`, `explicit_only`, `sidebar_only`, or `allowed_in_private_chat`
- `source_system`: `lifeops`, `plugin-todo`, `plugin-goals`, `workflow`, `calendar`, or `gmail`

For v1, we should treat `user_lifeops` as effectively "owner lifeops".
That keeps the model future-safe without forcing broad per-user support into the first release.

### 3.2 Object semantics

- Goals are long-term direction and support strategy.
- Todos/tasks are actionable items.
- Occurrences are the actionable instances shown in `Now` / `Next`.
- Agent ops are not just tagged user todos. They are a separate domain with different exposure rules.

### 3.3 Reminder engine ownership

This is a critical decision.

- We cannot let both LifeOps and `plugin-todo` independently remind on the same user-facing item.
- If an item is LifeOps-owned, only LifeOps should own reminder dispatch.
- If an item is plugin-owned, either the plugin owns reminders or the item must be explicitly marked as mirrored and reminder-suppressed in the plugin layer.

### 3.4 Plugin coexistence contract

If `plugin-todo` and `plugin-goals` remain active:

- each record needs a stable external reference
- sync direction must be explicit
- conflict resolution must be deterministic
- provider/context exposure rules must be principal-aware

### 3.5 Access surface contract

- LifeOps providers should resolve only for `OWNER` / `ADMIN` speakers in v1.
- LifeOps chat actions should validate role before reading or mutating state.
- Agent-op surfaces should be admin-only.
- Owner-facing personal LifeOps should still be separate from agent ops in the UI even if both are admin-visible.

## 4. Option A: Dual-plane system

LifeOps becomes the canonical system for user life support. `plugin-todo` and `plugin-goals` remain canonical for agent self-management.

### 4.1 Model

- Owner todos, habits, reminders, events, workflows, and owner goals live in LifeOps.
- Agent self-management stays in `plugin-todo` and `plugin-goals`.
- Workbench and chat UI compose both domains into one product surface.

### 4.2 How it works

- User request:
  - conversational capture creates or edits LifeOps records
  - LifeOps occurrence engine drives surfacing and reminders
- Agent self-planning:
  - agent creates plugin todo or goal records
  - these show in an admin-only `Agent Ops` panel
- Shared workbench overview:
  - compose `lifeops + plugin-todo + plugin-goals`
  - render user and agent items in separate sections

### 4.3 Required implementation work

1. Add owner/agent-aware ownership and privacy filtering to LifeOps.
2. Install `plugin-goals` into Milady, link it locally, and smoke-test runtime loading.
3. Add a `plugin-goals` workbench adapter similar to current `plugin-todo` integration.
4. Add a dedicated admin-only `Agent Ops` panel.
5. Keep LifeOps reminders only for owner life support.
6. Leave `plugin-todo` reminder behavior restricted to agent ops.

### 4.4 Strengths

- Fastest way to deliver the PRD without rewriting plugin internals first.
- Very low risk of duplicate reminders because user and agent domains are separated at the source.
- Keeps agent self-management close to current elizaOS plugin semantics.
- Clear immediate answer to "plugin-todo is really agent todos".

### 4.5 Weaknesses

- Two different truth systems for conceptually similar objects.
- User goals and agent goals follow different technical paths.
- Harder to build one unified policy model for privacy, context injection, and auditability.
- Over time, the UI and APIs will accumulate translation glue.

### 4.6 Best use case

- Best short-term delivery path.
- Best if we want the lowest-risk path to a usable PRD implementation quickly.

## 5. Option B: Unified principal-aware LifeOps with plugin adapters

LifeOps becomes the canonical source of truth for both user life support and agent ops. `plugin-todo` and `plugin-goals` remain loaded, but they operate as adapters, mirrors, or compatibility providers instead of primary storage.

### 5.1 Model

- All goals, todos, habits, routines, occurrences, reminders, workflows, and agent ops live in LifeOps.
- Agent items are represented explicitly with:
  - `domain = agent_ops`
  - `subject_type = agent`
  - `subject_id = runtime.agentId`
- Human items are represented explicitly with:
  - `domain = user_lifeops`
  - `subject_type = owner`
  - `subject_id = ownerEntityId`
- `plugin-todo` and `plugin-goals` receive mirrored subsets for compatibility, provider context, and regression safety.

### 5.2 How it works

- Conversational capture always writes into LifeOps first.
- The LifeOps bridge layer decides whether to project an item into:
  - `plugin-todo`
  - `plugin-goals`
  - both
  - neither
- Workbench UI renders LifeOps directly.
- Plugins remain available for:
  - agent reasoning context
  - legacy consumers
  - targeted admin tooling
  - compatibility tests

### 5.3 Required implementation work

1. Extend LifeOps schema with the principal model described above.
2. Add `plugin-goals` as a dependency and runtime import.
3. Build two bridge modules:
   - `LifeOpsTodoBridge`
   - `LifeOpsGoalBridge`
4. Patch `plugin-todo` to recognize mirrored records, for example through metadata such as:
   - `managedBy: "lifeops"`
   - `lifeopsId`
   - `disablePluginReminder: true`
5. Prevent `plugin-todo` reminder delivery for LifeOps-owned mirrored items.
6. Add optional ingest paths so plugin-created agent records can be adopted into LifeOps.
7. Build role-gated providers so owner items and agent ops are never leaked into unrelated or non-admin contexts.

### 5.4 Strengths

- Single source of truth for both the owner and the agent.
- Cleanest long-term privacy and policy model.
- Best fit for the PRD because definition, occurrence, reminder ladder, workflow, and audit semantics all stay in one place.
- Makes "user goals" and "agent goals" the same kind of object with different ownership, instead of two unrelated systems.
- Lets us keep plugin compatibility without letting plugins dictate the product model.

### 5.5 Weaknesses

- Highest initial implementation cost.
- Requires patching `plugin-todo`, not just integrating it.
- Needs a careful migration and sync policy to avoid loops or duplicates.
- Requires a sharper definition of what gets mirrored and why.

### 5.6 Best use case

- Best strategic architecture.
- Best if we want the cleanest answer to ownership, privacy, reminders, and future feature growth.

## 6. Option C: Plugin-led federation with LifeOps overlay

`plugin-todo` stays canonical for todos, `plugin-goals` stays canonical for goals, and LifeOps becomes an overlay for occurrences, reminders, workflows, connectors, and audit.

### 6.1 Model

- Todo state originates in `plugin-todo`.
- Goal state originates in `plugin-goals`.
- LifeOps stores:
  - derived occurrences
  - reminder plans
  - workflow schedules
  - channel policies
  - connector grants
  - audit history

### 6.2 How it works

- User or agent creates a todo in `plugin-todo`.
- User or agent creates a goal in `plugin-goals`.
- LifeOps links to those rows and derives occurrences, reminders, and workflows around them.
- UI composes plugin and LifeOps data live.

### 6.3 Required implementation work

1. Install and load `plugin-goals`.
2. Add subject, visibility, and privacy fields to both plugins.
3. Add lifeops link tables that point at plugin todo and goal IDs.
4. Build adoption and backfill jobs.
5. Patch both plugin providers so they obey the same privacy rules as LifeOps.
6. Decide which reminder engine wins for every case.

### 6.4 Strengths

- Reuses plugin semantics most directly.
- Minimizes immediate rewrites inside plugin APIs.
- Could be attractive if plugin upstream compatibility is the top priority.

### 6.5 Weaknesses

- Worst PRD fit.
- Three truth surfaces:
  - todo truth
  - goal truth
  - lifeops execution truth
- Highest risk of privacy drift and context leakage.
- Hardest duplicate-reminder problem.
- Hardest long-term maintenance burden.

### 6.6 Best use case

- Only reasonable if upstream plugin compatibility matters more than product coherence.
- Not recommended for Milady.

## 7. What makes the three options different

| Dimension | Option A: Dual-plane | Option B: Unified LifeOps | Option C: Plugin-led federation |
| --- | --- | --- | --- |
| Canonical owner system | LifeOps | LifeOps | Plugin-todo / plugin-goals |
| Canonical agent system | Plugins | LifeOps | Plugins |
| Number of truth systems | 2 | 1 | 3 |
| Duplicate reminder risk | Low | Medium during migration, low after bridge rules | High |
| Privacy model complexity | Medium | Low once built | High |
| Plugin patching required | Low to medium | Medium to high | High |
| Long-term maintainability | Medium | High | Low |
| Time to first usable milestone | Fast | Medium | Medium |
| Best PRD fit | Good | Best | Weak |

## 8. Recommendation

Option B is the best architecture.

Reason:

- The PRD is fundamentally about one coherent behavior-support system.
- Owner and agent items need the same policy vocabulary:
  - ownership
  - visibility
  - context eligibility
  - reminders
  - audits
  - workflows
- LifeOps already has the right primitives.
- `plugin-todo` and `plugin-goals` do not.
- Keeping plugins active as adapters gives us compatibility without surrendering the source-of-truth decision.

The important nuance is rollout.

We should implement Option B in a staged way that borrows Option A's low-risk sequencing:

1. Install and smoke-test `plugin-goals`.
2. Add principal-aware LifeOps ownership.
3. Keep owner life support fully in LifeOps immediately.
4. Mirror only agent-scope items into `plugin-todo` and `plugin-goals` first.
5. Suppress plugin reminder delivery for mirrored LifeOps records.
6. Move UI and workbench to LifeOps-native rendering.
7. Expand adapter coverage only where compatibility is actually useful.

That gives us the clean destination of Option B without paying every migration cost on day one.

## 9. Critical design decisions and recommended answers

### 9.1 Where does truth live?

Recommended answer:

- LifeOps is canonical for all user and agent planning/support objects.

### 9.2 How do we represent user vs agent items?

Recommended answer:

- In v1, use owner/agent-aware LifeOps records with `domain`, `subject_type`, `subject_id`, `visibility_scope`, and `context_policy`.
- Keep the field names future-safe so later per-user expansion does not require another storage rewrite.

### 9.3 Who can access LifeOps in v1?

Recommended answer:

- Only `OWNER` / `ADMIN` should get LifeOps actions and providers in v1.
- Regular users should not receive LifeOps provider context or mutation capability yet.
- The owner-facing view still separates personal life support from agent ops.

### 9.4 What is `plugin-todo` for after the rewrite?

Recommended answer:

- Agent compatibility, legacy provider context, and selected admin tooling.
- Not the source of truth for user life support.

### 9.5 What is `plugin-goals` for after the rewrite?

Recommended answer:

- Goal compatibility provider and agent-goal bridge surface.
- Not the source of truth for goal support workflows, reviews, or reminders.

### 9.6 Who owns reminders?

Recommended answer:

- LifeOps owns reminders for any LifeOps-owned object.
- `plugin-todo` reminders must ignore mirrored LifeOps records.

### 9.7 How do we avoid privacy leaks in conversation context?

Recommended answer:

- Default `context_policy = explicit_only` for owner life support.
- Default `context_policy = never` for agent ops outside admin contexts.
- Providers must filter by subject and role before returning data.

### 9.8 How do goals produce tasks?

Recommended answer:

- Goals do not automatically become flat todos.
- Goals may generate suggested occurrences or support actions.
- Auto-creation is opt-in, or limited to agent ops and admin-approved workflows.

### 9.9 Which scheduler should execute reminders and workflows?

Recommended answer:

- Use LifeOps as truth and map due jobs into a durable runtime scheduler using `TaskService` / trigger runtime.
- Rebuild jobs from LifeOps state on startup.

### 9.10 How should we ship `plugin-goals`?

Recommended answer:

- Clone from `https://github.com/elizaOS-plugins/plugin-goals`.
- Patch locally for Milady compatibility.
- link locally during development
- publish a Milady-compatible package version once stable

## 10. Recommended implementation plan

This is the recommended staged plan for Option B.

### Phase 0: plugin alignment

1. Clone `plugin-goals` and `plugin-todo` locally from `elizaOS-plugins`.
2. Add `@elizaos/plugin-goals` to `package.json`.
3. Add static import and runtime mapping in `packages/agent/src/runtime/eliza.ts`.
4. Decide whether `plugin-goals` is core-loaded or optional-loaded for Milady.
5. Add dedicated smoke tests proving `plugin-todo` and `plugin-goals` both load in this workspace.
6. Add a smoke test proving LifeOps providers/actions reject non-admin callers.

### Phase 1: principal-aware LifeOps

1. Add ownership and visibility fields to LifeOps tables.
2. Add repository filters and service-level authorization.
3. Add `agent_ops` and `user_lifeops` sections to LifeOps overview APIs.
4. Add role-aware access checks using the existing roles plugin.

### Phase 2: plugin bridges

1. Add `LifeOpsTodoBridge`.
2. Add `LifeOpsGoalBridge`.
3. Mirror agent-scope LifeOps items into plugin rows with stable references.
4. Add metadata flags for mirrored rows.
5. Patch plugin reminder behavior so mirrored rows do not send duplicate reminders.

### Phase 3: background execution

1. Add a restart-safe LifeOps runner.
2. Map reminder steps and workflows into durable scheduled execution.
3. Rebuild due jobs from LifeOps state on startup.
4. Record every dispatch and every suppression reason in audit history.

### Phase 4: UI and conversational capture

1. Replace the generic todo widget with a LifeOps-native sidebar:
   - `Now`
   - `Next`
   - `Upcoming`
   - `Goals`
   - `Agent Ops` for admins only
2. Add conversational actions/providers for create/edit/complete/snooze/review flows.
3. Add explanation affordances:
   - why am I seeing this
   - why was I reminded
   - why was this escalated

### Phase 5: connector rollout

1. Keep `in_app` first.
2. Keep SMS and voice behind explicit consent.
3. Add private connector delivery gradually.
4. Keep every channel policy separate from the object itself.

## 11. E2E test strategy

The full user-journey matrix remains in `2026-04-04-milaidy-life-ops-implementation-plan.md`. The additional option-specific E2E coverage we need is:

### 11.1 Plugin coexistence

1. `plugin-todo` loads and stays healthy with LifeOps enabled.
2. `plugin-goals` loads and stays healthy with LifeOps enabled.
3. Agent-scope LifeOps mirrors appear in plugin providers.
4. User-scope LifeOps items do not leak into the wrong plugin provider outputs.

### 11.2 No duplicate reminder delivery

1. A mirrored LifeOps item appears in `plugin-todo`.
2. LifeOps sends the reminder.
3. `plugin-todo` does not also send the reminder.
4. Audit output shows why the plugin path was suppressed.

### 11.3 Principal privacy

1. User A cannot see User B's LifeOps items.
2. User A cannot see agent ops.
3. Admin can see agent ops.
4. The agent can reason about agent ops without surfacing them in user chat.

### 11.4 Goal/todo distinction

1. A user goal stays a goal until a support action is approved or generated.
2. An agent goal can create agent ops without leaking into user surfaces.
3. Goal reviews update goal status without rewriting goal identity.

### 11.5 Restart safety

1. LifeOps runner rebuilds due jobs after restart.
2. Mirrored plugin rows do not fork or duplicate after rebuild.
3. Due reminders still fire exactly once per step.

## 12. Final call

If the priority is the cleanest long-term product, choose Option B.

If the priority is the fastest safe milestone before the full rewrite lands, sequence Option B like Option A:

- user plane in LifeOps immediately
- agent mirrors first
- plugin-goals installed early
- plugin-todo reminder suppression before broader mirroring

That gets us one coherent architecture without pretending the current plugins already satisfy the PRD.
