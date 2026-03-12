/**
 * STREAM555_TEMPLATE_LIST Action
 *
 * List available overlay templates, optionally filtered by category or type.
 * Does not require approval.
 */
export const templateListAction = {
    name: 'STREAM555_TEMPLATE_LIST',
    description: 'List available overlay templates. Filter by category (gaming, podcast, news, minimal) or type (lowerThird, ticker, alert, countdown).',
    similes: [
        'SHOW_TEMPLATES',
        'LIST_OVERLAYS',
        'GET_TEMPLATES',
        'AVAILABLE_TEMPLATES',
        'BROWSE_TEMPLATES',
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
            const category = options?.category;
            const type = options?.type;
            const templates = await service.getTemplates({ category, type });
            const response = formatTemplateList(templates, category, type);
            if (callback) {
                callback({
                    text: response,
                    content: { success: true, data: { templates, count: templates.length } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to list templates: ${errorMessage}`,
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
                content: { text: 'What templates are available?' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Listing available templates.',
                    action: 'STREAM555_TEMPLATE_LIST',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Show me gaming overlay templates' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Listing gaming templates.',
                    action: 'STREAM555_TEMPLATE_LIST',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'List all lower third templates' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Showing lower third templates.',
                    action: 'STREAM555_TEMPLATE_LIST',
                },
            },
        ],
    ],
};
function formatTemplateList(templates, category, type) {
    const lines = [];
    let title = '**Available Templates**';
    if (category || type) {
        const filters = [];
        if (category)
            filters.push(`Category: ${category}`);
        if (type)
            filters.push(`Type: ${type}`);
        title += ` (${filters.join(', ')})`;
    }
    lines.push(title);
    lines.push('');
    lines.push(`Found **${templates.length}** template(s).`);
    lines.push('');
    // Group by category
    const grouped = templates.reduce((acc, t) => {
        const cat = t.category || 'Other';
        if (!acc[cat])
            acc[cat] = [];
        acc[cat].push(t);
        return acc;
    }, {});
    for (const [cat, catTemplates] of Object.entries(grouped)) {
        lines.push(`**${cat}:**`);
        for (const t of catTemplates) {
            lines.push(`  - \`${t.id}\` - ${t.name} (${t.type})`);
        }
        lines.push('');
    }
    lines.push('Use `STREAM555_TEMPLATE_APPLY` with a template ID to create an overlay.');
    return lines.join('\n');
}
export default templateListAction;
//# sourceMappingURL=templateList.js.map