/**
 * Approval API Routes
 *
 * JSON API endpoints for the 555stream frontend to render approval UI.
 * Approvals are stored in SQLite via elizaOS plugin-sql.
 *
 * SECURITY: All routes require Bearer token authentication.
 */
import type { Route } from '../types/index.js';
import type { Approval } from '../types/index.js';
/**
 * Set the agent token for authentication
 * Called during plugin initialization
 */
export declare function setApprovalAuthToken(token: string): void;
/**
 * Create a new approval request
 */
export declare function createApprovalRequest(actionName: string, actionParams: Record<string, unknown>): Approval;
/**
 * Get approval by ID
 */
export declare function getApproval(id: string): Approval | undefined;
/**
 * Approve an approval request
 */
export declare function approveRequest(id: string, approvedBy?: string): Approval | undefined;
/**
 * Reject an approval request
 */
export declare function rejectRequest(id: string, rejectedBy?: string): Approval | undefined;
/**
 * List pending approvals
 */
export declare function listPendingApprovals(): Approval[];
/**
 * List all approvals (for history)
 */
export declare function listAllApprovals(limit?: number): Approval[];
/**
 * GET /555stream/approvals
 * List pending approvals
 */
export declare const listApprovalsRoute: Route;
/**
 * GET /555stream/approvals/history
 * List all approvals (including resolved)
 */
export declare const historyRoute: Route;
/**
 * GET /555stream/approvals/:id
 * Get single approval details
 */
export declare const getApprovalRoute: Route;
/**
 * POST /555stream/approvals/:id/approve
 * Approve an action
 */
export declare const approveRoute: Route;
/**
 * POST /555stream/approvals/:id/reject
 * Reject an action
 */
export declare const rejectRoute: Route;
/**
 * All approval routes
 */
export declare const approvalRoutes: Route[];
export default approvalRoutes;
//# sourceMappingURL=approvals.d.ts.map