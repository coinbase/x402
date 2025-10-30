import { config } from "dotenv";
import {
  decodeXPaymentResponse,
  wrapFetchWithPayment,
  createSigner,
  type Hex,
  type PaymentPreferences,
} from "x402-fetch";

config();

const privateKey = process.env.PRIVATE_KEY as Hex | string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather
const url = `${baseURL}${endpointPath}`; // e.g. https://example.com/weather

if (!baseURL || !privateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/**
 * This example demonstrates how to specify payment preferences:
 * - Pay with a specific token (WETH instead of USDC)
 * - Pay on a specific network (even if different from resource server's default)
 *
 * This enables cross-chain payments where:
 * - Client pays with WETH on Base
 * - Anyspend facilitator swaps WETH → USDC
 * - Resource server receives USDC on Base
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
  const fetchWithDefaultPayment = wrapFetchWithPayment(fetch, signer);

  try {
    const response1 = await fetchWithDefaultPayment(url, { method: "GET" });
    const body1 = await response1.json();
    console.log("Response:", body1);

    const paymentResponse1 = decodeXPaymentResponse(response1.headers.get("x-payment-response")!);
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

  const fetchWithWethPayment = wrapFetchWithPayment(
    fetch,
    signer,
    undefined, // maxValue - use default
    undefined, // paymentRequirementsSelector - use default
    undefined, // config - use default
    wethPreferences,
  );

  try {
    const response2 = await fetchWithWethPayment(url, { method: "GET" });
    const body2 = await response2.json();
    console.log("Response:", body2);

    const paymentResponse2 = decodeXPaymentResponse(response2.headers.get("x-payment-response")!);
    console.log("Payment details (paid with WETH):", paymentResponse2);
  } catch (error) {
    console.error("Error with WETH payment:", error);
  }

  // Example 3: Cross-chain payment - Pay on Ethereum mainnet instead of Base
  console.log("\n=== Example 3: Cross-Chain Payment (Ethereum) ===");
  const ethereumSigner = await createSigner("ethereum-sepolia", privateKey);

  const ethereumPreferences: PaymentPreferences = {
    preferredToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on Ethereum Sepolia
    preferredNetwork: "ethereum-sepolia",
  };

  const fetchWithEthereumPayment = wrapFetchWithPayment(
    fetch,
    ethereumSigner,
    undefined,
    undefined,
    undefined,
    ethereumPreferences,
  );

  try {
    const response3 = await fetchWithEthereumPayment(url, { method: "GET" });
    const body3 = await response3.json();
    console.log("Response:", body3);

    const paymentResponse3 = decodeXPaymentResponse(response3.headers.get("x-payment-response")!);
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

  const fetchWithDaiPayment = wrapFetchWithPayment(
    fetch,
    signer,
    undefined,
    undefined,
    undefined,
    daiPreferences,
  );

  try {
    const response4 = await fetchWithDaiPayment(url, { method: "GET" });
    const body4 = await response4.json();
    console.log("Response:", body4);

    const paymentResponse4 = decodeXPaymentResponse(response4.headers.get("x-payment-response")!);
    console.log("Payment details (paid with DAI):", paymentResponse4);
  } catch (error) {
    console.error("Error with DAI payment:", error);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
