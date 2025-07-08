import { KeyPairSigner } from "@solana/kit";

/**
 * Get the fee payer for the given signer.
 *
 * @param signer - The signer to get the fee payer for
 * @returns The fee payer address
 */
export function getFeePayer(signer: KeyPairSigner): GetFeePayerResponse {
  return {
    feePayer: signer.address.toString(),
  };
}

export type GetFeePayerResponse = {
  feePayer: string;
};