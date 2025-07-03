import axios from "axios";
import { config } from "dotenv";
import { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withPaymentInterceptor, decodeXPaymentResponse } from "x402-axios";

config();

const privateKey = process.env.PRIVATE_KEY as Hex;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!baseURL || !privateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);

const api = withPaymentInterceptor(
  axios.create({
    baseURL,
  }),
  account,
);

api
  .get(endpointPath)
  .then(response => {
    const result = {
      success: true,
      data: response.data,
      status_code: response.status,
      payment_response: decodeXPaymentResponse(response.headers["x-payment-response"])
    };

    // Output structured result as JSON for proxy to parse
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch(error => {
    const errorResult = {
      success: false,
      error: error.message || String(error),
      status_code: error.response?.status
    };

    console.log(JSON.stringify(errorResult));
    process.exit(1);
  });
