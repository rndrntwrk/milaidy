/**
 * STREAM555_CHAT_STOP Action
 *
 * Stop chat ingestion for the session.
 * Does not require approval.
 */
export const chatStopAction = {
    name: 'STREAM555_CHAT_STOP',
    description: 'Stop chat ingestion for the session. Disconnects from all connected chat platforms.',
    similes: [
        'STOP_CHAT',
        'DISCONNECT_CHAT',
        'DISABLE_CHAT',
        'LEAVE_CHAT',
        'CLOSE_CHAT',
    ],
    validate: async (runtime, _message, _state) => {
        const service = runtime.getService('stream555');
        return !!(service?.isReady());
    },
    handler: async (runtime, message, _state, options, callback) => {
        try {
            const service = runtime.getService('stream555');
            if (!service) {
                if (callback) {
                    callback({
                        text: '555stream service is not initialized.',
                        content: { success: false, error: 'Service not initialized' },
                    });
                }
                return false;
            }
            const result = await service.stopChat();
            if (callback) {
                callback({
                    text: 'Chat ingestion stopped.',
                    content: { success: true, data: result },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to stop chat: ${errorMessage}`,
                    content: { success: false, error: errorMessage },
                });
            }
            return false;
        }
    },
    examples: [
        [
            {
                user: '{{user1}}',
                content: { text: 'Stop monitoring chat' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Stopping chat ingestion.',
                    action: 'STREAM555_CHAT_STOP',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Disconnect from chat' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Disconnecting from all chat platforms.',
                    action: 'STREAM555_CHAT_STOP',
                },
            },
        ],
    ],
};
export default chatStopAction;
//# sourceMappingURL=chatStop.js.map