/**
 * STREAM555_STREAM_FALLBACK Action
 *
 * Trigger server-side fallback capture.
 * Requires operator approval.
 */
import { withApproval, formatApprovalPending, formatApprovalRejected, formatApprovalExpired, } from '../lib/approvalHelper.js';
export const streamFallbackAction = {
    name: 'STREAM555_STREAM_FALLBACK',
    description: 'Trigger server-side fallback capture. This starts server-side capture to continue streaming when browser-based capture fails. Requires operator approval.',
    similes: [
        'FALLBACK_STREAM',
        'SERVER_CAPTURE',
        'BACKUP_STREAM',
        'ENABLE_FALLBACK',
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
            const config = service.getConfig();
            const requireApprovals = config?.requireApprovals ?? true;
            const reason = options?.reason;
            const approvalId = options?._approvalId;
            const params = {
                reason,
                _approvalId: approvalId,
            };
            // Execute with approval flow
            const result = await withApproval('STREAM555_STREAM_FALLBACK', params, requireApprovals, async () => {
                const fallbackResult = await service.fallbackStream(reason);
                return {
                    success: true,
                    data: fallbackResult,
                };
            });
            if (result.pending) {
                if (callback) {
                    callback({
                        text: formatApprovalPending(result),
                        content: {
                            success: false,
                            data: {
                                pending: true,
                                approvalId: result.approvalId,
                                expiresAt: result.expiresAt,
                            },
                        },
                    });
                }
                return false;
            }
            if (result.error) {
                if (result.error.includes('rejected')) {
                    if (callback) {
                        callback({
                            text: formatApprovalRejected(),
                            content: { success: false, error: result.error },
                        });
                    }
                }
                else if (result.error.includes('expired')) {
                    if (callback) {
                        callback({
                            text: formatApprovalExpired(),
                            content: { success: false, error: result.error },
                        });
                    }
                }
                else {
                    if (callback) {
                        callback({
                            text: `Failed to start fallback: ${result.error}`,
                            content: { success: false, error: result.error },
                        });
                    }
                }
                return false;
            }
            // Success
            const data = result.data;
            if (callback) {
                callback({
                    text: `**Fallback Started**\n\n${data.message}\n\n**Job ID:** \`${data.jobId}\``,
                    content: { success: true, data },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to start fallback: ${errorMessage}`,
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
                content: { text: 'Enable server fallback' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'I\'ll enable server-side fallback capture.',
                    action: 'STREAM555_STREAM_FALLBACK',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Start backup capture' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Starting server-side backup capture.',
                    action: 'STREAM555_STREAM_FALLBACK',
                },
            },
        ],
    ],
};
export default streamFallbackAction;
//# sourceMappingURL=streamFallback.js.map