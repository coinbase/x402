// packages/x402/src/verify/detectEip3009.ts
import type { Address, Hex, PublicClient } from "viem";

/**
 * Checks whether a token implements EIP-3009 (transferWithAuthorization).
 * Strategy:
 * 1) If an Etherscan-like API key is available → fetch ABI and search for the function.
 * 2) Otherwise → fallback heuristic via eth_call (presence test on the selector).
 *
 * Note: This function is best-effort. Some contracts may proxy/upgrade or obfuscate interfaces.
 * Always treat this as a hint, not a cryptographic guarantee.
 *
 * @param client - PublicClient instance used for network calls
 * @param token - ERC-20 token address
 * @param opts - Optional configuration
 * @param opts.etherscanApiUrl - Etherscan-like API base URL (e.g. https://api.bscscan.com/api)
 * @param opts.etherscanApiKey - API key for Etherscan-like service (recommended)
 * @returns Promise resolving to true if EIP-3009 is likely supported, false otherwise
 */
export async function supportsEip3009(
  client: PublicClient,
  token: Address,
  opts?: {
    /// e.g. "https://api.bscscan.com/api"
    etherscanApiUrl?: string;
    /// API key for Etherscan/BscScan (optional, but recommended)
    etherscanApiKey?: string;
  },
): Promise<boolean> {
  // 1) Try via Etherscan/BscScan ABI
  try {
    const chainId: number | undefined = (client as unknown as { chain?: { id?: number } })?.chain
      ?.id;
    const apiUrl = opts?.etherscanApiUrl ?? inferEtherscanLikeApiUrl(chainId);
    const apiKey =
      opts?.etherscanApiKey ?? process.env.BSCSCAN_API_KEY ?? process.env.ETHERSCAN_API_KEY;

    if (apiUrl && apiKey) {
      const has = await checkAbiForEip3009(apiUrl, apiKey, token);
      if (typeof has === "boolean") return has;
    }
  } catch {
    // ignore and continue to fallback
  }

  // 2) Fallback: presence test via eth_call
  try {
    const data = encodeTransferWithAuthorizationZeroArgs();
    // Simulated call – does not change state
    await client.call({ to: token, data });
    // If the call did not revert (rare for this function), assume it exists
    return true;
  } catch (err: unknown) {
    // Heuristics based on revert data/message
    const e = err as { shortMessage?: string; message?: string; data?: Hex } | undefined;
    const msg = (e?.shortMessage || e?.message || "").toLowerCase();
    const revertData: Hex | undefined = e?.data;

    // No data / "selector not recognized" → function likely does not exist
    if (
      msg.includes("selector was not recognized") ||
      msg.includes("execution reverted with no data") ||
      msg.includes("function does not exist") ||
      !revertData ||
      (typeof revertData === "string" && revertData.length < 10)
    ) {
      return false;
    }

    // Some revert data present → likely the function exists
    return true;
  }
}

/** ----- helpers ----- */

/**
 * Infers an Etherscan-like API base URL from a given chain id.
 *
 * @param chainId - EVM chain id (e.g., 56 for BSC mainnet)
 * @returns the API base URL or undefined if not recognized
 */
function inferEtherscanLikeApiUrl(chainId?: number): string | undefined {
  if (chainId === 56) return "https://api.bscscan.com/api"; // BSC mainnet
  if (chainId === 97) return "https://api-testnet.bscscan.com/api"; // BSC testnet
  if (chainId === 1) return "https://api.etherscan.io/api"; // Ethereum
  if (chainId === 137) return "https://api.polygonscan.com/api"; // Polygon
  if (chainId === 43114) return "https://api.snowtrace.io/api"; // Avalanche
  if (chainId === 42161) return "https://api.arbiscan.io/api"; // Arbitrum
  return undefined;
}

/**
 *
 * @param apiUrl
 * @param apiKey
 * @param token
 */
/**
 * Queries an Etherscan-like API for a token ABI and checks if it contains
 * the EIP-3009 function signature `transferWithAuthorization` with 9 inputs.
 *
 * @param apiUrl - Etherscan-like API base URL
 * @param apiKey - API key for the service
 * @param token - token contract address
 * @returns true/false if determined, or undefined if undeterminable (e.g. error)
 */
async function checkAbiForEip3009(
  apiUrl: string,
  apiKey: string,
  token: Address,
): Promise<boolean | undefined> {
  const url = new URL(apiUrl);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getabi");
  url.searchParams.set("address", token);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) return undefined;
  const json = await res.json();
  // Etherscan-like response: { status, message, result }
  if (!json?.result) return undefined;

  let abi: unknown;
  try {
    abi = typeof json.result === "string" ? JSON.parse(json.result) : json.result;
  } catch {
    return undefined;
  }

  const sig = "transferWithAuthorization";
  if (!Array.isArray(abi)) return undefined;
  return (abi as Array<{ type?: string; name?: string; inputs?: unknown[] }>).some(
    item =>
      item?.type === "function" &&
      item?.name === sig &&
      Array.isArray(item?.inputs) &&
      item.inputs.length === 9, // (address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
  );
}

/**
 * Encodes the selector + zeroed arguments for:
 * transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
 * This payload is used solely for presence-testing in eth_call.
 *
 * @returns Hex-encoded calldata used for the heuristic call
 */
function encodeTransferWithAuthorizationZeroArgs(): Hex {
  // Keccak256("transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)")
  const selector: Hex = "0x7f4f2d5e"; // 4 bytes
  // 9 arguments × 32 bytes each
  const zeros = "0".repeat(64 * 9);
  return (selector + zeros) as Hex;
}
