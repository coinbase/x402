import { Network, SupportedStellarNetworks } from "../network";
import { StellarAssetAddressRegex } from "./regex";

export type StellarToken = {
  network: Network;
  name: string;
  symbol: string;
  address: `C${string}`;
  decimals: number;
};

const StellarTestnetTokenCatalog: Record<string, StellarToken> = {
  USDC: {
    network: "stellar-testnet",
    name: "USD Coin",
    symbol: "USDC",
    address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    decimals: 7,
  },
};

const StellarMainnetTokenCatalog: Record<string, StellarToken> = {
  USDC: {
    network: "stellar",
    name: "USD Coin",
    symbol: "USDC",
    address: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    decimals: 7,
  },
};

export const StellarTokenCatalogPerChain: Partial<Record<Network, Record<string, StellarToken>>> = {
  stellar: StellarMainnetTokenCatalog,
  "stellar-testnet": StellarTestnetTokenCatalog,
};

/**
 * Checks if the given object is a Stellar token
 *
 * @param value - The value to check if it is a Stellar token
 * @returns True if the value is a Stellar token, false otherwise
 */
export function isStellarToken(value: unknown): value is StellarToken {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const token = value as Partial<StellarToken>;

  return (
    typeof token.network === "string" &&
    SupportedStellarNetworks.includes(token.network as Network) &&
    typeof token.name === "string" &&
    typeof token.symbol === "string" &&
    typeof token.address === "string" &&
    StellarAssetAddressRegex.test(token.address) &&
    typeof token.decimals === "number"
  );
}
