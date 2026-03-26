export type ExactEIP3009Payload = {
  signature?: `0x${string}`;
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: `0x${string}`;
  };
};

/**
 * ERC-7710 delegation-based payment payload.
 * Used for smart contract accounts with delegation support.
 */
export type ExactERC7710Payload = {
  /** Address of the ERC-7710 Delegation Manager contract */
  delegationManager: `0x${string}`;
  /** Opaque delegation proof/context required by the Delegation Manager */
  permissionContext: `0x${string}`;
  /** Address of the account that created the delegation */
  delegator: `0x${string}`;
};

export type ExactEvmPayloadV1 = ExactEIP3009Payload;

export type ExactEvmPayloadV2 = ExactEIP3009Payload | ExactERC7710Payload;

/**
 * Type guard to check if a payload is an ERC-7710 delegation payload.
 */
export function isERC7710Payload(
  payload: ExactEvmPayloadV2,
): payload is ExactERC7710Payload {
  return "delegationManager" in payload && "permissionContext" in payload && "delegator" in payload;
}

/**
 * Type guard to check if a payload is an EIP-3009 payload.
 */
export function isEIP3009Payload(
  payload: ExactEvmPayloadV2,
): payload is ExactEIP3009Payload {
  return "authorization" in payload;
}

/** Asset transfer methods supported by the exact scheme on EVM */
export type AssetTransferMethod = "eip3009" | "permit2" | "erc7710";

/**
 * Parameters for creating an x402 payment delegation.
 */
export interface ERC7710PaymentParams {
  /** Available addresses that could redeem the delegation (facilitators) */
  redeemers: `0x${string}`[];
  /** Recipient of the ERC-20 transfer */
  payTo: `0x${string}`;
  /** ERC-20 token address */
  asset: `0x${string}`;
  /** Amount in smallest unit */
  amount: bigint;
  /** Maximum time until delegation expires (seconds) */
  maxTimeoutSeconds: number;
}

/**
 * Result of creating an x402 payment delegation.
 */
export interface ERC7710PaymentDelegation {
  /** Address of the ERC-7710 Delegation Manager contract */
  delegationManager: `0x${string}`;
  /** Encoded permission context for redeemDelegations */
  permissionContext: `0x${string}`;
  /**
   * Which redeemers from the input were authorized in this delegation.
   * Must be a non-empty subset of the input redeemers.
   */
  authorizedRedeemers: `0x${string}`[];
}

/**
 * Interface for ERC-7710 payment delegation providers.
 *
 * Implementations handle 7710-specific logic for creating payment delegations
 * from a root allowance. Each framework (MetaMask Delegation Framework,
 * Pimlico, ZeroDev, etc.) provides its own adapter.
 *
 * x402 defines this interface - implementations live in their respective SDKs.
 *
 * @example
 * ```typescript
 * // Example usage with a hypothetical gator-sdk adapter
 * import { createGatorPaymentProvider } from "@metamask/gator-sdk";
 *
 * const provider = createGatorPaymentProvider(rootDelegation);
 * const scheme = new ExactEvmScheme({ erc7710Provider: provider });
 * ```
 */
export interface ERC7710PaymentProvider {
  /** Address of the account that holds the funds (the delegator) */
  readonly delegator: `0x${string}`;

  /**
   * Create a payment delegation for an x402 payment.
   *
   * The implementation handles all 7710-specific logic:
   * - Sub-delegation from root allowance
   * - Caveat encoding (amount limits, recipient restrictions, redeemer authorization)
   * - Permission context serialization
   *
   * @param params - Payment parameters including redeemers, recipient, asset, and amount
   * @returns Delegation data including the delegation manager, permission context, and authorized redeemers
   * @throws Error if delegation cannot be created (insufficient allowance,
   *         unsupported asset, no common redeemers, expired root delegation, etc.)
   */
  createX402PaymentDelegation(params: ERC7710PaymentParams): Promise<ERC7710PaymentDelegation>;
}
