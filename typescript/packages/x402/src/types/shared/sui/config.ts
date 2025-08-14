import { SuiTokenAmount } from "../..";
import { Network } from "../network";

export const config: Record<string, NetworkConfig> = {
  "sui-testnet": {
    usdcCoinType: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  },
  sui: {
    usdcCoinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  },
};

export type NetworkConfig = {
  usdcCoinType: string;
};

/**
 * Gets the USDC asset for the given network
 *
 * @param network - The network to get the USDC asset for
 * @returns The USDC asset
 */
export function getSuiUsdcAsset(network: Network): SuiTokenAmount["asset"] {
  const networkConfig = config[network];

  if (!networkConfig) {
    throw new Error(`Unable to get USDC asset on ${network}`);
  }
  return {
    address: networkConfig.usdcCoinType,
    coinType: networkConfig.usdcCoinType,
    decimals: 6,
  };
}
