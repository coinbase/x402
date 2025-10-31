import { config } from "dotenv";
import axios from "axios";
import {
  withPaymentInterceptor,
  decodeXPaymentResponse,
  createSigner,
  type Hex,
  type PaymentPreferences,
} from "@b3dotfun/anyspend-x402-axios";

config();

const privateKey = process.env.PRIVATE_KEY as Hex | string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!baseURL || !privateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/**
 * This example demonstrates how to specify payment preferences with Axios:
 * - Pay with a specific token (WETH, DAI, or any ERC-20)
 * - Pay on a specific network/chain
 * - Enable cross-chain payments via Anyspend facilitator
 *
 * The payment preference headers (X-PREFERRED-TOKEN, X-PREFERRED-NETWORK) are
 * automatically added to all requests by the interceptor.
 *
 * To run this example, you need to set the following environment variables:
 * - PRIVATE_KEY: The private key of the signer
 * - RESOURCE_SERVER_URL: The URL of the resource server
 * - ENDPOINT_PATH: The path of the endpoint to call on the resource server
 */
async function main(): Promise<void> {
  // Create signer for Base network
  const signer = await createSigner("base-sepolia", privateKey);

  // Example 1: Default behavior (pays with USDC)
  console.log("=== Example 1: Default Payment (USDC) ===");
  const defaultClient = axios.create({ baseURL });
  withPaymentInterceptor(defaultClient, signer);

  try {
    const response1 = await defaultClient.get(endpointPath);
    console.log("Response:", response1.data);

    const paymentResponse1 = decodeXPaymentResponse(response1.headers["x-payment-response"]!);
    console.log("Payment details:", paymentResponse1);
  } catch (error) {
    console.error("Error with default payment:", error);
  }

  // Example 2: Pay with WETH on Base
  console.log("\n=== Example 2: Pay with WETH on Base ===");
  const wethPreferences: PaymentPreferences = {
    preferredToken: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
    preferredNetwork: "base-sepolia",
  };

  const wethClient = axios.create({ baseURL });
  withPaymentInterceptor(
    wethClient,
    signer,
    undefined, // paymentRequirementsSelector - use default
    undefined, // config - use default
    wethPreferences,
  );

  try {
    const response2 = await wethClient.get(endpointPath);
    console.log("Response:", response2.data);

    const paymentResponse2 = decodeXPaymentResponse(response2.headers["x-payment-response"]!);
    console.log("Payment details (paid with WETH):", paymentResponse2);
  } catch (error) {
    console.error("Error with WETH payment:", error);
  }

  // Example 3: Cross-chain payment - Pay on Ethereum instead of Base
  console.log("\n=== Example 3: Cross-Chain Payment (Ethereum) ===");
  const ethereumSigner = await createSigner("ethereum-sepolia", privateKey);

  const ethereumPreferences: PaymentPreferences = {
    preferredToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on Ethereum Sepolia
    preferredNetwork: "ethereum-sepolia",
  };

  const ethereumClient = axios.create({ baseURL });
  withPaymentInterceptor(ethereumClient, ethereumSigner, undefined, undefined, ethereumPreferences);

  try {
    const response3 = await ethereumClient.get(endpointPath);
    console.log("Response:", response3.data);

    const paymentResponse3 = decodeXPaymentResponse(response3.headers["x-payment-response"]!);
    console.log("Payment details (cross-chain from Ethereum):", paymentResponse3);
  } catch (error) {
    console.error("Error with cross-chain payment:", error);
  }

  // Example 4: Pay with DAI
  console.log("\n=== Example 4: Pay with DAI ===");
  const daiPreferences: PaymentPreferences = {
    preferredToken: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI on Base Sepolia
    preferredNetwork: "base-sepolia",
  };

  const daiClient = axios.create({ baseURL });
  withPaymentInterceptor(daiClient, signer, undefined, undefined, daiPreferences);

  try {
    const response4 = await daiClient.get(endpointPath);
    console.log("Response:", response4.data);

    const paymentResponse4 = decodeXPaymentResponse(response4.headers["x-payment-response"]!);
    console.log("Payment details (paid with DAI):", paymentResponse4);
  } catch (error) {
    console.error("Error with DAI payment:", error);
  }

  // Example 5: Reusable client with preferences - all requests use WETH
  console.log("\n=== Example 5: Reusable Client ===");
  const reusableClient = axios.create({ baseURL });
  withPaymentInterceptor(reusableClient, signer, undefined, undefined, {
    preferredToken: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
    preferredNetwork: "base-sepolia",
  });

  try {
    // Multiple requests all use WETH automatically
    const response5a = await reusableClient.get(endpointPath);
    console.log("First request:", response5a.data);

    const response5b = await reusableClient.get(endpointPath);
    console.log("Second request:", response5b.data);

    console.log("All requests automatically paid with WETH!");
  } catch (error) {
    console.error("Error with reusable client:", error);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
