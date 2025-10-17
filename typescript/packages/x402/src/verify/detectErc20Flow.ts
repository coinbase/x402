// packages/x402/src/verify/detectErc20Flow.ts
import type { Address, PublicClient } from "viem";
import type { Chain } from "viem/chains";
import { createPublicClient, http } from "viem";
import { erc20Abi } from "viem";
import { supportsEip3009 } from "./detectEip3009";

export type Erc20FlowKind = "eip3009" | "pull";

export type DetectFlowOptions = {
  /**
   * Optional Etherscan-like endpoint (e.g., BscScan) used by supportsEip3009().
   * If omitted, the helper tries to infer from chainId.
   */
  etherscanApiUrl?: string;
  /** Etherscan/BscScan API key (recommended, improves ABI detection). */
  etherscanApiKey?: string;
  /**
   * If true, still prefer pull-flow when the spender already has enough allowance
   * (useful to avoid changing your client when user already approved previously).
   * Default: false (prefer EIP-3009 when available).
   */
  preferPullIfAllowanceSufficient?: boolean;
};

export type DetectFlowResult = {
  kind: Erc20FlowKind;
  reason: "HAS_EIP3009" | "NO_EIP3009" | "ALLOWANCE_READY";
  /** For pull-flow, you usually need spender; we return it when passed to detect. */
  suggestedSpender?: Address;
};

/**
 * Detects the best payment flow for an ERC-20 token on a given chain:
 * - If the token implements EIP-3009 (transferWithAuthorization) → "eip3009".
 * - Otherwise → "pull" (approve → transferFrom).
 * Optionally checks allowance and can prefer pull when allowance already covers the amount.
 *
 * @param client - viem PublicClient
 * @param token - ERC-20 token address
 * @param opts - optional detection options
 * @returns detection result containing flow kind and reason
 */
export async function detectErc20PaymentFlow(
  client: PublicClient,
  token: Address,
  opts?: DetectFlowOptions & {
    /** When set, we’ll check current allowance user→spender to optionally prefer pull-flow. */
    owner?: Address;
    spender?: Address;
    /** Amount (atomic units) the payment needs (for allowance check). */
    amountAtomic?: bigint;
  },
): Promise<DetectFlowResult> {
  // 1) Check EIP-3009 support (Circle-style gasless transfers).
  const has3009 = await supportsEip3009(client, token, {
    etherscanApiUrl: opts?.etherscanApiUrl,
    etherscanApiKey: opts?.etherscanApiKey,
  });

  // 2) If we have both owner+spender+amount, we can optionally prefer existing allowance.
  if (
    opts?.owner &&
    opts?.spender &&
    typeof opts.amountAtomic === "bigint" &&
    opts?.preferPullIfAllowanceSufficient
  ) {
    try {
      const allowance = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [opts.owner, opts.spender],
      });
      if ((allowance as bigint) >= opts.amountAtomic) {
        return { kind: "pull", reason: "ALLOWANCE_READY", suggestedSpender: opts.spender };
      }
    } catch {
      // ignore read errors and continue
    }
  }

  if (has3009) {
    return { kind: "eip3009", reason: "HAS_EIP3009" };
  }
  return { kind: "pull", reason: "NO_EIP3009", suggestedSpender: opts?.spender };
}

/* ---------------- Convenience helpers (optional) ---------------- */

/**
 * Minimal data you need to assemble a `transferWithAuthorization` request off-chain.
 * You will still need to:
 *  - build EIP-712 domain and typed data,
 *  - collect the user's signature (v,r,s),
 *  - have a relayer submit the on-chain call to the token contract.
 */
export type Eip3009AuthParams = {
  from: Address; // Payer (token holder)
  to: Address; // Merchant/facilitator/receiver
  value: bigint; // Atomic units
  validAfter: bigint; // Usually 0n or a timestamp
  validBefore: bigint; // Expiry timestamp
  nonce: `0x${string}`; // Unique 32-byte nonce (random)
};

/**
 * For pull-flow, two transactions are needed:
 * 1) User signs/sends `approve(spender, amount)`.
 * 2) Facilitator (or backend) executes `transferFrom(owner, to, amount)`.
 */
export type PullFlowPlan = {
  approve: {
    to: Address; // token
    function: "approve";
    args: [Address, bigint]; // [spender, amount]
  };
  transferFrom: {
    to: Address; // token
    function: "transferFrom";
    args: [Address, Address, bigint]; // [owner, to, amount]
  };
};

/**
 * Builds the Pull-Flow (approve + transferFrom) plan for UI/back-end to execute.
 *
 * @param params - parameters required to construct the pull-flow
 * @param params.token - ERC-20 token address for which calls will be built
 * @param params.owner - token owner (payer) address
 * @param params.spender - spender address authorized to transfer tokens
 * @param params.to - recipient address that will receive the tokens
 * @param params.amountAtomic - amount to transfer in atomic units (wei-like)
 * @returns a structured plan describing approve and transferFrom calls
 */
export function buildPullFlowPlan(params: {
  token: Address;
  owner: Address;
  spender: Address;
  to: Address;
  amountAtomic: bigint;
}): PullFlowPlan {
  return {
    approve: {
      to: params.token,
      function: "approve",
      args: [params.spender, params.amountAtomic],
    },
    transferFrom: {
      to: params.token,
      function: "transferFrom",
      args: [params.owner, params.to, params.amountAtomic],
    },
  };
}

/**
 * Simple factory to create a `PublicClient` if you just have an RPC URL at hand.
 * (You likely already have clients elsewhere — this is purely optional sugar.)
 *
 * @param rpcUrl - RPC endpoint URL
 * @param chainLike - minimal chain object with id and optional name
 * @param chainLike.id - numeric chain id
 * @param chainLike.name - human-readable name
 * @returns a configured viem PublicClient
 */
export function makePublicClient(rpcUrl: string, chainLike: { id: number; name?: string }) {
  return createPublicClient({ transport: http(rpcUrl), chain: chainLike as unknown as Chain });
}
