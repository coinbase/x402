/**
 * x402 Protocol Constants
 *
 * These are the public constants for consumers of the @x402/contracts package.
 */

/**
 * Canonical Permit2 contract address
 * Same address on all EVM chains via CREATE2 deployment
 * @see https://github.com/Uniswap/permit2
 */
export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/**
 * x402Permit2Proxy contract address (same on all chains via CREATE2)
 *
 * Vanity address starting with 0x4020 for easy recognition.
 *
 * This address is deterministic based on:
 * - Arachnid's deterministic deployer (0x4e59b44847b379578588920cA78FbF26c0B4956C)
 * - Salt derived from: "x402-x402permit2proxy-v95348"
 * - Contract bytecode + constructor args (PERMIT2_ADDRESS)
 *
 * Run `pnpm compute-address` to verify this address.
 */
export const X402_PERMIT2_PROXY_ADDRESS =
  "0x40203F636c4EDFaFc36933837FFB411e1c031B50" as const;
