/**
 * TaoBot composite arcade actions.
 *
 * Wraps ARCADE555_* actions into TaoBot-specific workflows:
 * curated game sessions, philosophical battle challenges,
 * and philanthropy-routed reward distribution.
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback } from "../types/index.js";
import { loadConfig } from "../config.js";

/**
 * TAOBOT_ARCADE_SESSION — Launch a curated arcade session.
 *
 * Picks from TaoBot's preferred games, bootstraps a session,
 * and enters play mode with TaoBot's AI policy defaults.
 */
const arcadeSession: Action = {
  name: "TAOBOT_ARCADE_SESSION",
  similes: ["PLAY_ARCADE", "START_GAMING", "TAOBOT_PLAY", "ARCADE_START"],
  description:
    "Launch a TaoBot arcade session on one of the preferred games. " +
    "Bootstraps session, selects game, and begins play with TaoBot's " +
    "tuned AI policy (balanced risk, high awareness, flow state).",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const config = loadConfig();
    return config.agentApiKey.length > 0;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const config = loadConfig();
    const arcadeService = runtime.getService("arcade555");
    if (!arcadeService) {
      callback({
        text: "The arcade service isn't loaded. Install @rndrntwrk/plugin-555arcade first — the games await, but the bridge needs both ends.",
        action: "TAOBOT_ARCADE_SESSION",
      });
      return;
    }

    const requestedGame = options.game as string | undefined;
    const gameId = requestedGame || config.preferredGames[0] || "godai-is-back";

    try {
      // Bootstrap session
      await (arcadeService as any).sessionBootstrap(config.sessionId);

      // Launch game
      await (arcadeService as any).gamesPlay(gameId);

      callback({
        text:
          `Arcade session live. Playing ${gameId}. ` +
          `Wu wei applies to gaming too — don't force the score, let the pattern emerge. ` +
          `${config.philanthropyPercent}% of any winnings flow to the DAO treasury for charitable allocation.`,
        action: "TAOBOT_ARCADE_SESSION",
      });
    } catch (err: any) {
      callback({
        text: `Arcade launch failed: ${err.message}. The game waits — check credentials.`,
        action: "TAOBOT_ARCADE_SESSION",
      });
    }
  },
  examples: [
    [
      { user: "{{user1}}", content: { text: "Let's play some arcade games" } },
      {
        user: "TaoBot",
        content: {
          text: "Launching an arcade session. The Pranksters always knew that play was the highest form of research. Let's see what emerges.",
          action: "TAOBOT_ARCADE_SESSION",
        },
      },
    ],
  ],
};

/**
 * TAOBOT_CHALLENGE — Issue a philosophical battle challenge.
 *
 * Creates a battle with a wager, but frames it through TaoBot's
 * lens of playful competition and philanthropic purpose.
 */
const challenge: Action = {
  name: "TAOBOT_CHALLENGE",
  similes: ["BATTLE", "CHALLENGE_PLAYER", "TAOBOT_BATTLE", "ISSUE_CHALLENGE"],
  description:
    "Issue a TaoBot battle challenge on the 555 Arcade. " +
    "Creates a wager-backed battle with a portion of winnings " +
    "pre-committed to the TaoDAO philanthropic treasury.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return !!runtime.getService("arcade555");
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const config = loadConfig();
    const arcadeService = runtime.getService("arcade555");
    if (!arcadeService) {
      callback({ text: "Arcade service not available.", action: "TAOBOT_CHALLENGE" });
      return;
    }

    const gameId = (options.game as string) || config.preferredGames[0];
    const wager = (options.wager as number) || 100;

    try {
      const battle = await (arcadeService as any).battlesCreate({
        gameId,
        wagerAmount: wager,
      });

      const philanthropyAmount = Math.round(wager * (config.philanthropyPercent / 100));

      callback({
        text:
          `Challenge issued. Game: ${gameId}. Wager: ${wager} $555. ` +
          `${philanthropyAmount} $555 (${config.philanthropyPercent}%) of winnings will flow to charity through the DAO. ` +
          `Fuller said 'you never change things by fighting the existing reality — build a new model that makes the old one obsolete.' ` +
          `This battle builds the new model.`,
        action: "TAOBOT_CHALLENGE",
      });
    } catch (err: any) {
      callback({
        text: `Challenge failed: ${err.message}`,
        action: "TAOBOT_CHALLENGE",
      });
    }
  },
  examples: [
    [
      { user: "{{user1}}", content: { text: "Challenge someone to a game" } },
      {
        user: "TaoBot",
        content: {
          text: "Setting up a battle. The Pranksters competed with joy, not malice. Let's bring that energy. 30% of winnings go to the greater good.",
          action: "TAOBOT_CHALLENGE",
        },
      },
    ],
  ],
};

