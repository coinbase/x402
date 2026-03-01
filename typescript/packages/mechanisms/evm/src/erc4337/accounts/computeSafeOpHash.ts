import { type Hex, concat, hashTypedData, isAddress, pad, toHex } from "viem";
import { SAFE_4337_MODULE_ADDRESS, entryPoint07Address } from "../constants";

const SAFE_OP_TYPES = {
  SafeOp: [
    { type: "address", name: "safe" },
    { type: "uint256", name: "nonce" },
    { type: "bytes", name: "initCode" },
    { type: "bytes", name: "callData" },
    { type: "uint128", name: "verificationGasLimit" },
    { type: "uint128", name: "callGasLimit" },
    { type: "uint256", name: "preVerificationGas" },
    { type: "uint128", name: "maxPriorityFeePerGas" },
    { type: "uint128", name: "maxFeePerGas" },
    { type: "bytes", name: "paymasterAndData" },
    { type: "uint48", name: "validAfter" },
    { type: "uint48", name: "validUntil" },
    { type: "address", name: "entryPoint" },
  ],
} as const;

export interface SafeOpHashParams {
  sender: Hex;
  nonce: bigint;
  factory?: Hex | null;
  factoryData?: Hex | null;
  callData: Hex;
  verificationGasLimit: bigint;
  callGasLimit: bigint;
  preVerificationGas: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  paymaster?: Hex | null;
  paymasterVerificationGasLimit?: bigint | null;
  paymasterPostOpGasLimit?: bigint | null;
  paymasterData?: Hex | null;
}

/**
 * Computes the EIP-712 SafeOp hash that Safe4337Module uses for signature verification.
 *
 * The Safe4337Module converts the EntryPoint v0.7 UserOperation into a SafeOp struct,
 * packing initCode and paymasterAndData into their v0.6-style concatenated forms,
 * then hashes the struct using EIP-712.
 *
 * @param userOp - The user operation parameters to hash
 * @param chainId - The chain ID for the EIP-712 domain
 * @param safe4337ModuleAddress - The Safe4337Module contract address
 * @param entryPointAddress - The EntryPoint contract address
 * @returns The EIP-712 SafeOp hash
 */
export function computeSafeOpHash(
  userOp: SafeOpHashParams,
  chainId: number,
  safe4337ModuleAddress: Hex = SAFE_4337_MODULE_ADDRESS,
  entryPointAddress: Hex = entryPoint07Address,
): Hex {
  // Reconstruct initCode: factory || factoryData (v0.7 -> v0.6 style)
  const initCode =
    userOp.factory && isAddress(userOp.factory)
      ? concat([userOp.factory, (userOp.factoryData || "0x") as Hex])
      : ("0x" as Hex);

  // Reconstruct paymasterAndData: paymaster || verificationGasLimit(16) || postOpGasLimit(16) || data
  let paymasterAndData: Hex = "0x";
  if (userOp.paymaster && isAddress(userOp.paymaster)) {
    paymasterAndData = concat([
      userOp.paymaster,
      pad(toHex(userOp.paymasterVerificationGasLimit || 0n), { size: 16 }),
      pad(toHex(userOp.paymasterPostOpGasLimit || 0n), { size: 16 }),
      (userOp.paymasterData || "0x") as Hex,
    ]);
  }

  return hashTypedData({
    domain: {
      chainId,
      verifyingContract: safe4337ModuleAddress,
    },
    types: SAFE_OP_TYPES,
    primaryType: "SafeOp",
    message: {
      safe: userOp.sender,
      nonce: userOp.nonce,
      initCode,
      callData: userOp.callData,
      verificationGasLimit: userOp.verificationGasLimit,
      callGasLimit: userOp.callGasLimit,
      preVerificationGas: userOp.preVerificationGas,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
      maxFeePerGas: userOp.maxFeePerGas,
      paymasterAndData,
      validAfter: 0,
      validUntil: 0,
      entryPoint: entryPointAddress,
    },
  });
}
