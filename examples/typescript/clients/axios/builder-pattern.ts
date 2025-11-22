import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

/**
 * Creates an x402Client using the builder pattern to register schemes.
 *
 * This demonstrates the basic way to configure the client by chaining
 * registerScheme calls to map scheme patterns to mechanism clients.
 *
 * @param evmPrivateKey - The EVM private key for signing transactions
 * @param svmPrivateKey - The SVM private key for signing transactions
 * @returns A configured x402Client instance
 */
export async function createBuilderPatternClient(
  evmPrivateKey: `0x${string}`,
  svmPrivateKey: `0x${string}`,
): Promise<x402Client> {
  const evmSigner = privateKeyToAccount(evmPrivateKey);
  const ethereumSigner = evmSigner; // Say you wanted a different signer for Ethereum Mainnet
  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));
  const solanaDevnetSigner = svmSigner; // Say you wanted a different signer for Solana Devnet

  const client = new x402Client()
    .register("eip155:*", new ExactEvmScheme(evmSigner))
    .register("eip155:1", new ExactEvmScheme(ethereumSigner))
    .register("solana:*", new ExactSvmScheme(svmSigner))
    .register(
      "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      new ExactSvmScheme(solanaDevnetSigner),
    );

  // The result is a specific signer for Ethereum mainnet & Solana devnet
  // Falling back to a generic signer for all other evm & solana networks

  return client;
}
