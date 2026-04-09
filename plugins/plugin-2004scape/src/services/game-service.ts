import { Service, type IAgentRuntime, type Memory, type UUID } from "@elizaos/core";
import { BotManager } from "./bot-manager.js";
import { BotActions } from "../sdk/actions.js";
import type { BotState, ActionResult, EventLogEntry } from "../sdk/types.js";
import { startGateway, type GatewayHandle } from "../gateway/index.js";
import { setCurrentLlmResponse } from "../shared-state.js";

const DEFAULT_GATEWAY_PORT = 18791;
const DEFAULT_LOOP_INTERVAL_MS = 15_000;
const MAX_EVENT_LOG = 30;

export class RsSdkGameService extends Service {
  static serviceType = "rs_2004scape";
  capabilityDescription =
    "Autonomous 2004scape game service — connects to the game via WebSocket SDK, runs an LLM-driven game loop.";

  private botManager: BotManager | null = null;
  private botActions: BotActions | null = null;
  private gateway: GatewayHandle | null = null;
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private loopRunning = false;
  private stepNumber = 0;
  private eventLog: EventLogEntry[] = [];
  private stopped = false;

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new RsSdkGameService(runtime);
    await service.initialize();
    return service;
  }

  async initialize(): Promise<void> {
    const gatewayPort = this.resolveInt("RS_2004SCAPE_GATEWAY_PORT", DEFAULT_GATEWAY_PORT);
    const loopInterval = this.resolveInt("RS_2004SCAPE_LOOP_INTERVAL_MS", DEFAULT_LOOP_INTERVAL_MS);
    const username = this.resolveSetting("RS_SDK_BOT_NAME") ?? this.resolveSetting("BOT_NAME") ?? "";
    const password = this.resolveSetting("RS_SDK_BOT_PASSWORD") ?? this.resolveSetting("BOT_PASSWORD") ?? "";
    const gatewayUrl = this.resolveSetting("RS_SDK_GATEWAY_URL") ?? `ws://localhost:${gatewayPort}`;

    if (!username) {
      this.log("No RS_SDK_BOT_NAME configured — game service will not auto-connect.");
      return;
    }

    // Start embedded gateway
    try {
      this.gateway = startGateway({
        port: gatewayPort,
        onLog: (msg) => this.log(msg),
      });
      this.log(`Gateway started on port ${this.gateway.port}`);
    } catch (err) {
      this.log(`Gateway failed to start: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Connect SDK to gateway
    this.botManager = new BotManager(gatewayUrl, username, password);
    try {
      this.botManager.connect();
      this.log(`SDK connecting as ${username}`);
    } catch (err) {
      this.log(`SDK connect failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (this.botManager.getSDK()) {
      this.botActions = new BotActions(this.botManager.getSDK()!);
    }

    // Start autonomous game loop
    this.loopTimer = setInterval(() => {
      void this.autonomousStep();
    }, loopInterval);
    this.log(`Game loop started (${loopInterval}ms interval)`);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    await this.botManager?.disconnect();
    this.gateway?.stop();
    this.log("Game service stopped.");
  }

  /* ------------------------------------------------------------------ */
  /*  Public API (called by providers, actions, route module)            */
  /* ------------------------------------------------------------------ */

  getBotState(): BotState | null {
    return this.botManager?.getBotState() ?? null;
  }

  getEventLog(): EventLogEntry[] {
    return this.eventLog;
  }

  getBotActions(): BotActions | null {
    return this.botActions;
  }

  getGatewayPort(): number | null {
    return this.gateway?.port ?? null;
  }

  isConnected(): boolean {
    return this.botManager?.isConnected() ?? false;
  }

  /**
   * Execute a game action by name. Called by elizaOS action handlers.
   */
  async executeAction(
    actionType: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult> {
    if (!this.botActions) {
      return { success: false, action: actionType, message: "Bot actions not initialized." };
    }

    try {
      const result = await this.dispatchAction(actionType, params);
      this.pushEventLog(actionType, result);
      return result;
    } catch (err) {
      const result: ActionResult = {
        success: false,
        action: actionType,
        message: err instanceof Error ? err.message : String(err),
      };
      this.pushEventLog(actionType, result);
      return result;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Autonomous game loop                                               */
  /* ------------------------------------------------------------------ */

  private async autonomousStep(): Promise<void> {
    if (this.loopRunning || this.stopped) return;
    this.loopRunning = true;

    try {
      const state = this.botManager?.getBotState();
      if (!state?.connected || !state.inGame || !state.player) {
        return;
      }

      this.stepNumber++;
      this.log(`Autonomous step ${this.stepNumber}`);

      // Build a prompt for the LLM
      const stepPrompt = this.buildStepPrompt(state);

      // Create a memory for the autonomous step
      const memory: Memory = {
        id: crypto.randomUUID() as UUID,
        agentId: this.runtime.agentId,
        userId: this.runtime.agentId,
        roomId: this.runtime.agentId,
        content: {
          text: stepPrompt,
          source: "rs_2004scape_game_loop",
        },
      };

      // Capture the LLM response for action parameter parsing
      const originalProcessActions = this.runtime.processActions?.bind(this.runtime);
      if (originalProcessActions && this.runtime.processActions) {
        this.runtime.processActions = async (
          message: Memory,
          responses: Memory[],
          state: unknown,
          callback?: unknown,
        ) => {
          // Capture response text before actions process
          for (const response of responses) {
            if (response.content?.text) {
              setCurrentLlmResponse(response.content.text);
            }
          }
          return originalProcessActions(message, responses, state, callback);
        };
      }

      try {
        // Send through the full elizaOS pipeline
        await this.runtime.messageService?.handleMessage(memory, (response) => {
          if (response.content?.text) {
            this.log(`LLM response: ${response.content.text.slice(0, 200)}...`);
          }
        });
      } finally {
        // Restore original processActions
        if (originalProcessActions) {
          this.runtime.processActions = originalProcessActions;
        }
      }
    } catch (err) {
      this.log(`Step error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.loopRunning = false;
    }
  }

  private buildStepPrompt(state: BotState): string {
    const p = state.player!;
    const recentActions = this.eventLog
      .slice(-5)
      .map((e) => `  ${e.action}: ${e.result.message}`)
      .join("\n");

    return `Autonomous game step ${this.stepNumber}. You are playing 2004scape (RuneScape).

Review ALL providers for your current game state, goals, and world knowledge. Then choose ONE action to take.

Quick status: ${p.name} at (${p.worldX}, ${p.worldZ}), HP ${p.hp}/${p.maxHp}, inventory ${state.inventory.length}/28
${state.alerts.length > 0 ? `Alerts: ${state.alerts.map((a) => a.message).join("; ")}` : "No alerts."}

Recent actions:
${recentActions || "  (none yet)"}

Choose the best action based on your goals and current situation. Provide parameters in XML format.`;
  }

  /* ------------------------------------------------------------------ */
  /*  Action dispatch                                                    */
  /* ------------------------------------------------------------------ */

  private async dispatchAction(
    actionType: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult> {
    const actions = this.botActions!;
    const str = (key: string): string => String(params[key] ?? "").trim();
    const num = (key: string, fallback: number): number => {
      const v = Number(params[key]);
      return Number.isFinite(v) ? v : fallback;
    };

    switch (actionType) {
      case "walkTo": {
        const dest = str("destination");
        if (dest) return actions.walkToNamed(dest);
        return actions.walkTo(num("x", 0), num("z", 0), str("reason") || undefined);
      }
      case "openDoor":
        return actions.openDoor();
      case "talkToNpc":
        return actions.talkToNpc(str("npcName"));
      case "navigateDialog":
        return actions.navigateDialog(num("option", 1));
      case "interactObject":
        return actions.interactObject(str("objectName"), str("option") || undefined);
      case "chopTree":
        return actions.chopTree(str("treeName") || undefined);
      case "mineRock":
        return actions.mineRock(str("rockName") || undefined);
      case "fish":
        return actions.fish(str("spotName") || undefined);
      case "attackNpc":
        return actions.attackNpc(str("npcName"));
      case "eatFood":
        return actions.eatFood();
      case "setCombatStyle":
        return actions.setCombatStyle(num("style", 0));
      case "castSpell":
        return actions.castSpell(
          num("spellId", 0),
          params.targetNid != null ? num("targetNid", 0) : undefined,
        );
      case "dropItem":
        return actions.dropItem(str("itemName"));
      case "useItem":
        return actions.useItem(str("itemName"));
      case "pickupItem":
        return actions.pickupItem(str("itemName"));
      case "equipItem":
        return actions.equipItem(str("itemName"));
      case "unequipItem":
        return actions.unequipItem(str("itemName"));
      case "useItemOnItem":
        return actions.useItemOnItem(str("itemName1"), str("itemName2"));
      case "openBank":
        return actions.openBank();
      case "closeBank":
        return actions.closeBank();
      case "depositItem":
        return actions.depositItem(str("itemName"), num("count", -1));
      case "withdrawItem":
        return actions.withdrawItem(str("itemName"), num("count", 1));
      case "openShop":
        return actions.openShop(str("npcName"));
      case "closeShop":
        return actions.closeShop();
      case "buyFromShop":
        return actions.buyFromShop(str("itemName"), num("count", 1));
      case "sellToShop":
        return actions.sellToShop(str("itemName"), num("count", 1));
      case "burnLogs":
        return actions.burnLogs();
      case "cookFood":
        return actions.cookFood(str("rawFoodName") || undefined);
      case "fletchLogs":
        return actions.fletchLogs();
      case "craftLeather":
        return actions.craftLeather();
      case "smithAtAnvil":
        return actions.smithAtAnvil(str("itemName") || undefined);
      case "pickpocketNpc":
        return actions.pickpocketNpc(str("npcName"));
      case "useItemOnObject":
        return actions.useItemOnObject(str("itemName"), str("objectName"));
      default:
        return { success: false, action: actionType, message: `Unknown action: ${actionType}` };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  private pushEventLog(action: string, result: ActionResult): void {
    this.eventLog.push({
      timestamp: Date.now(),
      action,
      result,
      stepNumber: this.stepNumber,
    });
    if (this.eventLog.length > MAX_EVENT_LOG) {
      this.eventLog = this.eventLog.slice(-MAX_EVENT_LOG);
    }
  }

  private resolveSetting(key: string): string | undefined {
    const fromRuntime = this.runtime.getSetting?.(key);
    if (typeof fromRuntime === "string" && fromRuntime.trim()) return fromRuntime.trim();
    const fromEnv = process.env[key];
    if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
    return undefined;
  }

  private resolveInt(key: string, fallback: number): number {
    const raw = this.resolveSetting(key);
    if (!raw) return fallback;
    const num = parseInt(raw, 10);
    return Number.isFinite(num) ? num : fallback;
  }

  private log(message: string): void {
    console.log(`[2004scape] ${message}`);
  }
}
