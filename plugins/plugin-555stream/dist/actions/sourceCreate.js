/**
 * STREAM555_SOURCE_CREATE Action
 *
 * Create a new source.
 * Does not require approval.
 */
export const sourceCreateAction = {
    name: 'STREAM555_SOURCE_CREATE',
    description: 'Create a new source for the stream. Types: camera, screen, guest, media, browser.',
    similes: [
        'ADD_SOURCE',
        'CREATE_SOURCE',
        'ADD_INPUT',
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
            const sourceType = options?.type;
            if (!sourceType) {
                if (callback) {
                    callback({
                        text: 'No source type provided. Valid types: camera, screen, guest, media, browser.',
                        content: { success: false, error: 'No type provided' },
                    });
                }
                return false;
            }
            const sourceConfig = {
                type: sourceType,
                label: options?.label,
                deviceId: options?.deviceId,
                deviceLabel: options?.deviceLabel,
                metadata: options?.metadata,
            };
            const source = await service.createSource(sourceConfig);
            if (callback) {
                callback({
                    text: formatSourceResponse('Created', source),
                    content: { success: true, data: { source } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to create source: ${errorMessage}`,
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
                content: { text: 'Add a camera source' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Adding a camera source.',
                    action: 'STREAM555_SOURCE_CREATE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Create a screen share source' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Creating a screen share source.',
                    action: 'STREAM555_SOURCE_CREATE',
                },
            },
        ],
    ],
};
function formatSourceResponse(action, source) {
    const lines = [];
    lines.push(`**Source ${action}**`);
    lines.push('');
    lines.push(`**ID:** \`${source.id}\``);
    lines.push(`**Type:** ${source.type}`);
    lines.push(`**Label:** ${source.label}`);
    lines.push(`**Status:** ${source.status}`);
    return lines.join('\n');
}
export default sourceCreateAction;
//# sourceMappingURL=sourceCreate.js.map