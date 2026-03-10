/**
 * React context that provides the active chain configuration
 * and the list of enabled chains to wallet/inventory components.
 *
 * Wrap the relevant UI subtree with `<ChainProvider>` and call
 * `useChain()` inside any descendant to access chain config.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  CHAIN_CONFIGS,
  type ChainConfig,
  type ChainKey,
  PRIMARY_CHAIN_KEYS,
} from "./chainConfig";

/* ── Context value ─────────────────────────────────────────────────── */

export type ChainContextValue = {
  /** Currently active chain config. */
  activeChain: ChainConfig;
  /** All chains enabled in this app instance. */
  enabledChains: ChainConfig[];
  /** Switch the active chain. */
  setActiveChainKey: (key: ChainKey) => void;
};

const ChainContext = createContext<ChainContextValue | null>(null);

/* ── Provider ──────────────────────────────────────────────────────── */

export type ChainProviderProps = {
  /** Which chains to enable. Defaults to PRIMARY_CHAIN_KEYS. */
  enabledKeys?: ChainKey[];
  /** Initial active chain key. Defaults to the first enabled key. */
  defaultChainKey?: ChainKey;
  children: ReactNode;
};

export function ChainProvider({
  enabledKeys = PRIMARY_CHAIN_KEYS,
  defaultChainKey,
  children,
}: ChainProviderProps) {
  const enabledChains = useMemo(
    () => enabledKeys.map((k) => CHAIN_CONFIGS[k]).filter(Boolean),
    [enabledKeys],
  );

  const [activeKey, setActiveKey] = useState<ChainKey>(
    () => defaultChainKey ?? enabledKeys[0] ?? "bsc",
  );

  const setActiveChainKey = useCallback((key: ChainKey) => {
    if (CHAIN_CONFIGS[key]) setActiveKey(key);
  }, []);

  const value = useMemo<ChainContextValue>(
    () => ({
      activeChain: CHAIN_CONFIGS[activeKey],
      enabledChains,
      setActiveChainKey,
    }),
    [activeKey, enabledChains, setActiveChainKey],
  );

  return (
    <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
  );
}

/* ── Hook ──────────────────────────────────────────────────────────── */

/**
 * Access the current chain context.
 * Must be called inside a `<ChainProvider>`.
 */
export function useChain(): ChainContextValue {
  const ctx = useContext(ChainContext);
  if (!ctx) {
    throw new Error("useChain() must be used within a <ChainProvider>");
  }
  return ctx;
}
