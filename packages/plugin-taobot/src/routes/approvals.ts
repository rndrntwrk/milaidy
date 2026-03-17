/**
 * TaoBot approval routes — gatekeeper for destructive operations
 * like going live, stopping streams, and high-value wagers.
 */

const pendingApprovals = new Map<string, { action: string; payload: unknown; timestamp: number }>();
let authToken: string | undefined;

export function setApprovalAuthToken(token: string): void {
  authToken = token;
}

export function createApprovalRequest(action: string, payload: unknown): string {
  const id = `taobot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pendingApprovals.set(id, { action, payload, timestamp: Date.now() });
  return id;
}

export function getApproval(id: string) {
  return pendingApprovals.get(id) ?? null;
}

export function approveRequest(id: string): boolean {
  return pendingApprovals.delete(id);
}

export function rejectRequest(id: string): boolean {
  return pendingApprovals.delete(id);
}

/** Express-style route handlers for the /taobot/ namespace */
export const approvalRoutes = [
  {
    method: 'GET',
    path: '/taobot/approvals',
    handler: (_req: unknown, res: any) => {
      const entries = Array.from(pendingApprovals.entries()).map(([id, data]) => ({ id, ...data }));
      res.json({ approvals: entries });
    },
  },
  {
    method: 'POST',
    path: '/taobot/approvals/:id/approve',
    handler: (req: any, res: any) => {
      const ok = approveRequest(req.params.id);
      res.json({ approved: ok });
    },
  },
  {
    method: 'POST',
    path: '/taobot/approvals/:id/reject',
    handler: (req: any, res: any) => {
      const ok = rejectRequest(req.params.id);
      res.json({ rejected: ok });
    },
  },
];
