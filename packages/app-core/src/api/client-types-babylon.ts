/** Babylon terminal API response types. */

export interface BabylonAgentStatus {
  id: string;
  name: string;
  displayName?: string;
  avatar?: string;
  balance: number;
  lifetimePnL: number;
  winRate: number;
  reputationScore: number;
  totalTrades: number;
  autonomous: boolean;
  autonomousTrading?: boolean;
  autonomousPosting?: boolean;
  autonomousCommenting?: boolean;
  autonomousDMs?: boolean;
  lastTickAt?: string;
  lastChatAt?: string;
  agentStatus?: string;
  errorMessage?: string;
}

export type BabylonActivityType =
  | "trade"
  | "post"
  | "comment"
  | "message"
  | "social";

export interface BabylonActivityItem {
  id: string;
  type: BabylonActivityType;
  timestamp: string;
  agent?: { id: string; name: string };
  /** One-line summary of the action. */
  summary?: string;
  /** Trade-specific fields. */
  marketType?: string;
  marketId?: string;
  ticker?: string;
  action?: string;
  side?: string;
  amount?: number;
  price?: number;
  pnl?: number;
  reasoning?: string;
  /** Post/comment-specific fields. */
  contentPreview?: string;
  postId?: string;
  parentCommentId?: string;
}

export interface BabylonActivityFeed {
  items: BabylonActivityItem[];
  total: number;
}

export interface BabylonLogEntry {
  id?: string;
  timestamp: string;
  type: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface BabylonTeamAgent {
  id: string;
  name: string;
  displayName?: string;
  balance: number;
  lifetimePnL: number;
  winRate: number;
  reputationScore: number;
  totalTrades: number;
  autonomous: boolean;
  agentStatus?: string;
  lastTickAt?: string;
  recentLogsCount?: number;
  recentErrorsCount?: number;
}

export interface BabylonTeamResponse {
  agents: BabylonTeamAgent[];
  externalAgents?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export interface BabylonChatResponse {
  ok: boolean;
  message?: string;
}

export interface BabylonToggleResponse {
  ok: boolean;
  agentId: string;
  autonomous: boolean;
}

export interface BabylonWallet {
  balance: number;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    timestamp: string;
  }>;
}

export interface BabylonTeamChatInfo {
  success: boolean;
  teamChat?: {
    id: string;
    chatId: string;
    groupId: string;
    agents: Array<{ id: string; name: string }>;
    agentCount: number;
  };
}
