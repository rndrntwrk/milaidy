/**
 * @rndrntwrk/plugin-555stream
 *
 * elizaOS plugin for controlling 555stream live studio via Agent Control API.
 *
 * Features:
 * - HTTP + WebSocket client for 555stream Agent API
 * - Real-time session state caching
 * - STREAM555_STATE and STREAM555_CAPABILITIES providers
 * - Full action surface for stream control, ads, chat, templates, alerts, and app go-live
 * - Approval flow for dangerous operations
 */
import type { Plugin } from './types/index.js';
/**
 * 555stream Control Plugin
 *
 * Provides AI agents with complete control over 555stream live streaming studio.
 */
export declare const stream555Plugin: Plugin;
export default stream555Plugin;
export { StreamControlService } from './services/StreamControlService.js';
export { stateProvider, capabilitiesProvider } from './providers/index.js';
export * from './actions/index.js';
export { approvalRoutes, createApprovalRequest, getApproval, approveRequest, rejectRequest, setApprovalAuthToken } from './routes/approvals.js';
export { withApproval, formatApprovalPending, formatApprovalRejected, formatApprovalExpired } from './lib/approvalHelper.js';
export * from './types/index.js';
//# sourceMappingURL=index.d.ts.map