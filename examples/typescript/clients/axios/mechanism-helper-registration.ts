import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

/**
 * Creates an x402Client using helper functions for registration.
 *
 * This demonstrates using the convenience helper functions provided by
 * the @x402/evm and @x402/svm packages. These helpers register all EVM
 * networks in v2 (eip155:*) and all v1 networks for backwards compatibility,
 * and similarly for SVM networks (solana:*).
 *
 * @param evmPrivateKey - The EVM private key for signing transactions
 * @param svmPrivateKey - The SVM private key for signing transactions
 * @returns A configured x402Client instance
 */
export async function createMechanismHelperClient(
  evmPrivateKey: `0x${string}`,
  svmPrivateKey: `0x${string}`,
): Promise<x402Client> {
  const evmSigner = privateKeyToAccount(evmPrivateKey);
  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));

  const client = new x402Client();

  // Helper that registers all EVM networks in v2 (eip155:*) and all v1 networks for backwards compatibility
  registerExactEvmScheme(client, { signer: evmSigner });
  // Helper that registers all SVM networks in v2 (solana:*) and all v1 networks for backwards compatibility
  registerExactSvmScheme(client, { signer: svmSigner });

  return client;
}