/**
 * TAOBOT_LEADERBOARD — Check standings with philosophical commentary.
 */
const leaderboard: Action = {
  name: "TAOBOT_LEADERBOARD",
  similes: ["CHECK_SCORES", "STANDINGS", "RANKINGS", "TAOBOT_SCORES"],
  description:
    "Check TaoBot's leaderboard standings across preferred games, " +
    "with philosophical context on the nature of competition.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return !!runtime.getService("arcade555");
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const arcadeService = runtime.getService("arcade555");
    if (!arcadeService) {
      callback({ text: "Arcade service not available.", action: "TAOBOT_LEADERBOARD" });
      return;
    }

    try {
      const standings = await (arcadeService as any).leaderboardRead();

      callback({
        text:
          `Leaderboard retrieved. ${JSON.stringify(standings, null, 2)}\n\n` +
          `The Tao Te Ching says: 'The best runner leaves no track.' ` +
          `But on a blockchain, everything leaves a track — and that's the point. ` +
          `Verified attention, verified skill, verified impact.`,
        action: "TAOBOT_LEADERBOARD",
      });
    } catch (err: any) {
      callback({
        text: `Leaderboard read failed: ${err.message}`,
        action: "TAOBOT_LEADERBOARD",
      });
    }
  },
  examples: [
    [
      { user: "{{user1}}", content: { text: "How are we doing on the leaderboard?" } },
      {
        user: "TaoBot",
        content: {
          text: "Pulling the standings. Remember — 10,000 points equals 1 USDC. Verified attention has real value. Let's see where the flow has carried us.",
          action: "TAOBOT_LEADERBOARD",
        },
      },
    ],
  ],
};

/**
 * TAOBOT_QUEST_CHECK — Review active quests and progress.
 */
const questCheck: Action = {
  name: "TAOBOT_QUEST_CHECK",
  similes: ["CHECK_QUESTS", "QUEST_STATUS", "TAOBOT_QUESTS"],
  description:
    "Review TaoBot's active quests and progress toward completion. " +
    "Quests are the purposeful layer — they connect play to impact.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return !!runtime.getService("arcade555");
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: Record<string, unknown>,
    callback: HandlerCallback
  ): Promise<void> => {
    const arcadeService = runtime.getService("arcade555");
    if (!arcadeService) {
      callback({ text: "Arcade service not available.", action: "TAOBOT_QUEST_CHECK" });
      return;
    }

    const status = (options.status as string) || "active";

    try {
      const quests = await (arcadeService as any).questsRead({ status });

      callback({
        text:
          `Active quests: ${JSON.stringify(quests, null, 2)}\n\n` +
          `A quest without purpose is just grinding. Every quest TaoBot takes ` +
          `feeds the philanthropic engine. The Pranksters called it 'the trip.' ` +
          `Fuller called it 'the experiment.' We call it the quest.`,
        action: "TAOBOT_QUEST_CHECK",
      });
    } catch (err: any) {
      callback({
        text: `Quest check failed: ${err.message}`,
        action: "TAOBOT_QUEST_CHECK",
      });
    }
  },
  examples: [
    [
      { user: "{{user1}}", content: { text: "What quests do we have going?" } },
      {
        user: "TaoBot",
        content: {
          text: "Checking the quest board. Each one is a small experiment in doing more with less.",
          action: "TAOBOT_QUEST_CHECK",
        },
      },
    ],
  ],
};

export const taobotArcadeActions: Action[] = [arcadeSession, challenge, leaderboard, questCheck];
