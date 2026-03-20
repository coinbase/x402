/**
 * All Networks Client Example
 *
 * Demonstrates how to create a client that supports all available networks with
 * optional chain configuration via environment variables.
 *
 * New chain support should be added here in alphabetic order by network prefix
 * (e.g., "eip155" before "solana" before "stellar").
 */

import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import { PrivateKey } from "@hiero-ledger/sdk";

config();

// Configuration - optional per network
const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string | undefined;
const hederaAccountId = process.env.HEDERA_ACCOUNT_ID;
// Hedera private key should be an ECDSA key string (0x-prefixed or DER-encoded).
const hederaPrivateKey = process.env.HEDERA_PRIVATE_KEY;
const hederaNetwork = process.env.HEDERA_NETWORK || "hedera:testnet";
const stellarPrivateKey = process.env.STELLAR_PRIVATE_KEY as string | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const url = `${baseURL}${endpointPath}`;

/**
 * Example demonstrating how to use @x402/fetch with all supported networks.
 * Schemes are registered directly for networks where private keys are provided.
 */
async function main(): Promise<void> {
  // Validate at least one private key is provided
  if (
    !evmPrivateKey &&
    !svmPrivateKey &&
    !(hederaAccountId && hederaPrivateKey) &&
    !stellarPrivateKey
  ) {
    console.error(
      "❌ At least one of EVM_PRIVATE_KEY, SVM_PRIVATE_KEY, HEDERA_ACCOUNT_ID + HEDERA_PRIVATE_KEY, or STELLAR_PRIVATE_KEY is required",
    );
    process.exit(1);
  }

  // Create x402 client
  const client = new x402Client();

  // Register EVM scheme if private key is provided
  if (evmPrivateKey) {
    const evmSigner = privateKeyToAccount(evmPrivateKey);
    client.register("eip155:*", new ExactEvmScheme(evmSigner));
    console.log(`Initialized EVM account: ${evmSigner.address}`);
  }

  // Register SVM scheme if private key is provided
  if (svmPrivateKey) {
    const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));
    client.register("solana:*", new ExactSvmScheme(svmSigner));
    console.log(`Initialized SVM account: ${svmSigner.address}`);
  }
  if (hederaAccountId && hederaPrivateKey) {
    const hederaSigner = createClientHederaSigner(
      hederaAccountId,
      PrivateKey.fromStringECDSA(hederaPrivateKey),
      { network: hederaNetwork },
    );
    client.register("hedera:*", new ExactHederaScheme(hederaSigner));
    console.log(`Initialized Hedera account: ${hederaAccountId} on ${hederaNetwork}`);
  }

  // Register Stellar scheme if private key is provided
  if (stellarPrivateKey) {
    const stellarSigner = createEd25519Signer(stellarPrivateKey);
    client.register("stellar:*", new ExactStellarScheme(stellarSigner));
    console.log(`Initialized Stellar account: ${stellarSigner.address}`);
  }

  // Wrap fetch with payment handling
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log(`\nMaking request to: ${url}\n`);

  // Make the request
  const response = await fetchWithPayment(url, { method: "GET" });
  const body = await response.json();
  console.log("Response body:", body);

  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(name =>
    response.headers.get(name),
  );
  console.log("\nPayment response:", JSON.stringify(paymentResponse, null, 2));
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
