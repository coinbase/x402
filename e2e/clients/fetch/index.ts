import { config } from "dotenv";
import { Hex } from "viem";
import { createSigner, decodeXPaymentResponse, wrapFetchWithPayment } from "x402-fetch";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as Hex;
const baseURL = process.env.RESOURCE_SERVER_URL as string;
const endpointPath = process.env.ENDPOINT_PATH as string;
const url = `${baseURL}${endpointPath}`;

if (!baseURL || !evmPrivateKey || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const evmSigner = await createSigner("base-sepolia", evmPrivateKey);

const fetchWithPayment = wrapFetchWithPayment(fetch, evmSigner);

fetchWithPayment(url, {
  method: "GET",
})
  .then(async response => {
    const data = await response.json();
    const paymentResponse = response.headers.get("x-payment-response");

    const result = {
      success: true,
      data: data,
      status_code: response.status,
      payment_response: decodeXPaymentResponse(paymentResponse!),
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
