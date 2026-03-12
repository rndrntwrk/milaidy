/**
 * STREAM555_PLATFORM_TOGGLE Action
 *
 * Toggle platform enabled state.
 * Does not require approval.
 */
export const platformToggleAction = {
    name: 'STREAM555_PLATFORM_TOGGLE',
    description: 'Toggle a platform on or off for streaming. Does not require approval.',
    similes: [
        'TOGGLE_PLATFORM',
        'ENABLE_PLATFORM',
        'DISABLE_PLATFORM',
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
            const platformId = options?.platformId;
            const enabled = options?.enabled;
            if (!platformId) {
                if (callback) {
                    callback({
                        text: 'No platform ID provided. Valid: twitch, kick, youtube, pumpfun, x, tiktok, zora, custom.',
                        content: { success: false, error: 'No platformId provided' },
                    });
                }
                return false;
            }
            if (enabled === undefined) {
                if (callback) {
                    callback({
                        text: 'No enabled value provided. Specify true or false.',
                        content: { success: false, error: 'No enabled value provided' },
                    });
                }
                return false;
            }
            await service.togglePlatform(platformId, enabled);
            if (callback) {
                callback({
                    text: `**Platform ${enabled ? 'Enabled' : 'Disabled'}**\n\n**Platform:** ${platformId}`,
                    content: { success: true, data: { platformId, enabled } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to toggle platform: ${errorMessage}`,
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
                content: { text: 'Enable Twitch streaming' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Enabling Twitch.',
                    action: 'STREAM555_PLATFORM_TOGGLE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Disable YouTube' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Disabling YouTube streaming.',
                    action: 'STREAM555_PLATFORM_TOGGLE',
                },
            },
        ],
    ],
};
export default platformToggleAction;
//# sourceMappingURL=platformToggle.js.map