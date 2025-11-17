import axios from "axios";
import { config } from "dotenv";
import { Hex } from "viem";
import { withPaymentInterceptor, decodeXPaymentResponse, createSigner } from "x402-axios";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as Hex;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!baseURL || !evmPrivateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const evmSigner = await createSigner("arc-testnet", evmPrivateKey);

const api = withPaymentInterceptor(
  axios.create({
    baseURL,
  }),
  evmSigner,
);

api
  .get(endpointPath)
  .then(response => {
    console.log("Response received:", {
      status: response.status,
      headers: response.headers,
      data: response.data,
    });

    const result = {
      success: true,
      data: response.data,
      status_code: response.status,
      payment_response: decodeXPaymentResponse(response.headers["x-payment-response"]),
    };

    // Output structured result as JSON for proxy to parse
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch(error => {
    const errorResult = {
      success: false,
      error: error.message || String(error),
      status_code: error.response?.status,
    };

    console.log(JSON.stringify(errorResult));
    process.exit(1);
  });
