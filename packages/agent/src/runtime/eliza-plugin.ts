/**
 * Eliza plugin for elizaOS — workspace context, session keys, and agent
 * lifecycle actions (restart).
 *
 * Compaction is handled by core auto-compaction in the recent-messages provider.
 * Memory search/get actions are superseded by plugin-scratchpad.
 */

import type { IAgentRuntime, Plugin, ServiceClass } from "@elizaos/core";
import { AgentEventService } from "@elizaos/core";
import { emoteAction } from "../actions/emote";
import { lifeAction } from "../actions/life";
import { restartAction } from "../actions/restart";
import { sendAdminMessageAction } from "../actions/send-admin-message";
import { setUserNameAction } from "../actions/set-user-name";
import {
  addRegisteredSkillSlug,
  clearRegisteredSkillSlugs,
  skillCommandAction,
} from "../actions/skill-command";
import { terminalAction } from "../actions/terminal";
import {
  ensureProactiveAgentTask,
  registerProactiveTaskWorker,
} from "../activity-profile/proactive-worker";
import { lateJoinWhitelistEvaluator } from "../evaluators/late-join-whitelist";
import {
  ensureLifeOpsSchedulerTask,
  registerLifeOpsTaskWorker,
} from "../lifeops/runtime";
import { activityProfileProvider } from "../providers/activity-profile";
import { adminPanelProvider } from "../providers/admin-panel";
import { adminTrustProvider } from "../providers/admin-trust";
import { escalationTriggerProvider } from "../providers/escalation-trigger";
import { lifeOpsProvider } from "../providers/lifeops";
import { roleBackfillProvider } from "../providers/role-backfill";
import { createSessionKeyProvider } from "../providers/session-bridge";
import {
  getSessionProviders,
  resolveDefaultSessionStorePath,
} from "../providers/session-utils";
import { createChannelProfileProvider } from "../providers/simple-mode";
import { createDynamicSkillProvider } from "../providers/skill-provider";
import { uiCatalogProvider } from "../providers/ui-catalog";
import { createUserNameProvider } from "../providers/user-name";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../providers/workspace";
import { createWorkspaceProvider } from "../providers/workspace-provider";
import { createTriggerTaskAction } from "../triggers/action";
import { registerTriggerTaskWorker } from "../triggers/runtime";
import { AdvancedMemoryStorageService } from "./advanced-memory-storage";
import { setCustomActionsRuntime } from "./custom-actions";

export type ElizaPluginConfig = {
  workspaceDir?: string;
  initMaxChars?: number;
  sessionStorePath?: string;
  agentId?: string;
};

export function createElizaPlugin(config?: ElizaPluginConfig): Plugin {
  const workspaceDir = config?.workspaceDir ?? DEFAULT_AGENT_WORKSPACE_DIR;
  const agentId = config?.agentId ?? "main";
  const sessionStorePath =
    config?.sessionStorePath ?? resolveDefaultSessionStorePath(agentId);

  const baseProviders = [
    createChannelProfileProvider(),
    createWorkspaceProvider({
      workspaceDir,
      maxCharsPerFile: config?.initMaxChars,
    }),
    adminTrustProvider,
    adminPanelProvider,
    lifeOpsProvider,
    activityProfileProvider,

    createSessionKeyProvider({ defaultAgentId: agentId }),
    ...getSessionProviders({ storePath: sessionStorePath }),
    createDynamicSkillProvider(),
    createUserNameProvider(),
  ];

  // Emote IDs are now declared as an enum on the PLAY_EMOTE action parameter,
  // so they appear in the `# Available Actions` section automatically via
  // core's formatActions. No separate provider injection needed.
  //
  // Backwards-compat: character.settings.DISABLE_EMOTES still works — when set,
  // the PLAY_EMOTE action is excluded at init time so it never appears in the
  // prompt. Previously this was checked per-request in the emote provider.

  const plugin: Plugin = {
    name: "eliza",
    description: "Eliza workspace context, session keys, and lifecycle actions",

    services: [
      AdvancedMemoryStorageService as ServiceClass,
      AgentEventService as ServiceClass,
    ],

    init: async (_pluginConfig, runtime: IAgentRuntime) => {
      registerTriggerTaskWorker(runtime);
      registerLifeOpsTaskWorker(runtime);
      registerProactiveTaskWorker(runtime);
      setCustomActionsRuntime(runtime);
      void ensureLifeOpsSchedulerTask(runtime).catch((error) => {
        runtime.logger?.warn?.(
          `[lifeops] Failed to ensure scheduler task: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      void ensureProactiveAgentTask(runtime).catch((error) => {
        runtime.logger?.warn?.(
          `[proactive] Failed to ensure proactive task: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

      // Honour DISABLE_EMOTES: remove PLAY_EMOTE so it never appears in prompts.
      if (runtime.character?.settings?.DISABLE_EMOTES) {
        const idx = plugin.actions?.findIndex((a) => a.name === "PLAY_EMOTE");
        if (idx != null && idx >= 0) {
          plugin.actions?.splice(idx, 1);
        }
      }

      // ── Auto-register skills as slash commands ───────────────────────
      // Runs after plugin-agent-skills init so getLoadedSkills() is populated.
      // Uses a deferred check because skill loading is async and may complete
      // after this init() returns.
      const registerSkillsAsCommands = () => {
        try {
          const skillsService = runtime.getService(
            "AGENT_SKILLS_SERVICE",
          ) as unknown as
            | {
                getLoadedSkills: () => Array<{
                  slug: string;
                  name: string;
                  description: string;
                }>;
              }
            | undefined;
          if (!skillsService) return false;

          const skills = skillsService.getLoadedSkills();
          if (skills.length === 0) return false;

          // Dynamically import plugin-commands registry (may not be loaded)
          let registerCommand: (cmd: Record<string, unknown>) => void;
          let initForRuntime: (agentId: string) => void;
          try {
            const cmds = require("@elizaos/plugin-commands");
            registerCommand = cmds.registerCommand;
            initForRuntime = cmds.initForRuntime;
          } catch {
            return false; // plugin-commands not available
          }

          // Ensure the command store is scoped to this runtime
          initForRuntime(runtime.agentId);
          clearRegisteredSkillSlugs();

          let registered = 0;
          for (const skill of skills) {
            const slug = skill.slug.toLowerCase();
            try {
              registerCommand({
                key: `skill-${slug}`,
                description: skill.description.substring(0, 80),
                textAliases: [`/${slug}`],
                scope: "both",
                category: "skills",
                acceptsArgs: true,
                args: [
                  {
                    name: "input",
                    description: "Task or question for this skill",
                    captureRemaining: true,
                  },
                ],
              });
              addRegisteredSkillSlug(slug);
              registered++;
            } catch {
              // Command may already be registered (e.g. /stop conflicts)
            }
          }

          if (registered > 0) {
            const { logger } = require("@elizaos/core");
            logger.info(
              `[eliza] Registered ${registered} skills as slash commands`,
            );
          }
          return true;
        } catch {
          return false;
        }
      };

      // Try immediately, then retry after a delay for async skill loading
      if (!registerSkillsAsCommands()) {
        setTimeout(registerSkillsAsCommands, 5000);
      }
    },

    providers: [
      ...baseProviders,

      uiCatalogProvider,
      roleBackfillProvider,
      escalationTriggerProvider,
    ],

    evaluators: [lateJoinWhitelistEvaluator],

    actions: [
      restartAction,
      sendAdminMessageAction,
      terminalAction,
      createTriggerTaskAction,
      emoteAction,
      lifeAction,
      setUserNameAction,
      skillCommandAction,
    ],
  };

  return plugin;
}
