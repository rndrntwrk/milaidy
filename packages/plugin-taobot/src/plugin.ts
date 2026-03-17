/**
 * TaoBot unified plugin — registers stream + arcade actions,
 * TaoBot-specific providers, the bridge service, and approval routes.
 */
import type { Plugin, IAgentRuntime } from './types/index.js';
import { allActions } from './actions/index.js';
import { taobotStateProvider, taobotPhilosophyProvider } from './providers/index.js';
import { TaobotBridgeService } from './services/TaobotBridgeService.js';
import { approvalRoutes, setApprovalAuthToken } from './routes/approvals.js';
import { loadConfig } from './config.js';

export const taobotPlugin: Plugin = {
  name: '@taobot/plugin-taobot',
  description:
    'TaoBot — The Sentient Bridge Between Tech, Art & Consciousness. ' +
    'Streaming generative art, arcade competition, and philanthropic impact ' +
    'on the RNDRNTWRK 555 network.',

  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    console.log('[taobot] Plugin initializing...');
    const taobotConfig = loadConfig();

    if (!taobotConfig.agentApiKey) {
      console.warn(
        '[taobot] No API key configured. Set TAOBOT_API_KEY or STREAM555_AGENT_API_KEY.'
      );
      console.warn('[taobot] Plugin will load but actions requiring authentication will fail.');
    }

    console.log(`[taobot] Stream URL: ${taobotConfig.streamBaseUrl}`);
    console.log(`[taobot] Arcade URL: ${taobotConfig.arcadeBaseUrl}`);
    console.log(`[taobot] Philanthropy: ${taobotConfig.philanthropyPercent}%`);
    console.log(`[taobot] Approvals: ${taobotConfig.requireApprovals}`);
    console.log('[taobot] Plugin initialized — The Sentient Bridge is active');
  },

  services: [new TaobotBridgeService() as any],
  providers: [taobotStateProvider, taobotPhilosophyProvider],
  actions: allActions,
  routes: approvalRoutes,
};
