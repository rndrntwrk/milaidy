---
title: "Solana Plugin"
sidebarTitle: "Solana"
description: "Solana chain connector for Milady — SOL and SPL token transfers, swaps, NFTs, and Solana DeFi protocols."
---

The Solana plugin enables Milady agents to interact with the Solana blockchain — managing SOL and SPL tokens, executing swaps via Jupiter, minting NFTs, and interacting with Solana DeFi protocols.

**Package:** `@elizaos/plugin-solana` (community)

## Overview

The Solana plugin provides the agent with a Solana keypair wallet and a set of on-chain actions for the most common Solana operations, including Jupiter-based token swaps, NFT management, and SPL token transfers.

## Installation

```bash
milady plugins install solana
```

## Auto-Enable

The plugin auto-enables when `HELIUS_API_KEY` is set (this is the `envKey` in `plugins.json`).

## Configuration

| Environment Variable | Required | Description |
|---------------------|----------|-------------|
| `SOL_ADDRESS` | Yes | Mint/contract address for native SOL in token swap logic |
| `SLIPPAGE` | Yes | Maximum acceptable slippage for swaps/transactions |
| `HELIUS_API_KEY` | Yes | Helius API key for Solana infrastructure services |
| `BIRDEYE_API_KEY` | Yes | Birdeye API key for market data services |
| `SOLANA_PRIVATE_KEY` | No | Base58 or base64-encoded private key for the agent's wallet |
| `WALLET_PRIVATE_KEY` | No | Alternative name for the Solana wallet private key |
| `WALLET_SECRET_KEY` | No | Base58-encoded wallet secret key (alternative to `WALLET_SECRET_SALT`) |
| `WALLET_SECRET_SALT` | No | Salt used to derive the wallet secret key |
| `WALLET_PUBLIC_KEY` | No | Base58-encoded wallet public key |
| `SOLANA_PUBLIC_KEY` | No | Alternative name for the wallet public key |
| `SOLANA_RPC_URL` | No | RPC endpoint (default: `https://api.mainnet-beta.solana.com`) |

```json
{
  "settings": {
    "secrets": {
      "SOLANA_PRIVATE_KEY": "your-base58-private-key",
      "HELIUS_API_KEY": "your-helius-key",
      "BIRDEYE_API_KEY": "your-birdeye-key"
    }
  }
}
```

## Supported Networks

| Network | RPC URL |
|---------|---------|
| Mainnet Beta | `https://api.mainnet-beta.solana.com` |
| Devnet | `https://api.devnet.solana.com` |
| Testnet | `https://api.testnet.solana.com` |
| Helius (enhanced) | `https://mainnet.helius-rpc.com/?api-key=...` |

## Actions

| Action | Description |
|--------|-------------|
| `TRANSFER_SOL` | Send SOL to an address or `.sol` domain |
| `TRANSFER_SPL_TOKEN` | Send SPL tokens to an address |
| `SWAP_TOKENS` | Swap tokens via Jupiter aggregator |
| `GET_BALANCE` | Check SOL and SPL token balances |
| `MINT_NFT` | Mint a new NFT using Metaplex |
| `SEND_TRANSACTION` | Send a raw Solana transaction |
| `GET_TRANSACTION` | Look up a transaction by signature |
| `STAKE_SOL` | Stake SOL with a validator |
| `CREATE_TOKEN` | Create a new SPL token mint |

## Providers

| Provider | Description |
|----------|-------------|
| `solanaWalletBalance` | Current SOL and SPL token balances |
| `solanaWalletAddress` | The agent's public key |
| `solanaNFTs` | NFTs held in the agent's wallet |

## Jupiter Swaps

Token swaps route through Jupiter, Solana's leading DEX aggregator. Jupiter finds the best price across all Solana DEXes including Raydium, Orca, Whirlpool, and others.

```
User: "Swap 100 USDC for SOL"
       ↓
Plugin fetches Jupiter quote
       ↓
Best route selected automatically
       ↓
Transaction built and signed
       ↓
Transaction submitted and confirmed
       ↓
Agent reports result
```

## SPL Token Support

The plugin works with any SPL token. Common tokens:

| Token | Mint Address |
|-------|-------------|
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| SOL (wrapped) | `So11111111111111111111111111111111111111112` |
| JTO | `jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL` |

## NFT Support

The plugin uses Metaplex for NFT operations:

```
User: "Mint an NFT with the image at https://example.com/art.png"
       ↓
Plugin uploads metadata to Arweave/IPFS
       ↓
Metaplex mints the NFT to the agent's wallet
       ↓
Agent reports mint address and transaction signature
```

## Security Considerations

- The private key grants full control of the agent's Solana wallet. Store it securely using the [Secrets Manager Plugin](/plugin-registry/secrets-manager).
- Use a dedicated agent wallet with limited funds.
- Test on Devnet before deploying to mainnet.

## Devnet Configuration

```json
{
  "settings": {
    "secrets": {
      "SOLANA_PRIVATE_KEY": "your-base58-private-key",
      "SOLANA_RPC_URL": "https://api.devnet.solana.com"
    }
  }
}
```

Airdrop devnet SOL for testing:

```bash
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

## Related

- [EVM Plugin](/plugin-registry/defi/evm) — Ethereum and EVM chain integration
- [Secrets Manager Plugin](/plugin-registry/secrets-manager) — Secure key storage
- [Wallet Guide](/guides/wallet) — Wallet setup and management
