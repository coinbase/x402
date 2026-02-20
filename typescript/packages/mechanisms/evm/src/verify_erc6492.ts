import { Hex } from "viem";
import { UNIVERSAL_SIG_VALIDATOR_ADDRESS, universalSigValidatorABI } from "./constants";
import { FacilitatorEvmSigner } from "./signer";

/**
 * Verifies an ERC-6492 counterfactual signature by calling the UniversalSigValidator
 * contract via eth_call (no state changes committed).
 *
 * The validator atomically simulates the factory deployment then verifies the inner
 * signature using EIP-1271 isValidSignature on the resulting contract.
 *
 * @param signer - Facilitator signer for contract reads.
 * @param signerAddress - Address that should have signed.
 * @param hash - EIP-712 typed data hash that was signed.
 * @param signature - Full ERC-6492 wrapped signature bytes.
 * @returns True if the signature is valid, false if invalid or validator unavailable.
 */
export async function verifyERC6492Signature(
  signer: FacilitatorEvmSigner,
  signerAddress: `0x${string}`,
  hash: Hex,
  signature: Hex,
): Promise<boolean> {
  try {
    const result = await signer.readContract({
      address: UNIVERSAL_SIG_VALIDATOR_ADDRESS,
      abi: universalSigValidatorABI,
      functionName: "isValidSig",
      args: [signerAddress, hash, signature],
    });
    if (typeof result !== "boolean") {
      return false;
    }
    return result;
  } catch {
    return false;
  }
}
