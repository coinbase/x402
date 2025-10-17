import axios from "axios";
import { config } from "dotenv";
import {
  withDeferredPaymentInterceptor,
  decodeXPaymentResponse,
  createSigner,
  type Hex,
} from "x402-axios";

config();

const privateKey = process.env.PRIVATE_KEY as Hex | string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!baseURL || !privateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/**
 * This example shows how to use the x402-axios package to make a request to a resource server that requires a payment
 * using deferred scheme.
 *
 * To run this example, you need to set the following environment variables:
 * - PRIVATE_KEY: The private key of the signer (buyer)
 * - RESOURCE_SERVER_URL: The URL of the resource server
 * - ENDPOINT_PATH: The path of the endpoint to call on the resource server
 *
 */
async function main(): Promise<void> {
  const signer = await createSigner("base-sepolia", privateKey);
  const api = withDeferredPaymentInterceptor(
    axios.create({
      baseURL,
    }),
    signer,
    // [
    //   {
    //     asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    //     assetDomain: {
    //       name: "USDC",
    //       version: "2",
    //     },
    //     threshold: "996000",
    //     amount: "100",
    //   },
    // ],
  );

  try {
    const response = await api.get(endpointPath);
    console.log(response.data);

    const xPaymentHeader = response.config.headers["X-PAYMENT"];
    const paymentPayload = JSON.parse(Buffer.from(xPaymentHeader, "base64").toString("utf-8"));
    console.log("Deferred voucher details:");
    console.log(paymentPayload.payload.voucher);

    const paymentResponse = decodeXPaymentResponse(response.headers["x-payment-response"]);
    console.log(paymentResponse);
  } catch (error) {
    console.error(error);
  }
}

main();
