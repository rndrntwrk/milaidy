/**
 * Approval Helper
 *
 * Provides a helper function for actions that require operator approval.
 * Uses async with re-invocation pattern:
 * 1. Action creates approval request, returns pending status
 * 2. User approves via frontend
 * 3. Agent re-calls action with approvalId, execution proceeds
 */
export interface ApprovalResult {
    success: boolean;
    pending?: boolean;
    approvalId?: string;
    message?: string;
    expiresAt?: number;
    error?: string;
    data?: unknown;
}
/**
 * Wrap an action execution with approval flow.
 *
 * @param actionName - Name of the action (for audit)
 * @param params - Action parameters (will be stored with approval)
 * @param requireApprovals - Whether approvals are enabled
 * @param execute - The actual execution function
 * @returns Approval result or execution result
 */
export declare function withApproval(actionName: string, params: Record<string, unknown>, requireApprovals: boolean, execute: () => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
}>): Promise<ApprovalResult>;
/**
 * Format approval pending response for callback
 */
export declare function formatApprovalPending(result: ApprovalResult): string;
/**
 * Format approval rejected response for callback
 */
export declare function formatApprovalRejected(): string;
/**
 * Format approval expired response for callback
 */
export declare function formatApprovalExpired(): string;
//# sourceMappingURL=approvalHelper.d.ts.map