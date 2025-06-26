import bs58 from "bs58";
import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  type KeyPairSigner,
} from "@solana/kit";
import { config } from "dotenv";
import { decodeXPaymentResponse, wrapFetchWithPayment } from "x402-fetch";

// load environment variables
config();
const privateKey = process.env.PRIVATE_KEY;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather
const url = `${baseURL}${endpointPath}`; // e.g. https://example.com/weather

if (!baseURL || !privateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/**
 * Creates a Solana signer from a private key.
 *
 * @param privateKey - The base58 encoded private key to create a signer from.
 * @returns A Solana signer.
 */
export async function createSignerFromBase58(privateKey: string): Promise<KeyPairSigner> {
  // decode the base58 encoded private key
  const bytes = bs58.decode(privateKey);

  // generate a keypair signer from the bytes based on the byte-length
  // 64 bytes represents concatenated private + public key
  if (bytes.length === 64) {
    return await createKeyPairSignerFromBytes(bytes);
  }
  // 32 bytes represents only the private key
  if (bytes.length === 32) {
    return await createKeyPairSignerFromPrivateKeyBytes(bytes);
  }
  throw new Error(`Unexpected key length: ${bytes.length}. Expected 32 or 64 bytes.`);
}

// create a signer from the private key
const signer = await createSignerFromBase58(privateKey);

// wrap the fetch function with x402 payments
const fetchWithPayment = await wrapFetchWithPayment(fetch, signer);

fetchWithPayment(url, {
  method: "GET",
})
  .then(async response => {
    const body = await response.json();
    console.log(body);

    const paymentResponse = decodeXPaymentResponse(response.headers.get("x-payment-response")!);
    console.log(paymentResponse);
  })
  .catch(error => {
    console.error(error.response?.data?.error);
  });
