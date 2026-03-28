# Steward-First Wallet Integration

## Vision
Steward IS the wallet layer. Not an addon, not a sidecar option. Every wallet operation goes through steward. Local plaintext keys are deprecated.

## What changes

### 1. Remove local key management from the happy path
- `wallet.ts`: `getWalletAddresses()` returns steward addresses as primary
- `wallet-routes.ts`: generate/import routes create steward agents, not env var keys
- Settings > Wallet & RPC: no more "import private key" when steward is running
- The `EVM_PRIVATE_KEY` / `SOLANA_PRIVATE_KEY` env vars become a legacy fallback only

### 2. Settings page: steward-centric
- "Wallet & RPC" section → "Wallet" section
  - Shows steward vault addresses (EVM + Solana)
  - "Fund wallet" with QR code + copy address
  - Link to policies
  - RPC settings stay (for custom RPC endpoints)
- "Wallet Policies" section stays, already good
- Remove/hide the plaintext key import UI when steward is connected

### 3. Wallets tab: clean single-wallet view
- Remove "Local wallet: 0xabc" vs "Steward vault: 0x123" duality
- Just show THE wallet addresses (which come from steward)
- Balances fetched through steward when possible, direct RPC as fallback
- Trade panel works same as before but signs through steward vault

### 4. Eliza Cloud: steward replaces Privy
- Cloud-provisioned agents get steward agents automatically
- No more Privy wallet creation
- Cloud dashboard wallet section uses steward APIs
- `privy-wallets.ts` → deprecated, steward is the provider

### 5. Transaction flow (all paths)
```
Agent action / User trade / Autonomous tx
    ↓
Steward policy engine
    ↓
Approved? → Sign with vault key → Broadcast → Return tx hash
Denied?   → Return violation reason
Pending?  → Queue for user approval → Approve/Deny in UI
```

## Workstreams

### W1: Wallet provider refactor
- `wallet.ts`: steward-first address resolution
- `wallet-routes.ts`: generate = create steward agent, import = import into vault
- Remove `EVM_PRIVATE_KEY` / `SOLANA_PRIVATE_KEY` as primary path

### W2: Settings page cleanup
- Simplify Wallet & RPC section
- Hide key import when steward connected
- Show steward addresses prominently
- Remove Eliza Cloud wallet toggles (steward handles it)

### W3: Wallets tab simplification
- Remove dual-wallet display
- Single address set from steward
- Clean balance view
- Trade panel unchanged (already routes through steward)

### W4: Cloud integration (Privy → Steward)
- `privy-wallets.ts` → wrap or replace with steward
- Cloud provisioning creates steward agent
- Cloud dashboard uses steward wallet data

### W5: Cleanup
- Remove dead code paths
- Remove "plaintext key" warnings (steward encrypts by default)
- Update all wallet-related copy
- Remove preview popups and unnecessary modals
