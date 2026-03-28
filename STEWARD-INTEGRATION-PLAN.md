# Steward Full Integration Plan — PR #1442

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Milady Desktop App                │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │   Chat    │  │ Wallets  │  │   Settings     │ │
│  │          │  │ Tab      │  │ > Policies     │ │
│  │ Agent    │  │ Balances │  │ > Address Ctrl │ │
│  │ actions  │  │ Tx Hist  │  │ > Rate Limits  │ │
│  │ trigger  │  │ Approvals│  │               │ │
│  │ txs      │  │ Trading  │  │               │ │
│  └────┬─────┘  └────┬─────┘  └───────┬────────┘ │
│       │              │                │           │
│  ┌────▼──────────────▼────────────────▼────────┐ │
│  │           Milady API (server.ts)             │ │
│  │  /api/wallet/*  — steward bridge routes      │ │
│  └────────────────────┬─────────────────────────┘ │
└───────────────────────┼───────────────────────────┘
                        │ HTTP
┌───────────────────────▼───────────────────────────┐
│              Steward Sidecar (port 7700)           │
│                                                     │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ │
│  │  Vault   │ │  Policy  │ │Approval │ │Webhook │ │
│  │ encrypt  │ │  Engine  │ │  Queue  │ │Dispatch│ │
│  │ keys     │ │ evaluate │ │ pending │ │        │ │
│  │ sign tx  │ │ rules    │ │ approve │ │        │ │
│  └─────────┘ └──────────┘ └─────────┘ └────────┘ │
│                                                     │
│  Supported: ETH, Base, BSC, Arb, OP, Polygon,     │
│             Avalanche, Solana                       │
└─────────────────────────────────────────────────────┘
```

## Workstreams (5 parallel workers)

### Worker 1: Steward Wallet Provider (wallet.ts integration)
**Files:**
- `packages/agent/src/api/wallet.ts`
- `packages/agent/src/api/wallet-routes.ts`
- `packages/app-core/src/api/steward-bridge.ts`

**What:**
- Add `StewardWalletProvider` — when `STEWARD_API_URL` is set, wallet ops go through steward
- `getWalletAddresses()` → if steward configured, fetch from `GET /agents/:agentId` (has `.walletAddresses.evm` + `.walletAddresses.solana`)
- `getBalance()` → proxy to steward `GET /agents/:agentId/balance?chainId=X`
- `getTokenBalances()` → proxy to steward `GET /agents/:agentId/tokens?chainId=X`
- Keep existing direct-key path as fallback when steward isn't configured
- Add bridge functions: `getStewardBalance()`, `getStewardTokens()` to steward-bridge.ts

### Worker 2: Transaction Signing via Steward (the critical path)
**Files:**
- `packages/app-core/src/api/server.ts` (new routes)
- `packages/app-core/src/api/steward-bridge.ts` (new functions)
- `packages/app-core/src/actions/transfer-token.ts`

**What:**
- Add `/api/wallet/steward-sign` route that proxies to steward `POST /vault/:agentId/sign`
- Sign request format: `{ to, value, chainId, data?, broadcast? }`
- Steward handles: policy check → sign → broadcast (or queue for approval)
- Response: `{ txHash }` on success, `{ pending: true, txId }` if needs approval, `{ denied: true, reason }` if policy blocks
- Wire `transfer-token` action to use steward signing when available
- Add `signViaSteward()` function to steward-bridge

### Worker 3: BSC Trading via Steward
**Files:**
- `packages/app-core/src/components/BscTradePanel.tsx`
- `packages/app-core/src/api/server.ts` (trade routes)
- `packages/agent/src/api/wallet-trade-routes.ts`

**What:**
- When steward is connected, BSC trades route through steward vault signing
- Swap flow: milady builds the unsigned tx → sends to steward for signing + broadcast
- Steward evaluates policies on the swap (spending limits, rate limits)
- If approved → signs with vault key, broadcasts, returns hash
- If needs approval → queues, UI shows in approval tab
- Keep direct-key trading as fallback

### Worker 4: Real-time Approval Flow + Webhooks
**Files:**
- `packages/app-core/src/api/server.ts` (webhook receiver route)
- `packages/app-core/src/components/steward/ApprovalQueue.tsx`
- `packages/app-core/src/components/steward/TransactionHistory.tsx`
- `packages/app-core/src/state/AppContext.tsx`

**What:**
- Add `/api/wallet/steward-webhook` POST endpoint that steward calls when tx events happen
- Events: `tx.pending`, `tx.approved`, `tx.denied`, `tx.confirmed`
- Wire approval queue to poll + receive webhook pushes
- Approve button → `POST /vault/:agentId/approve/:txId` via bridge
- Deny button → `POST /vault/:agentId/reject/:txId` via bridge
- Show real-time status updates in transaction history
- Register webhook URL with steward tenant config on startup

### Worker 5: Onboarding + Steward Auto-Setup
**Files:**
- `packages/app-core/src/services/steward-sidecar.ts`
- `packages/app-core/src/services/steward-sidecar/wallet-setup.ts`
- `packages/agent/src/runtime/eliza.ts` (or wherever agent bootstrap happens)

**What:**
- On first launch, if `STEWARD_LOCAL=1` (desktop mode):
  - Start steward sidecar (already implemented)
  - Auto-create tenant + agent
  - Store credentials in `~/.milady/steward-credentials.json`
  - Set env vars for the session
- On cloud mode:
  - Steward runs as infrastructure
  - Agent gets steward credentials from cloud provisioning
- Migration path: if user has existing plaintext keys, offer to import into steward vault
- Show steward status in the Wallets tab header (connected, addresses, vault health)

## Steward API Reference (for workers)

### Vault Routes (auth: X-Steward-Tenant + X-Steward-Key)
```
POST   /vault/:agentId/sign           — Sign + broadcast EVM tx
POST   /vault/:agentId/sign-solana    — Sign + broadcast Solana tx  
POST   /vault/:agentId/sign-typed-data — EIP-712 signing
POST   /vault/:agentId/rpc            — Raw JSON-RPC proxy
POST   /vault/:agentId/approve/:txId  — Approve pending tx
POST   /vault/:agentId/reject/:txId   — Reject pending tx
GET    /vault/:agentId/pending        — List pending approvals
GET    /vault/:agentId/history        — Transaction history
```

### Agent Routes
```
POST   /agents                        — Create agent (returns wallet addresses)
GET    /agents                        — List agents
GET    /agents/:agentId               — Get agent details + addresses
DELETE /agents/:agentId               — Delete agent + keys
GET    /agents/:agentId/balance       — Native balance (chainId param)
GET    /agents/:agentId/tokens        — Token balances (chainId param)
GET    /agents/:agentId/policies      — Get policies
PUT    /agents/:agentId/policies      — Set policies
POST   /agents/:agentId/token         — Generate agent JWT
```

### Sign Request Format
```json
{
  "to": "0x...",
  "value": "1000000000000000",  // wei
  "chainId": 56,                 // BSC
  "data": "0x...",               // optional calldata
  "broadcast": true,             // true = sign+send, false = sign only
  "description": "Swap BNB for USDT"  // for audit log
}
```

### Policy Evaluation Response
```json
{
  "approved": false,
  "requiresManualApproval": true,
  "violations": [
    { "policy": "spending-limit", "reason": "Exceeds daily limit of $500" }
  ]
}
```

## Worker Dependencies
- Workers 1-3 are independent (can run in parallel)
- Worker 4 depends on Worker 2 (needs sign route for approve/deny)
- Worker 5 is independent but should run after Worker 1

## Test Plan
After all workers complete:
1. Start steward sidecar locally
2. Start milady with steward env vars
3. Verify steward shows connected in Wallets tab
4. Set policies in Settings > Wallet Policies
5. Try a transfer → should route through steward
6. Set a low spending limit → try to exceed it → should queue for approval
7. Approve/deny from the approval tab
8. Check transaction history shows all activity
