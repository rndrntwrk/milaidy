/**
 * STREAM555_GUEST_REMOVE Action
 *
 * Remove/revoke a guest.
 * Requires operator approval.
 */
import { withApproval, formatApprovalPending, formatApprovalRejected, formatApprovalExpired, } from '../lib/approvalHelper.js';
export const guestRemoveAction = {
    name: 'STREAM555_GUEST_REMOVE',
    description: 'Remove a guest from the stream or revoke their invite. Requires operator approval.',
    similes: [
        'REMOVE_GUEST',
        'KICK_GUEST',
        'REVOKE_INVITE',
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
            const guestId = options?.guestId;
            const approvalId = options?._approvalId;
            if (!guestId) {
                if (callback) {
                    callback({
                        text: 'No guest ID provided. Specify which guest to remove.',
                        content: { success: false, error: 'No guestId provided' },
                    });
                }
                return false;
            }
            const params = {
                guestId,
                _approvalId: approvalId,
            };
            // Execute with approval flow
            const result = await withApproval('STREAM555_GUEST_REMOVE', params, requireApprovals, async () => {
                await service.removeGuest(guestId);
                return { success: true, data: { deleted: true, guestId } };
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
                            text: `Failed to remove guest: ${result.error}`,
                            content: { success: false, error: result.error },
                        });
                    }
                }
                return false;
            }
            if (callback) {
                callback({
                    text: `**Guest Removed**\n\n**ID:** \`${guestId}\``,
                    content: { success: true, data: { deleted: true, guestId } },
                });
            }
            return true;
        }
        catch (error) {
            const errorMessage = error.message;
            if (callback) {
                callback({
                    text: `Failed to remove guest: ${errorMessage}`,
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
                content: { text: 'Remove the guest' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'I\'ll remove that guest.',
                    action: 'STREAM555_GUEST_REMOVE',
                },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'Kick the guest from the stream' },
            },
            {
                user: '{{agentName}}',
                content: {
                    text: 'Removing the guest from the stream.',
                    action: 'STREAM555_GUEST_REMOVE',
                },
            },
        ],
    ],
};
export default guestRemoveAction;
//# sourceMappingURL=guestRemove.js.map