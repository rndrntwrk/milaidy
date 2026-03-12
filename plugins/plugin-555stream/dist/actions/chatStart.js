/**
 * STREAM555_CHAT_START Action
 *
 * Start chat ingestion for platforms (Twitch, Kick, PumpFun).
 * Does not require approval.
 */
export const chatStartAction = {
    name: 'STREAM555_CHAT_START',
    description: 'Start chat ingestion for one or more platforms. Supported platforms: twitch, kick, pump. Provide platform name and channel ID.',
    similes: [
        'START_CHAT',
        'CONNECT_CHAT',
        'ENABLE_CHAT',
        'JOIN_CHAT',
        'OPEN_CHAT',
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
            const platforms = options?.platforms;
            if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
                if (callback) {
                    callback({
                        text: 'No platforms specified. Provide an array like: [{ platform: "twitch", channelId: "channel_name" }]',
                        content: { success: false, error: 'No platforms specified' },
                    });
                }
                return false;
            }
            const validPlatforms = ['twitch', 'kick', 'pump'];
            for (const p of platforms) {
                if (!validPlatforms.includes(p.platform)) {
                    if (callback) {
                        callback({
                            text: `Invalid platform: ${p.platform}. Valid: ${validPlatforms.join(', ')}`,
                            content: { success: false, error: 'Invalid platform' },
                        });
                    }
                    return false;
                }
                if (!p.channelId) {
                    if (callback) {
                        callback({
                            text: `Channel ID required for ${p.platform}.`,
                            content: { success: false, error: 'Channel ID required' },
                        });
                    }
                    return false;
                }
            }
            const result = await service.startChat(platforms);
            if (callback) {
                callback({
                    text: `Chat started for: ${result.platforms.join(', ')}`,
                    content: { success: true, data: result },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to start chat: ${errorMessage}`,
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
                content: { text: 'Connect to Twitch chat for channel rndrntwrk' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Starting Twitch chat ingestion.',
                    action: 'STREAM555_CHAT_START',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Start monitoring chat on Kick and Twitch' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Connecting to chat on both platforms.',
                    action: 'STREAM555_CHAT_START',
                },
            },
        ],
    ],
};
export default chatStartAction;
//# sourceMappingURL=chatStart.js.map