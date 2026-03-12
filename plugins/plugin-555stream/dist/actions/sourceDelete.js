/**
 * STREAM555_SOURCE_DELETE Action
 *
 * Delete a source.
 * Requires operator approval.
 */
import { withApproval, formatApprovalPending, formatApprovalRejected, formatApprovalExpired, } from '../lib/approvalHelper.js';
export const sourceDeleteAction = {
    name: 'STREAM555_SOURCE_DELETE',
    description: 'Delete a source from the session. Requires operator approval.',
    similes: [
        'DELETE_SOURCE',
        'REMOVE_SOURCE',
        'REMOVE_INPUT',
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
            const sourceId = options?.sourceId;
            const approvalId = options?._approvalId;
            if (!sourceId) {
                if (callback) {
                    callback({
                        text: 'No source ID provided. Specify which source to delete.',
                        content: { success: false, error: 'No sourceId provided' },
                    });
                }
                return false;
            }
            const params = {
                sourceId,
                _approvalId: approvalId,
            };
            // Execute with approval flow
            const result = await withApproval('STREAM555_SOURCE_DELETE', params, requireApprovals, async () => {
                await service.deleteSource(sourceId);
                return { success: true, data: { deleted: true, sourceId } };
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
                            text: `Failed to delete source: ${result.error}`,
                            content: { success: false, error: result.error },
                        });
                    }
                }
                return false;
            }
            if (callback) {
                callback({
                    text: `**Source Deleted**\n\n**ID:** \`${sourceId}\``,
                    content: { success: true, data: { deleted: true, sourceId } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to delete source: ${errorMessage}`,
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
                content: { text: 'Delete the camera source' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'I\'ll delete that source.',
                    action: 'STREAM555_SOURCE_DELETE',
                },
            },
        ],
    ],
};
export default sourceDeleteAction;
//# sourceMappingURL=sourceDelete.js.map