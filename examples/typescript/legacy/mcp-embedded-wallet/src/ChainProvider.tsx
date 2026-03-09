import { createContext, useContext, ReactNode } from "react";
import { Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

export type SupportedChainId = "base" | "base-sepolia";

type ChainContextType = Chain;

const ChainContext = createContext<ChainContextType | undefined>(undefined);

interface ChainProviderProps {
  children: ReactNode;
  chain: SupportedChainId;
}

/**
 * Provider component that manages the current blockchain chain context.
 * Makes the selected chain configuration available to child components.
 *
 * @param root0 - Component props
 * @param root0.children - Child components that will have access to the chain context
 * @param root0.chain - The selected chain identifier (base or base-sepolia)
 * @returns {JSX.Element} The provider component with its children
 */
export function ChainProvider({ children, chain }: ChainProviderProps) {
  const viemChain: Chain = chain === "base" ? base : baseSepolia;

  return <ChainContext.Provider value={viemChain}>{children}</ChainContext.Provider>;
}

/**
 * Hook to access the current blockchain chain configuration from the ChainProvider context.
 * Must be used within a ChainProvider component.
 *
 * @returns {Chain} The current chain configuration
 * @throws {Error} If used outside of a ChainProvider
 */
export function useChain(): ChainContextType {
  const context = useContext(ChainContext);
  if (context === undefined) {
    throw new Error("useChain must be used within a ChainProvider");
  }
  return context;
}
