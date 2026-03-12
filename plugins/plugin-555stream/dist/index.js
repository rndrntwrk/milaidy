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
import { StreamControlService } from './services/StreamControlService.js';
import { stateProvider, capabilitiesProvider } from './providers/index.js';
import { allActions } from './actions/index.js';
import { approvalRoutes, setApprovalAuthToken } from './routes/approvals.js';
import { describeAgentAuthSource, isAgentAuthConfigured, resolveAgentBearer, } from './lib/agentAuth.js';
/**
 * 555stream Control Plugin
 *
 * Provides AI agents with complete control over 555stream live streaming studio.
 */
export const stream555Plugin = {
    name: '555stream',
    description: 'Control 555stream live studio via Agent Control API',
    /**
     * Plugin initialization
     * Validates configuration and tests connectivity
     */
    init: async (config, runtime) => {
        console.log('[555stream] Plugin initializing...');
        // Validate required environment variables
        const baseUrl = process.env.STREAM555_BASE_URL;
        const agentToken = baseUrl && baseUrl.trim().length > 0
            ? await resolveAgentBearer(baseUrl)
            : undefined;
        if (!baseUrl) {
            throw new Error('[555stream] STREAM555_BASE_URL is required.\n' +
                'Set this to your 555stream control-plane URL (e.g., https://control.555.tv).\n' +
                'See README.md for setup instructions.');
        }
        if (!isAgentAuthConfigured() || !agentToken) {
            throw new Error('[555stream] STREAM555 agent auth is required.\n' +
                'Set STREAM555_AGENT_API_KEY (recommended) or STREAM555_AGENT_TOKEN.\n' +
                'See README.md for setup instructions.');
        }
        // Validate URL format
        let parsedUrl;
        try {
            parsedUrl = new URL(baseUrl);
        }
        catch {
            throw new Error(`[555stream] STREAM555_BASE_URL is not a valid URL: ${baseUrl}\n` +
                'Expected format: https://control.555.tv');
        }
        // Validate protocol
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error(`[555stream] STREAM555_BASE_URL must use http or https protocol: ${baseUrl}`);
        }
        console.log(`[555stream] Configured for ${baseUrl}`);
        console.log(`[555stream] Auth source: ${describeAgentAuthSource()}`);
        console.log(`[555stream] Approvals required: ${process.env.STREAM555_REQUIRE_APPROVALS !== 'false'}`);
        // Set the auth token for approval routes
        setApprovalAuthToken(agentToken);
        if (process.env.STREAM555_DEFAULT_SESSION_ID) {
            console.log(`[555stream] Default session: ${process.env.STREAM555_DEFAULT_SESSION_ID}`);
        }
        // Test connectivity (non-blocking - just log warning if unreachable)
        try {
            const healthUrl = `${baseUrl.replace(/\/$/, '')}/api/agent/v1/health`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(healthUrl, {
                headers: { 'Authorization': `Bearer ${agentToken}` },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                console.log('[555stream] API connectivity verified');
            }
            else {
                console.warn(`[555stream] API health check returned ${response.status} - plugin may not function correctly`);
            }
        }
        catch (error) {
            const message = error.name === 'AbortError'
                ? 'Connection timeout'
                : error.message;
            console.warn(`[555stream] Cannot reach API at ${baseUrl}: ${message}`);
            console.warn('[555stream] Plugin will attempt to connect when actions are invoked');
        }
        console.log('[555stream] Plugin initialized');
    },
    /**
     * Services (long-lived connections, background tasks)
     */
    services: [StreamControlService],
    /**
     * Providers (read-only context for the model)
     */
    providers: [stateProvider, capabilitiesProvider],
    /**
     * Actions (tool surface for the model)
     * Covers stream control, app catalog, ads, chat, alerts, templates, state, graphics, sources, guests, media, platforms, and radio
     */
    actions: allActions,
    /**
     * HTTP routes (plugin routes, namespaced under /555stream/)
     */
    routes: approvalRoutes,
};
// Default export for elizaOS plugin loading
export default stream555Plugin;
// Named exports for explicit imports
export { StreamControlService } from './services/StreamControlService.js';
export { stateProvider, capabilitiesProvider } from './providers/index.js';
export * from './actions/index.js';
export { approvalRoutes, createApprovalRequest, getApproval, approveRequest, rejectRequest, setApprovalAuthToken } from './routes/approvals.js';
export { withApproval, formatApprovalPending, formatApprovalRejected, formatApprovalExpired } from './lib/approvalHelper.js';
export * from './types/index.js';
//# sourceMappingURL=index.js.map