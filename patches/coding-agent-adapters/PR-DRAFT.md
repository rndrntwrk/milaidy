# PR draft: drop `--tools <list>` from claude `autonomous` preset

**Repo:** https://github.com/HaruHunab1320/parallax  
**Path:** `packages/coding-agent-adapters/src/approval/claude.ts` (or wherever `generateClaudeApprovalConfig` lives — confirm in fork)  
**Pinned version we observed the bug on:** `0.16.3`

## Problem

`generateClaudeApprovalConfig('autonomous')` currently emits two CLI flags:

```ts
cliFlags.push("--dangerously-skip-permissions");
const allTools = Object.keys(CLAUDE_TOOL_CATEGORIES);
cliFlags.push("--tools", allTools.join(","));
```

The hardcoded list in `CLAUDE_TOOL_CATEGORIES` (`Read,Grep,Glob,LS,NotebookRead,Write,Edit,MultiEdit,NotebookEdit,Bash,BashOutput,KillShell,WebSearch,WebFetch,Task,Skill,TodoWrite,AskUserQuestion`) reflects Claude Code's **dev-tier** tool registry. On builds/accounts where the runtime exposes a *different* toolset (e.g. claude.ai consumer-tier OAuth, which ships `Monitor`, `ScheduleWakeup`, `ToolSearch`, `EnterPlanMode`/`ExitPlanMode`, `EnterWorktree`/`ExitWorktree`, `Cron*`, `TaskOutput`, `PushNotification`, `RemoteTrigger` instead of `Bash`/`Edit`/`Write`/`Task`/`Skill`), `--tools` does not just allow the listed names — it **filters away** anything not in the list, including the tier's actual shell-execution tools.

Result: an "autonomous" sub-agent on a non-dev tier gets only `Read,Grep,Glob,AskUserQuestion,TodoWrite` and refuses any task that needs to write, search the web, or run shell — even though `--dangerously-skip-permissions` is set and the orchestrator wired full permissions in `.claude/settings.json`. Downstream orchestrators (e.g. `@elizaos/plugin-agent-orchestrator`) can't tell the difference between this and a model hallucination, so their watchdogs burn turns "correcting" an agent that's accurately reporting its actual toolset.

## Proposed fix

Drop the `--tools` push from the `autonomous` branch. With `--dangerously-skip-permissions` already set, `--tools` was redundant for the autonomous case — the preset's intent is "all tools auto-approved", which is exactly what skipping permissions gives you. Removing the explicit list makes the preset tier-agnostic: each Claude Code build exposes whatever tools it ships, and the orchestrator's `.claude/settings.json` `permissions.allow` list still documents intent for any consumer that reads it.

```diff
   if (preset === "autonomous") {
     cliFlags.push("--dangerously-skip-permissions");
     if (!_autonomousSandboxWarningLogged) {
       console.warn(
         "Autonomous preset uses --dangerously-skip-permissions. Ensure agents run in a sandboxed environment.",
       );
       _autonomousSandboxWarningLogged = true;
     }
-    const allTools = Object.keys(CLAUDE_TOOL_CATEGORIES);
-    cliFlags.push("--tools", allTools.join(","));
   }
```

## Alternative considered

Adding an `applyToolsFilter?: boolean` option to `generateClaudeApprovalConfig` so consumers can opt out. Rejected because the filter has no value when `--dangerously-skip-permissions` is already set: the autonomous preset's stated purpose is "everything auto-approved", and limiting tools is the opposite of that. The filter is the bug, not the lack of an opt-out.

## Test impact

Tests that pin the autonomous preset's `cliFlags` to `["--dangerously-skip-permissions", "--tools", "Read,..."]` need updating to `["--dangerously-skip-permissions"]`. The settings.json output (`permissions.allow` listing) is unchanged.

## Rollout for downstream consumers

`@elizaos/plugin-agent-orchestrator` (and Milady) currently carry a postinstall bridge patch that does this same edit in node_modules. Once a `coding-agent-adapters` release contains this fix, the bridge patch is deleted. No code changes in downstream beyond bumping the dep version.
