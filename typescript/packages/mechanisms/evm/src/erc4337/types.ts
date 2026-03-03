import { Hex } from "viem";

export interface UserOperationCapability {
  /**
   * Whether the UserOperation capability is supported
   */
  supported: true;
  /**
   * Bundler URL for submitting UserOperations
   */
  bundlerUrl?: string;

  /**
   * Paymaster address for sponsored transactions
   */
  paymaster?: Hex;

  /**
   * Suggested entrypoint for the UserOperation
   */
  entrypoint?: Hex;
}

/**
 * ERC-4337 v0.7 User Operation structure
 */
export interface UserOperation07Json {
  [key: string]: unknown; // Allow additional fields
  sender: string;
  nonce: string;

  // v0.7 contrafactual init
  factory?: string;
  factoryData?: string;

  callData: string;

  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;

  maxFeePerGas: string;
  maxPriorityFeePerGas: string;

  // v0.7 paymaster split
  paymaster?: string;
  paymasterData?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;

  signature: string;
}

/**
 * ERC-4337 payload structure for x402 payments
 */
export interface Erc4337Payload {
  [key: string]: unknown; // Allow additional fields
  type?: "erc4337";
  entryPoint: string;
  bundlerRpcUrl?: string;
  userOperation: UserOperation07Json;
}

/**
 * Type guard to check if a payload is an ERC-4337 payload.
 * ERC-4337 payloads have a `userOperation` field and optionally `type: "erc4337"`.
 *
 * @param payload - The value to check
 * @returns Whether the payload is an ERC-4337 payload
 */
export function isErc4337Payload(payload: unknown): payload is Erc4337Payload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    "userOperation" in p &&
    p.userOperation !== null &&
    typeof p.userOperation === "object" &&
    "entryPoint" in p
  );
}
