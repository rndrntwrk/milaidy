/**
 * STREAM555_CHAT_READ Action
 *
 * Read recent chat messages from the stream.
 * Does not require approval.
 */
export const chatReadAction = {
    name: 'STREAM555_CHAT_READ',
    description: 'Read recent chat messages from the stream. Optionally filter by platform (twitch, kick, pump) and limit the number of messages.',
    similes: [
        'READ_CHAT',
        'GET_CHAT',
        'CHECK_CHAT',
        'VIEW_CHAT_MESSAGES',
        'SEE_CHAT',
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
            const limit = options?.limit || 20;
            const platform = options?.platform;
            const result = await service.getChatMessages({ limit, platform });
            if (callback) {
                callback({
                    text: formatChatMessages(result.messages, result.count),
                    content: { success: true, data: result },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to read chat: ${errorMessage}`,
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
                content: { text: 'Read the chat messages' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Reading recent chat messages.',
                    action: 'STREAM555_CHAT_READ',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'What are people saying in Twitch chat?' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Let me check the Twitch chat.',
                    action: 'STREAM555_CHAT_READ',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Show me the last 10 chat messages' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Fetching the last 10 messages.',
                    action: 'STREAM555_CHAT_READ',
                },
            },
        ],
    ],
};
function formatChatMessages(messages, count) {
    if (count === 0) {
        return 'No chat messages found.';
    }
    const lines = [`**Recent Chat** (${count} messages)\n`];
    for (const msg of messages.slice(0, 20)) {
        const platform = msg.platform ? `[${msg.platform}]` : '';
        const user = msg.user?.displayName || msg.user?.username || 'Unknown';
        const text = msg.content?.text || '';
        lines.push(`${platform} **${user}**: ${text}`);
    }
    return lines.join('\n');
}
export default chatReadAction;
//# sourceMappingURL=chatRead.js.map