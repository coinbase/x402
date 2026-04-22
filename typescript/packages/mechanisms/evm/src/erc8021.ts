import { encodeFunctionData, type Hex } from "viem";
import type { FacilitatorEvmSigner } from "./signer";

// ERC-8021 trailing marker (16 bytes) + schema byte
const ERC_8021_MARKER = "8021000000000000000000008021";
const ERC_8021_SCHEMA_ID = "01";

/**
 * Builds the raw ERC-8021 suffix: `[builderCode ASCII hex][schema 0x01][marker]`
 *
 * @param builderCode - UTF-8 builder code string to encode
 * @returns Hex-encoded suffix string (without 0x prefix)
 */
export function buildErc8021Suffix(builderCode: string): string {
  const codeHex = Buffer.from(builderCode, "utf-8").toString("hex");
  return `${codeHex}${ERC_8021_SCHEMA_ID}${ERC_8021_MARKER}`;
}

/**
 * Wraps `signer.writeContract` to optionally append an ERC-8021 Builder Code suffix.
 * When no builderCode is provided, falls through to writeContract directly.
 *
 * @param signer - Facilitator signer for contract interactions
 * @param writeArgs - Contract write parameters
 * @param writeArgs.address - Target contract address
 * @param writeArgs.abi - Contract ABI
 * @param writeArgs.functionName - Function to call
 * @param writeArgs.args - Function arguments
 * @param writeArgs.gas - Optional gas limit
 * @param builderCode - Optional ERC-8021 builder code to append
 * @returns Transaction hash
 */
export async function writeContractWithBuilderCode(
  signer: FacilitatorEvmSigner,
  writeArgs: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    gas?: bigint;
  },
  builderCode?: string,
): Promise<Hex> {
  if (!builderCode) {
    return signer.writeContract(writeArgs);
  }

  const calldata = encodeFunctionData({
    abi: writeArgs.abi as readonly Record<string, unknown>[],
    functionName: writeArgs.functionName,
    args: [...writeArgs.args],
  });

  const suffix = buildErc8021Suffix(builderCode);
  return signer.sendTransaction({
    to: writeArgs.address,
    data: `${calldata}${suffix}` as Hex,
  });
}
