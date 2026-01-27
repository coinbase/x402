import { config } from "dotenv";
import { x402Client, wrapAxiosWithPayment, x402HTTPClient } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { registerExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import axios from "axios";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const stellarPrivateKey = process.env.STELLAR_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";
const url = `${baseURL}${endpointPath}`;

/**
 * Example demonstrating how to use @x402/axios to make requests to x402-protected endpoints.
 *
 * This uses the helper registration functions from @x402/evm, @x402/svm, and @x402/stellar to register
 * all supported networks for both v1 and v2 protocols.
 *
 * Required environment variables:
 * - EVM_PRIVATE_KEY: The private key of the EVM signer
 * - SVM_PRIVATE_KEY: The private key of the SVM signer
 * - STELLAR_PRIVATE_KEY: The private key of the Stellar signer
 */
async function main(): Promise<void> {
  const client = new x402Client();

  if (evmPrivateKey) {
    const evmSigner = privateKeyToAccount(evmPrivateKey);
    registerExactEvmScheme(client, { signer: evmSigner });
  }
  if (svmPrivateKey) {
    const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));
    registerExactSvmScheme(client, { signer: svmSigner });
  }
  if (stellarPrivateKey) {
    const stellarSigner = createEd25519Signer(stellarPrivateKey, "stellar:testnet");
    registerExactStellarScheme(client, { signer: stellarSigner });
  }

  const api = wrapAxiosWithPayment(axios.create(), client);

  console.log(`Making request to: ${url}\n`);
  const response = await api.get(url);
  const body = response.data;
  console.log("Response body:", body);

  if (response.status < 400) {
    const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(
      name => response.headers[name.toLowerCase()],
    );
    console.log("\nPayment response:", paymentResponse);
  } else {
    console.log(`\nNo payment settled (response status: ${response.status})`);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
