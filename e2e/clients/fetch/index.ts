import { config } from "dotenv";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { registerEvmToClient } from "@x402/evm/register";
import { registerSvmToClient } from "@x402/svm/register";
import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { x402Client } from "@x402/core/client";

config();

const baseURL = process.env.RESOURCE_SERVER_URL as string;
const endpointPath = process.env.ENDPOINT_PATH as string;
const url = `${baseURL}${endpointPath}`;
const evmAccount = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const svmSigner = await createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY as string));

// Create client and register EVM and SVM schemes using the new register helpers
const client = new x402Client();
registerEvmToClient(client, { signer: evmAccount });
registerSvmToClient(client, { signer: svmSigner });

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

fetchWithPayment(url, {
  method: "GET",
}).then(async response => {
  const data = await response.json();
  // Check both v2 (PAYMENT-RESPONSE) and v1 (X-PAYMENT-RESPONSE) headers
  const paymentResponse = response.headers.get("PAYMENT-RESPONSE") || response.headers.get("X-PAYMENT-RESPONSE");

  if (!paymentResponse) {
    // No payment was required
    const result = {
      success: true,
      data: data,
      status_code: response.status,
    };
    console.log(JSON.stringify(result));
    process.exit(0);
    return;
  }

  const decodedPaymentResponse = decodePaymentResponseHeader(paymentResponse);

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
