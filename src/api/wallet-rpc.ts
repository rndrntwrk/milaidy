import type { MiladyConfig } from "../config/config";

export const DEFAULT_PUBLIC_BSC_RPC_URLS = [
  "https://bsc-dataseed1.binance.org/",
] as const;
export const DEFAULT_PUBLIC_ETHEREUM_RPC_URLS = [
  "https://ethereum.publicnode.com/",
] as const;
export const DEFAULT_PUBLIC_BASE_RPC_URLS = [
  "https://base.publicnode.com/",
] as const;
export const DEFAULT_PUBLIC_AVALANCHE_RPC_URLS = [
  "https://avalanche.publicnode.com/ext/bc/C/rpc",
] as const;
export const DEFAULT_PUBLIC_SOLANA_RPC_URLS = [
  "https://api.mainnet-beta.solana.com",
] as const;

interface WalletRpcResolutionOptions {
  cloudManagedAccess?: boolean | null;
}

export interface WalletRpcReadiness {
  cloudManagedAccess: boolean;
  managedBscRpcReady: boolean;
  evmBalanceReady: boolean;
  solanaBalanceReady: boolean;
  bscRpcUrls: string[];
  ethereumRpcUrls: string[];
  baseRpcUrls: string[];
  avalancheRpcUrls: string[];
  solanaRpcUrls: string[];
}

export function normalizeRpcUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function uniqueRpcUrls(
  ...groups: Array<ReadonlyArray<string | null | undefined>>
): string[] {
  return [
    ...new Set(
      groups
        .flat()
        .map((url) => normalizeRpcUrl(url))
        .filter((url): url is string => Boolean(url)),
    ),
  ];
}

export function hasMiladyCloudRpcAccess(
  config?: Pick<MiladyConfig, "cloud"> | null,
): boolean {
  return Boolean(
    config?.cloud?.apiKey?.trim() || process.env.ELIZAOS_CLOUD_API_KEY?.trim(),
  );
}

export function resolveBscRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [
      process.env.NODEREAL_BSC_RPC_URL,
      process.env.QUICKNODE_BSC_RPC_URL,
      process.env.BSC_RPC_URL,
    ],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_BSC_RPC_URLS : [],
  );
}

export function resolveEthereumRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [process.env.ETHEREUM_RPC_URL],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_ETHEREUM_RPC_URLS : [],
  );
}

export function resolveBaseRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [process.env.BASE_RPC_URL],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_BASE_RPC_URLS : [],
  );
}

export function resolveAvalancheRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [process.env.AVALANCHE_RPC_URL],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_AVALANCHE_RPC_URLS : [],
  );
}

export function resolveSolanaRpcUrls(
  options: WalletRpcResolutionOptions = {},
): string[] {
  return uniqueRpcUrls(
    [process.env.SOLANA_RPC_URL],
    options.cloudManagedAccess ? DEFAULT_PUBLIC_SOLANA_RPC_URLS : [],
  );
}

export function resolveWalletRpcReadiness(
  config?: Pick<MiladyConfig, "cloud"> | null,
): WalletRpcReadiness {
  const cloudManagedAccess = hasMiladyCloudRpcAccess(config);
  const bscRpcUrls = resolveBscRpcUrls({ cloudManagedAccess });
  const ethereumRpcUrls = resolveEthereumRpcUrls({ cloudManagedAccess });
  const baseRpcUrls = resolveBaseRpcUrls({ cloudManagedAccess });
  const avalancheRpcUrls = resolveAvalancheRpcUrls({ cloudManagedAccess });
  const solanaRpcUrls = resolveSolanaRpcUrls({ cloudManagedAccess });

  return {
    cloudManagedAccess,
    managedBscRpcReady: bscRpcUrls.length > 0,
    evmBalanceReady: Boolean(
      process.env.ALCHEMY_API_KEY?.trim() ||
        process.env.ANKR_API_KEY?.trim() ||
        bscRpcUrls.length > 0 ||
        ethereumRpcUrls.length > 0 ||
        baseRpcUrls.length > 0 ||
        avalancheRpcUrls.length > 0,
    ),
    solanaBalanceReady: Boolean(
      process.env.HELIUS_API_KEY?.trim() || solanaRpcUrls.length > 0,
    ),
    bscRpcUrls,
    ethereumRpcUrls,
    baseRpcUrls,
    avalancheRpcUrls,
    solanaRpcUrls,
  };
}
