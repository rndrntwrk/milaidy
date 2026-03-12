/**
 * Approval Helper
 *
 * Provides a helper function for actions that require operator approval.
 * Uses async with re-invocation pattern:
 * 1. Action creates approval request, returns pending status
 * 2. User approves via frontend
 * 3. Agent re-calls action with approvalId, execution proceeds
 */
import { createApprovalRequest, getApproval, } from '../routes/approvals.js';
/**
 * Wrap an action execution with approval flow.
 *
 * @param actionName - Name of the action (for audit)
 * @param params - Action parameters (will be stored with approval)
 * @param requireApprovals - Whether approvals are enabled
 * @param execute - The actual execution function
 * @returns Approval result or execution result
 */
export async function withApproval(actionName, params, requireApprovals, execute) {
    // If approvals disabled, execute directly
    if (!requireApprovals) {
        const result = await execute();
        return result;
    }
    // Check for existing approval ID in params
    const approvalId = params._approvalId;
    if (approvalId) {
        const approval = getApproval(approvalId);
        if (!approval) {
            return {
                success: false,
                error: `Approval not found: ${approvalId}`,
            };
        }
        if (approval.status === 'approved') {
            // Double-check approval is still valid immediately before execution
            // This prevents race conditions where approval expires between check and execution
            const freshApproval = getApproval(approvalId);
            if (!freshApproval || freshApproval.status !== 'approved') {
                return {
                    success: false,
                    error: 'Approval expired or revoked. Please request a new approval.',
                };
            }
            // Execute the action
            const result = await execute();
            return result;
        }
        if (approval.status === 'rejected') {
            return {
                success: false,
                error: 'Action was rejected by operator',
            };
        }
        if (approval.status === 'expired') {
            return {
                success: false,
                error: 'Approval has expired. Please request again.',
            };
        }
        // Still pending
        return {
            success: false,
            pending: true,
            approvalId: approval.id,
            message: `Approval still pending. ID: ${approval.id}`,
            expiresAt: approval.expiresAt,
        };
    }
    // No approval ID provided - create new approval request
    // Remove any internal params before storing
    const cleanParams = { ...params };
    delete cleanParams._approvalId;
    const approval = createApprovalRequest(actionName, cleanParams);
    return {
        success: false,
        pending: true,
        approvalId: approval.id,
        message: `Approval required for ${actionName}. Check 555stream dashboard.`,
        expiresAt: approval.expiresAt,
    };
}
/**
 * Format approval pending response for callback
 */
export function formatApprovalPending(result) {
    const lines = [
        '⏳ **Approval Required**',
        '',
        `This action requires operator approval before execution.`,
        '',
        `**Approval ID:** \`${result.approvalId}\``,
        `**Expires:** ${new Date(result.expiresAt).toLocaleString()}`,
        '',
        'Please approve this action in the 555stream dashboard, then try again.',
    ];
    return lines.join('\n');
}
/**
 * Format approval rejected response for callback
 */
export function formatApprovalRejected() {
    return '❌ **Action Rejected**\n\nThis action was rejected by the operator.';
}
/**
 * Format approval expired response for callback
 */
export function formatApprovalExpired() {
    return '⏰ **Approval Expired**\n\nThe approval request has expired. Please try again.';
}
//# sourceMappingURL=approvalHelper.js.map