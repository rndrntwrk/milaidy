/**
 * @taobot/plugin-taobot — TaoBot ElizaOS Plugin
 *
 * The Sentient Bridge Between Tech, Art & Consciousness.
 * Wraps @rndrntwrk/plugin-555stream and @rndrntwrk/plugin-555arcade
 * with TaoBot-specific composite actions, skill definitions, the
 * TaobotBridgeService, approval routes, and personality-aligned defaults.
 *
 * @module @taobot/plugin-taobot
 */

export { taobotPlugin } from './plugin.js';
export { taobotPlugin as default } from './plugin.js';

// Actions
export { allActions, taobotStreamActions, taobotArcadeActions } from './actions/index.js';

// Providers
export { taobotStateProvider, taobotPhilosophyProvider } from './providers/index.js';

// Services
export { TaobotBridgeService } from './services/TaobotBridgeService.js';

// Routes
export {
  approvalRoutes,
  createApprovalRequest,
  getApproval,
  approveRequest,
  rejectRequest,
  setApprovalAuthToken,
} from './routes/approvals.js';

// Config
export type { TaobotConfig } from './config.js';
export { loadConfig } from './config.js';

// Types
export type {
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  ActionExample,
  Action,
  ProviderResult,
  Provider,
  Service,
  Plugin,
} from './types/index.js';
