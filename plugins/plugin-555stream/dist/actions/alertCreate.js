/**
 * STREAM555_ALERT_CREATE Action
 *
 * Create and queue a new alert (follow, subscribe, donation, raid, custom).
 * Does not require approval.
 */
export const alertCreateAction = {
    name: 'STREAM555_ALERT_CREATE',
    description: 'Create and queue a stream alert. Types: follow, subscribe, donation, raid, bits, custom.',
    similes: [
        'ADD_ALERT',
        'QUEUE_ALERT',
        'SHOW_ALERT',
        'TRIGGER_ALERT',
        'CREATE_NOTIFICATION',
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
            const alertConfig = {
                eventType: options?.eventType || 'custom',
                message: options?.message || 'New alert!',
                username: options?.username,
                amount: options?.amount,
                image: options?.image,
                duration: options?.duration || 5000,
                priority: options?.priority || 0,
                variant: options?.variant || 'popup',
            };
            const alert = await service.createAlert(alertConfig);
            const response = formatAlertResponse(alert);
            if (callback) {
                callback({
                    text: response,
                    content: { success: true, data: { alert } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to create alert: ${errorMessage}`,
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
                content: { text: 'Show a new follower alert for CoolViewer123' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Creating a follow alert.',
                    action: 'STREAM555_ALERT_CREATE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Trigger a $50 donation alert from BigDonor' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Queuing donation alert.',
                    action: 'STREAM555_ALERT_CREATE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Show a raid alert - 500 viewers incoming!' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Creating raid alert.',
                    action: 'STREAM555_ALERT_CREATE',
                },
            },
        ],
    ],
};
function formatAlertResponse(alert) {
    const lines = [];
    lines.push('**Alert Created**');
    lines.push('');
    lines.push(`**ID:** \`${alert.id}\``);
    lines.push(`**Type:** ${alert.eventType}`);
    lines.push(`**Message:** ${alert.message}`);
    if (alert.username) {
        lines.push(`**Username:** ${alert.username}`);
    }
    if (alert.amount) {
        lines.push(`**Amount:** ${alert.amount}`);
    }
    lines.push(`**Status:** ${alert.status}`);
    return lines.join('\n');
}
export default alertCreateAction;
//# sourceMappingURL=alertCreate.js.map