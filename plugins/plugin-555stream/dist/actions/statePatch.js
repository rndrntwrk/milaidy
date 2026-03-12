/**
 * STREAM555_STATE_PATCH Action
 *
 * Patch production state using JSON Merge Patch (RFC 7396).
 * Approval requirement is configurable.
 */
export const statePatchAction = {
    name: 'STREAM555_STATE_PATCH',
    description: 'Patch production state using JSON Merge Patch. Can update activeLayout, pipPosition, cameraOn, screenOn, micOn, sources, graphics, and activeSceneId.',
    similes: [
        'UPDATE_STATE',
        'PATCH_STATE',
        'SET_STATE',
        'MODIFY_STATE',
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
            const patch = options?.patch;
            if (!patch || Object.keys(patch).length === 0) {
                if (callback) {
                    callback({
                        text: 'No state patch provided. Specify which state fields to update.',
                        content: { success: false, error: 'No patch provided' },
                    });
                }
                return false;
            }
            // Apply patch
            const newState = await service.patchState(patch);
            const response = formatPatchResponse(patch, newState);
            if (callback) {
                callback({
                    text: response,
                    content: { success: true, data: { productionState: newState } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to patch state: ${errorMessage}`,
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
                content: { text: 'Turn on the camera' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'I\'ll turn on the camera.',
                    action: 'STREAM555_STATE_PATCH',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Mute the microphone' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Muting the microphone.',
                    action: 'STREAM555_STATE_PATCH',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Switch to split layout' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Switching to split screen layout.',
                    action: 'STREAM555_STATE_PATCH',
                },
            },
        ],
    ],
};
function formatPatchResponse(patch, newState) {
    const lines = [];
    lines.push('**State Updated**');
    lines.push('');
    // Show what was changed
    lines.push('**Changes:**');
    for (const [key, value] of Object.entries(patch)) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        lines.push(`- ${key}: ${displayValue}`);
    }
    lines.push('');
    lines.push('**Current State:**');
    lines.push(`- Layout: ${newState.activeLayout}`);
    if (newState.pipPosition) {
        lines.push(`- PiP Position: ${newState.pipPosition}`);
    }
    lines.push(`- Camera: ${newState.cameraOn ? 'ON' : 'OFF'}`);
    lines.push(`- Screen: ${newState.screenOn ? 'ON' : 'OFF'}`);
    lines.push(`- Mic: ${newState.micOn ? 'ON' : 'OFF'}`);
    if (newState.activeSceneId) {
        lines.push(`- Scene: ${newState.activeSceneId}`);
    }
    return lines.join('\n');
}
export default statePatchAction;
//# sourceMappingURL=statePatch.js.map