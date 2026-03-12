/**
 * STREAM555_BOOTSTRAP_SESSION Action
 *
 * Create or resume a 555stream session and establish WebSocket connection.
 */
export const bootstrapAction = {
    name: 'STREAM555_BOOTSTRAP_SESSION',
    description: 'Create or resume a 555stream session and establish WebSocket connection for real-time updates.',
    similes: [
        'CONNECT_555STREAM',
        'STREAM555_CONNECT',
        'START_STREAM_SESSION',
        'INIT_555STREAM',
        'SETUP_555STREAM',
    ],
    validate: async (runtime, _message, _state) => {
        const service = runtime.getService('stream555');
        if (!service) {
            return false;
        }
        // Check if already bootstrapped
        if (service.isReady()) {
            // Still allow - might want to reconnect or switch sessions
            return true;
        }
        return true;
    },
    handler: async (runtime, message, _state, options, callback) => {
        try {
            const service = runtime.getService('stream555');
            if (!service) {
                if (callback) {
                    callback({
                        text: '555stream service is not initialized. Check that STREAM555_BASE_URL and STREAM555_AGENT_TOKEN are set.',
                        content: {
                            success: false,
                            error: 'Service not initialized',
                        },
                    });
                }
                return false;
            }
            // Get session ID from options, message, or config
            let sessionId = options?.sessionId;
            // Try to extract session ID from message if not provided
            if (!sessionId && message.content?.text) {
                const text = message.content.text;
                // Look for UUID pattern or "session" followed by an ID
                const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                if (uuidMatch) {
                    sessionId = uuidMatch[0];
                }
            }
            // Fall back to default session from config
            if (!sessionId) {
                sessionId = service.getConfig()?.defaultSessionId;
            }
            // Check if already connected to this session
            if (service.isReady() && service.getBoundSessionId() === sessionId) {
                if (callback) {
                    callback({
                        text: `Already connected to session ${sessionId}`,
                        content: {
                            success: true,
                            data: {
                                sessionId,
                                alreadyConnected: true,
                            },
                        },
                    });
                }
                return true;
            }
            // Create or resume session
            const session = await service.createOrResumeSession(sessionId);
            let realtimeConnected = false;
            let realtimeError = null;
            try {
                await service.bindWebSocket(session.sessionId);
                realtimeConnected = true;
            }
            catch (error) {
                realtimeError = error.message;
                console.warn(`[555stream] WebSocket bind unavailable for session ${session.sessionId}; continuing with HTTP control only: ${realtimeError}`);
            }
            // Format response
            const response = formatBootstrapResponse(session.sessionId, session.resumed, session.active);
            if (callback) {
                callback({
                    text: response,
                    content: {
                        success: true,
                        data: {
                            sessionId: session.sessionId,
                            resumed: session.resumed,
                            active: session.active,
                            productionState: session.productionState,
                            realtimeConnected,
                            realtimeError,
                        },
                    },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to bootstrap 555stream session: ${errorMessage}`,
                    content: {
                        success: false,
                        error: errorMessage,
                    },
                });
            }
            return false;
        }
    },
    examples: [
        [
            {
                user: '{{user1}}',
                content: {
                    text: 'Connect to 555stream',
                },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'I\'ll connect to 555stream now.',
                    action: 'STREAM555_BOOTSTRAP_SESSION',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: {
                    text: 'Start a streaming session',
                },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Let me set up a 555stream session for you.',
                    action: 'STREAM555_BOOTSTRAP_SESSION',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: {
                    text: 'Resume session abc123-def456',
                },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'I\'ll reconnect to that session.',
                    action: 'STREAM555_BOOTSTRAP_SESSION',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: {
                    text: 'Initialize the stream control',
                },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Setting up 555stream control connection.',
                    action: 'STREAM555_BOOTSTRAP_SESSION',
                },
            },
        ],
    ],
};
function formatBootstrapResponse(sessionId, resumed, active) {
    const lines = [];
    if (resumed) {
        lines.push(`✅ **Resumed 555stream Session**`);
    }
    else {
        lines.push(`✅ **Created New 555stream Session**`);
    }
    lines.push('');
    lines.push(`**Session ID:** \`${sessionId}\``);
    lines.push(`**Stream Status:** ${active ? '🔴 LIVE' : '⚪ Inactive'}`);
    lines.push('');
    lines.push('WebSocket connected and receiving real-time updates.');
    lines.push('');
    lines.push('You can now:');
    lines.push('- Check stream state with STREAM555_STATE provider');
    lines.push('- View capabilities with STREAM555_CAPABILITIES provider');
    return lines.join('\n');
}
export default bootstrapAction;
//# sourceMappingURL=bootstrap.js.map