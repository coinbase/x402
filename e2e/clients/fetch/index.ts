import { config } from "dotenv";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmClient } from "@x402/evm";

config();

const baseURL = process.env.RESOURCE_SERVER_URL as string;
const endpointPath = process.env.ENDPOINT_PATH as string;
const url = `${baseURL}${endpointPath}`;
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const fetchWithPayment = wrapFetchWithPayment(fetch, {
  schemes: [
    {
      network: "eip155:*",
      client: new ExactEvmClient(account),
    },
  ],
});

fetchWithPayment(url, {
  method: "GET",
}).then(async response => {
  const data = await response.json();
  const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
  const decodedPaymentResponse = decodePaymentResponseHeader(paymentResponse!);

  const result = {
    success: decodedPaymentResponse.success,
    data: data,
    status_code: response.status,
    payment_response: decodedPaymentResponse,
  };

  // Output structured result as JSON for proxy to parse
  console.log(JSON.stringify(result));
  process.exit(0);
});
