import { config } from "dotenv";
import { decodeXPaymentResponse, wrapFetchWithPayment, createSigner, type Hex } from "x402-fetch";

config();

const network = (process.env.NETWORK || "base-sepolia") as string; // e.g. base-sepolia, or solana-devnet, or stellar-testnet
const privateKey = process.env.PRIVATE_KEY as Hex | string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather
const url = `${baseURL}${endpointPath}`; // e.g. https://example.com/weather

if (!baseURL || !privateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/**
 * This example shows how to use the x402-fetch package to make a request to a resource server that requires a payment.
 *
 * To run this example, you need to set the following environment variables:
 * - PRIVATE_KEY: The private key of the signer
 * - RESOURCE_SERVER_URL: The URL of the resource server
 * - ENDPOINT_PATH: The path of the endpoint to call on the resource server
 * - NETWORK: The network to use for the signer (e.g. base-sepolia, solana-devnet, stellar-testnet)
 *
 */
async function main(): Promise<void> {
  const signer = await createSigner(network, privateKey);
  const fetchWithPayment = wrapFetchWithPayment(fetch, signer);

  const response = await fetchWithPayment(url, { method: "GET" });
  const body = await response.json();
  console.log(body);

  const paymentResponseHeader = response.headers.get("x-payment-response");
  if (paymentResponseHeader) {
    const paymentResponse = decodeXPaymentResponse(paymentResponseHeader);
    console.log(paymentResponse);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
