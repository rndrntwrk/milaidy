/**
 * STREAM555_TEMPLATE_APPLY Action
 *
 * Apply a template to create a new overlay graphic.
 * Does not require approval.
 */
export const templateApplyAction = {
    name: 'STREAM555_TEMPLATE_APPLY',
    description: 'Apply a template to create a new overlay graphic. Specify template ID and optional customizations.',
    similes: [
        'USE_TEMPLATE',
        'APPLY_OVERLAY_TEMPLATE',
        'CREATE_FROM_TEMPLATE',
        'ADD_TEMPLATE',
    ],
    validate: async (runtime, _message, _state) => {
        const service = runtime.getService('stream555');
        return !!(service?.isReady());
    },
    handler: async (runtime, _message, _state, options, callback) => {
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
            const templateId = options?.templateId;
            if (!templateId) {
                if (callback) {
                    callback({
                        text: 'Template ID is required.',
                        content: { success: false, error: 'Missing templateId' },
                    });
                }
                return false;
            }
            // Optional customizations to override template defaults
            const customizations = {
                title: options?.title,
                subtitle: options?.subtitle,
                content: options?.content,
                position: options?.position,
                visible: options?.visible !== false,
            };
            const graphic = await service.applyTemplate(templateId, customizations);
            const response = formatApplyResponse(templateId, graphic);
            if (callback) {
                callback({
                    text: response,
                    content: { success: true, data: { templateId, graphic } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to apply template: ${errorMessage}`,
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
                content: { text: 'Add a gaming lower third template' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Applying gaming lower third template.',
                    action: 'STREAM555_TEMPLATE_APPLY',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Use the news ticker template with custom text' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Applying news ticker template.',
                    action: 'STREAM555_TEMPLATE_APPLY',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Apply the countdown timer template for starting soon' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Creating countdown from template.',
                    action: 'STREAM555_TEMPLATE_APPLY',
                },
            },
        ],
    ],
};
function formatApplyResponse(templateId, graphic) {
    const lines = [];
    lines.push('**Template Applied**');
    lines.push('');
    lines.push(`**Template:** \`${templateId}\``);
    lines.push(`**Graphic ID:** \`${graphic.id}\``);
    lines.push(`**Type:** ${graphic.type}`);
    if (graphic.name) {
        lines.push(`**Name:** ${graphic.name}`);
    }
    return lines.join('\n');
}
export default templateApplyAction;
//# sourceMappingURL=templateApply.js.map