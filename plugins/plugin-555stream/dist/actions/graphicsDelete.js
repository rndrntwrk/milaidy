/**
 * STREAM555_GRAPHICS_DELETE Action
 *
 * Delete a graphic.
 * Requires operator approval.
 */
import { withApproval, formatApprovalPending, formatApprovalRejected, formatApprovalExpired, } from '../lib/approvalHelper.js';
export const graphicsDeleteAction = {
    name: 'STREAM555_GRAPHICS_DELETE',
    description: 'Delete a graphic from the stream. This action is permanent. Requires operator approval.',
    similes: [
        'DELETE_GRAPHIC',
        'REMOVE_GRAPHIC',
        'REMOVE_OVERLAY',
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
            const graphicId = options?.graphicId;
            const approvalId = options?._approvalId;
            if (!graphicId) {
                if (callback) {
                    callback({
                        text: 'No graphic ID provided. Specify which graphic to delete.',
                        content: { success: false, error: 'No graphicId provided' },
                    });
                }
                return false;
            }
            const params = {
                graphicId,
                _approvalId: approvalId,
            };
            // Execute with approval flow
            const result = await withApproval('STREAM555_GRAPHICS_DELETE', params, requireApprovals, async () => {
                await service.deleteGraphic(graphicId);
                return { success: true, data: { deleted: true, graphicId } };
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
                            text: `Failed to delete graphic: ${result.error}`,
                            content: { success: false, error: result.error },
                        });
                    }
                }
                return false;
            }
            if (callback) {
                callback({
                    text: `**Graphic Deleted**\n\n**ID:** \`${graphicId}\``,
                    content: { success: true, data: { deleted: true, graphicId } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to delete graphic: ${errorMessage}`,
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
                content: { text: 'Delete the title graphic' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'I\'ll delete that graphic.',
                    action: 'STREAM555_GRAPHICS_DELETE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Remove the overlay' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Removing the overlay.',
                    action: 'STREAM555_GRAPHICS_DELETE',
                },
            },
        ],
    ],
};
export default graphicsDeleteAction;
//# sourceMappingURL=graphicsDelete.js.map