/**
 * STREAM555_SCENE_SET_ACTIVE Action
 *
 * Set the active scene.
 * Does not require approval.
 */
export const sceneSetActiveAction = {
    name: 'STREAM555_SCENE_SET_ACTIVE',
    description: 'Set the active scene for the stream. Scenes contain layout and source configurations.',
    similes: [
        'SET_SCENE',
        'SWITCH_SCENE',
        'CHANGE_SCENE',
        'ACTIVATE_SCENE',
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
            const sceneId = options?.sceneId;
            if (!sceneId) {
                if (callback) {
                    callback({
                        text: 'No scene ID provided. Specify which scene to activate.',
                        content: { success: false, error: 'No sceneId provided' },
                    });
                }
                return false;
            }
            const activeScene = await service.setActiveScene(sceneId);
            if (callback) {
                callback({
                    text: `**Scene Changed**\n\n**Active Scene:** ${activeScene}`,
                    content: { success: true, data: { activeScene } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to set active scene: ${errorMessage}`,
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
                content: { text: 'Switch to the intro scene' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Switching to the intro scene.',
                    action: 'STREAM555_SCENE_SET_ACTIVE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Go to the main scene' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Activating the main scene.',
                    action: 'STREAM555_SCENE_SET_ACTIVE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Change to brb scene' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Switching to BRB scene.',
                    action: 'STREAM555_SCENE_SET_ACTIVE',
                },
            },
        ],
    ],
};
export default sceneSetActiveAction;
//# sourceMappingURL=sceneSetActive.js.map