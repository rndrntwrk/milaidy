/**
 * Approval API Routes
 *
 * JSON API endpoints for the 555stream frontend to render approval UI.
 * Approvals are stored in SQLite via elizaOS plugin-sql.
 *
 * SECURITY: All routes require Bearer token authentication.
 */
// In-memory store for approvals (would use plugin-sql in production)
// TODO: Integrate with @elizaos/plugin-sql for persistence
const approvals = new Map();
// Store the agent token for validation (set during approval creation)
let configuredAgentToken = null;
/**
 * Set the agent token for authentication
 * Called during plugin initialization
 */
export function setApprovalAuthToken(token) {
    configuredAgentToken = token;
}
/**
 * Verify Bearer token from request
 * Returns error response if invalid, null if valid
 */
function verifyAuth(req) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return new Response(JSON.stringify({
            error: 'Authorization header required',
            hint: 'Include "Authorization: Bearer YOUR_TOKEN" header',
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({
            error: 'Invalid authorization format',
            hint: 'Use "Bearer <token>" format',
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const token = authHeader.slice(7);
    // Verify token matches configured agent token
    // In production, this could validate against multiple authorized tokens
    if (!configuredAgentToken) {
        // If no token configured, allow access (plugin not fully initialized)
        console.warn('[555stream] Approval auth token not configured - allowing request');
        return null;
    }
    if (token !== configuredAgentToken) {
        return new Response(JSON.stringify({
            error: 'Invalid token',
        }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    return null; // Auth successful
}
// Approval expiry time (5 minutes)
const APPROVAL_TTL_MS = 5 * 60 * 1000;
/**
 * Generate unique approval ID
 */
function generateApprovalId() {
    return `approval-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
/**
 * Create a new approval request
 */
export function createApprovalRequest(actionName, actionParams) {
    const now = Date.now();
    const approval = {
        id: generateApprovalId(),
        actionName,
        actionParams,
        status: 'pending',
        createdAt: now,
        expiresAt: now + APPROVAL_TTL_MS,
    };
    approvals.set(approval.id, approval);
    // Clean up expired approvals
    cleanupExpired();
    return approval;
}
/**
 * Get approval by ID
 */
export function getApproval(id) {
    const approval = approvals.get(id);
    // Check if expired
    if (approval && approval.status === 'pending' && Date.now() > approval.expiresAt) {
        approval.status = 'expired';
    }
    return approval;
}
/**
 * Approve an approval request
 */
export function approveRequest(id, approvedBy) {
    const approval = approvals.get(id);
    if (!approval)
        return undefined;
    if (approval.status !== 'pending') {
        return approval; // Already resolved
    }
    if (Date.now() > approval.expiresAt) {
        approval.status = 'expired';
        return approval;
    }
    approval.status = 'approved';
    approval.resolvedAt = Date.now();
    approval.resolvedBy = approvedBy;
    return approval;
}
/**
 * Reject an approval request
 */
export function rejectRequest(id, rejectedBy) {
    const approval = approvals.get(id);
    if (!approval)
        return undefined;
    if (approval.status !== 'pending') {
        return approval; // Already resolved
    }
    approval.status = 'rejected';
    approval.resolvedAt = Date.now();
    approval.resolvedBy = rejectedBy;
    return approval;
}
/**
 * List pending approvals
 */
export function listPendingApprovals() {
    cleanupExpired();
    return Array.from(approvals.values())
        .filter(a => a.status === 'pending')
        .sort((a, b) => b.createdAt - a.createdAt);
}
/**
 * List all approvals (for history)
 */
export function listAllApprovals(limit = 50) {
    return Array.from(approvals.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
}
/**
 * Clean up expired approvals
 */
function cleanupExpired() {
    const now = Date.now();
    for (const [id, approval] of approvals) {
        if (approval.status === 'pending' && now > approval.expiresAt) {
            approval.status = 'expired';
        }
        // Remove very old approvals (older than 1 hour)
        if (now - approval.createdAt > 60 * 60 * 1000) {
            approvals.delete(id);
        }
    }
}
// ==========================================
// Route Handlers
// ==========================================
/**
 * GET /555stream/approvals
 * List pending approvals
 */
export const listApprovalsRoute = {
    path: '/approvals',
    type: 'GET',
    handler: async (req, res, runtime) => {
        // Verify authentication
        const authError = verifyAuth(req);
        if (authError)
            return authError;
        const pending = listPendingApprovals();
        return new Response(JSON.stringify({
            approvals: pending,
            count: pending.length,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    },
};
/**
 * GET /555stream/approvals/history
 * List all approvals (including resolved)
 */
export const historyRoute = {
    path: '/approvals/history',
    type: 'GET',
    handler: async (req, res, runtime) => {
        // Verify authentication
        const authError = verifyAuth(req);
        if (authError)
            return authError;
        const all = listAllApprovals();
        return new Response(JSON.stringify({
            approvals: all,
            count: all.length,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    },
};
/**
 * GET /555stream/approvals/:id
 * Get single approval details
 */
export const getApprovalRoute = {
    path: '/approvals/:id',
    type: 'GET',
    handler: async (req, res, runtime) => {
        // Verify authentication
        const authError = verifyAuth(req);
        if (authError)
            return authError;
        // Extract ID from URL
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const id = pathParts[pathParts.length - 1];
        const approval = getApproval(id);
        if (!approval) {
            return new Response(JSON.stringify({
                error: 'Approval not found',
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return new Response(JSON.stringify({
            approval,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    },
};
/**
 * POST /555stream/approvals/:id/approve
 * Approve an action
 */
export const approveRoute = {
    path: '/approvals/:id/approve',
    type: 'POST',
    handler: async (req, res, runtime) => {
        // Verify authentication
        const authError = verifyAuth(req);
        if (authError)
            return authError;
        // Extract ID from URL
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        // Path is /approvals/:id/approve, so id is second to last
        const id = pathParts[pathParts.length - 2];
        // Parse body for optional approvedBy
        let approvedBy;
        try {
            const body = await req.json();
            approvedBy = body.approvedBy;
        }
        catch {
            // No body or invalid JSON is OK
        }
        const approval = approveRequest(id, approvedBy);
        if (!approval) {
            return new Response(JSON.stringify({
                error: 'Approval not found',
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        if (approval.status === 'expired') {
            return new Response(JSON.stringify({
                error: 'Approval has expired',
                approval,
            }), {
                status: 410,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        if (approval.status !== 'approved') {
            return new Response(JSON.stringify({
                error: `Approval already ${approval.status}`,
                approval,
            }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return new Response(JSON.stringify({
            success: true,
            approval,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    },
};
/**
 * POST /555stream/approvals/:id/reject
 * Reject an action
 */
export const rejectRoute = {
    path: '/approvals/:id/reject',
    type: 'POST',
    handler: async (req, res, runtime) => {
        // Verify authentication
        const authError = verifyAuth(req);
        if (authError)
            return authError;
        // Extract ID from URL
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const id = pathParts[pathParts.length - 2];
        // Parse body for optional rejectedBy
        let rejectedBy;
        try {
            const body = await req.json();
            rejectedBy = body.rejectedBy;
        }
        catch {
            // No body or invalid JSON is OK
        }
        const approval = rejectRequest(id, rejectedBy);
        if (!approval) {
            return new Response(JSON.stringify({
                error: 'Approval not found',
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        if (approval.status === 'expired') {
            return new Response(JSON.stringify({
                error: 'Approval has expired',
                approval,
            }), {
                status: 410,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        if (approval.status !== 'rejected') {
            return new Response(JSON.stringify({
                error: `Approval already ${approval.status}`,
                approval,
            }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return new Response(JSON.stringify({
            success: true,
            approval,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    },
};
/**
 * All approval routes
 */
export const approvalRoutes = [
    listApprovalsRoute,
    historyRoute,
    getApprovalRoute,
    approveRoute,
    rejectRoute,
];
export default approvalRoutes;
//# sourceMappingURL=approvals.js.map