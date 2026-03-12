/**
 * STREAM555_CHAT_SEND Action
 *
 * Send a message to the stream's chat.
 * Does not require approval (messages are visible to viewers).
 */
export const chatSendAction = {
    name: 'STREAM555_CHAT_SEND',
    description: 'Send a message to the stream chat. The message will be visible to all viewers on connected platforms. Optionally target a specific platform.',
    similes: [
        'SEND_CHAT',
        'CHAT_MESSAGE',
        'SAY_IN_CHAT',
        'WRITE_CHAT',
        'POST_CHAT',
        'REPLY_CHAT',
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
            const chatMessage = options?.message;
            const platform = options?.platform;
            if (!chatMessage || chatMessage.trim().length === 0) {
                if (callback) {
                    callback({
                        text: 'No message provided. Please specify a message to send.',
                        content: { success: false, error: 'No message provided' },
                    });
                }
                return false;
            }
            if (chatMessage.length > 500) {
                if (callback) {
                    callback({
                        text: 'Message too long (max 500 characters).',
                        content: { success: false, error: 'Message too long' },
                    });
                }
                return false;
            }
            const result = await service.sendChatMessage(chatMessage.trim(), platform);
            if (callback) {
                const target = platform || 'all platforms';
                callback({
                    text: `Message sent to ${target}: "${chatMessage.trim()}"`,
                    content: { success: true, data: result },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to send chat message: ${errorMessage}`,
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
                content: { text: 'Say hello in chat' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Sending a greeting to chat.',
                    action: 'STREAM555_CHAT_SEND',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Tell the viewers we are starting soon' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Sending message to chat.',
                    action: 'STREAM555_CHAT_SEND',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Post in Twitch chat: Thanks for watching!' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Sending to Twitch chat.',
                    action: 'STREAM555_CHAT_SEND',
                },
            },
        ],
    ],
};
export default chatSendAction;
//# sourceMappingURL=chatSend.js.map