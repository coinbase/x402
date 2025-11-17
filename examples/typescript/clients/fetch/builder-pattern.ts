import { privateKeyToAccount } from "viem/accounts";
import { x402Client } from "@x402/fetch";
import { ExactEvmClient } from "@x402/evm";
import { ExactSvmClient } from "@x402/svm";
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
    .registerScheme("eip155:*", new ExactEvmClient(evmSigner))
    .registerScheme("eip155:1", new ExactEvmClient(ethereumSigner))
    .registerScheme("solana:*", new ExactSvmClient(svmSigner))
    .registerScheme(
      "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      new ExactSvmClient(solanaDevnetSigner),
    );

  // The result is a specific signer for Ethereum mainnet & Solana devnet
  // Falling back to a generic signer for all other evm & solana networks

  return client;
}
