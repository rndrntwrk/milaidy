/**
 * STREAM555_RADIO_CONFIG Action
 *
 * Configure radio settings.
 * Does not require approval.
 */
export const radioConfigAction = {
    name: 'STREAM555_RADIO_CONFIG',
    description: 'Configure lofi radio settings including autoDJ mode, active tracks, effects, volumes, and background.',
    similes: [
        'CONFIGURE_RADIO',
        'SET_RADIO',
        'UPDATE_RADIO',
        'RADIO_SETTINGS',
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
            const config = {
                autoDJMode: options?.autoDJMode,
                activeTracks: options?.activeTracks,
                activeEffects: options?.activeEffects,
                volumes: options?.volumes,
                hlsBg: options?.hlsBg,
            };
            // Remove undefined values
            Object.keys(config).forEach(key => {
                if (config[key] === undefined) {
                    delete config[key];
                }
            });
            if (Object.keys(config).length === 0) {
                if (callback) {
                    callback({
                        text: 'No radio configuration provided.',
                        content: { success: false, error: 'No config provided' },
                    });
                }
                return false;
            }
            const state = await service.setRadioConfig(config);
            if (callback) {
                callback({
                    text: formatRadioResponse(state),
                    content: { success: true, data: state },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to configure radio: ${errorMessage}`,
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
                content: { text: 'Set radio to music mode' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Setting radio to music mode.',
                    action: 'STREAM555_RADIO_CONFIG',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Configure the lofi radio tracks' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Configuring radio tracks.',
                    action: 'STREAM555_RADIO_CONFIG',
                },
            },
        ],
    ],
};
function formatRadioResponse(state) {
    const lines = [];
    lines.push('**Radio Configured**');
    lines.push('');
    lines.push(`**Mode:** ${state.autoDJMode}`);
    if (state.activeTracks.length > 0) {
        lines.push(`**Active Tracks:** ${state.activeTracks.join(', ')}`);
    }
    if (state.activeEffects.length > 0) {
        lines.push(`**Effects:** ${state.activeEffects.join(', ')}`);
    }
    if (state.hlsBg) {
        lines.push(`**Background:** ${state.hlsBg}`);
    }
    return lines.join('\n');
}
export default radioConfigAction;
//# sourceMappingURL=radioConfig.js.map