/**
 * STREAM555_GRAPHICS_UPDATE Action
 *
 * Update an existing graphic.
 * Does not require approval.
 */
export const graphicsUpdateAction = {
    name: 'STREAM555_GRAPHICS_UPDATE',
    description: 'Update an existing graphic. Can modify content, position, visibility, or type.',
    similes: [
        'UPDATE_GRAPHIC',
        'MODIFY_GRAPHIC',
        'EDIT_GRAPHIC',
        'CHANGE_GRAPHIC',
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
            const graphicId = options?.graphicId;
            if (!graphicId) {
                if (callback) {
                    callback({
                        text: 'No graphic ID provided. Specify which graphic to update.',
                        content: { success: false, error: 'No graphicId provided' },
                    });
                }
                return false;
            }
            // Build updates object
            const updates = {};
            if (options?.content !== undefined)
                updates.content = options.content;
            if (options?.position !== undefined)
                updates.position = options.position;
            if (options?.visible !== undefined)
                updates.visible = options.visible;
            if (options?.type !== undefined)
                updates.type = options.type;
            if (Object.keys(updates).length === 0) {
                if (callback) {
                    callback({
                        text: 'No updates provided. Specify what to change.',
                        content: { success: false, error: 'No updates provided' },
                    });
                }
                return false;
            }
            const graphic = await service.updateGraphic(graphicId, updates);
            const response = formatUpdateResponse(graphic);
            if (callback) {
                callback({
                    text: response,
                    content: { success: true, data: { graphic } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to update graphic: ${errorMessage}`,
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
                content: { text: 'Change the title text' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Updating the title text.',
                    action: 'STREAM555_GRAPHICS_UPDATE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Move the graphic to the bottom' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Moving the graphic.',
                    action: 'STREAM555_GRAPHICS_UPDATE',
                },
            },
        ],
    ],
};
function formatUpdateResponse(graphic) {
    const lines = [];
    lines.push('**Graphic Updated**');
    lines.push('');
    lines.push(`**ID:** \`${graphic.id}\``);
    lines.push(`**Type:** ${graphic.type}`);
    if (graphic.content) {
        lines.push(`**Content:** ${graphic.content}`);
    }
    lines.push(`**Visible:** ${graphic.visible ? 'Yes' : 'No'}`);
    if (graphic.position) {
        lines.push(`**Position:** (${graphic.position.x}, ${graphic.position.y})`);
    }
    return lines.join('\n');
}
export default graphicsUpdateAction;
//# sourceMappingURL=graphicsUpdate.js.map