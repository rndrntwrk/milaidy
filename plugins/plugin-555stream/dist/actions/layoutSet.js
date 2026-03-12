/**
 * STREAM555_LAYOUT_SET Action
 *
 * Update layout for a scene.
 * Does not require approval.
 */
export const layoutSetAction = {
    name: 'STREAM555_LAYOUT_SET',
    description: 'Update layout configuration for a scene. Allows setting layout type and source positions.',
    similes: [
        'SET_LAYOUT',
        'UPDATE_LAYOUT',
        'CHANGE_LAYOUT',
        'CONFIGURE_LAYOUT',
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
            const sceneId = options?.sceneId || 'main';
            const layout = options?.layout;
            if (!layout) {
                if (callback) {
                    callback({
                        text: 'No layout configuration provided.',
                        content: { success: false, error: 'No layout provided' },
                    });
                }
                return false;
            }
            const updatedLayout = await service.setLayout(sceneId, layout);
            if (callback) {
                callback({
                    text: `**Layout Updated**\n\n**Scene:** ${sceneId}\n**Layout:** ${JSON.stringify(updatedLayout, null, 2)}`,
                    content: { success: true, data: { sceneId, layout: updatedLayout } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to set layout: ${errorMessage}`,
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
                content: { text: 'Set the layout to picture-in-picture' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Setting the layout to PiP mode.',
                    action: 'STREAM555_LAYOUT_SET',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Configure split screen layout' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Configuring split screen layout.',
                    action: 'STREAM555_LAYOUT_SET',
                },
            },
        ],
    ],
};
export default layoutSetAction;
//# sourceMappingURL=layoutSet.js.map