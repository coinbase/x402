import axios from "axios";
import { config } from "dotenv";
import {
  withPaymentInterceptor,
  decodeXPaymentResponse,
  createSigner,
  type Hex,
  MultiNetworkSigner,
} from "x402-axios";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as Hex;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const hederaPrivateKey = process.env.HEDERA_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!baseURL || !evmPrivateKey || !svmPrivateKey || !hederaPrivateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/**
 * This example shows how to use the x402-axios package with a multi-network signer that supports EVM, SVM, and Hedera.
 *
 * To run this example, you need to set the following environment variables:
 * - EVM_PRIVATE_KEY: The EVM private key (hex format, with or without 0x)
 * - SVM_PRIVATE_KEY: The Solana private key (base58 format)
 * - HEDERA_PRIVATE_KEY: The Hedera private key + account ID (format: "privateKey|accountId")
 * - RESOURCE_SERVER_URL: The URL of the resource server
 * - ENDPOINT_PATH: The path of the endpoint to call on the resource server
 *
 */
async function main(): Promise<void> {
  const evmSigner = await createSigner("base-sepolia", evmPrivateKey);
  const svmSigner = await createSigner("solana-devnet", svmPrivateKey);
  const hederaSigner = await createSigner("hedera-testnet", hederaPrivateKey);
  const signer = { evm: evmSigner, svm: svmSigner, hedera: hederaSigner } as MultiNetworkSigner;

  const api = withPaymentInterceptor(
    axios.create({
      baseURL,
    }),
    signer,
  );

  const response = await api.get(endpointPath);
  console.log(response.data);

  const paymentResponse = decodeXPaymentResponse(response.headers["x-payment-response"]);
  console.log(paymentResponse);
}

main();
