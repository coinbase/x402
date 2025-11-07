/**
 * WagmiProvider wrapper with proper TypeScript types
 * Fixes type compatibility issues between wagmi and React types
 */

import type { FC, ReactNode } from "react";
import { WagmiProvider as OriginalWagmiProvider } from "wagmi";
import type { Config } from "wagmi";

export interface WagmiProviderWrapperProps {
  children: ReactNode;
  config: Config;
}

export const WagmiProviderWrapper: FC<WagmiProviderWrapperProps> =
  OriginalWagmiProvider as FC<WagmiProviderWrapperProps>;
