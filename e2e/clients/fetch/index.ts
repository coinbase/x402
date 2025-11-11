import { config } from "dotenv";
import { wrapFetchWithPayment, decodePaymentResponseHeader, Network } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmClient } from "@x402/evm";
import { ExactEvmClientV1 } from "@x402/evm/v1";
import { ExactSvmClientV1 } from "@x402/svm/v1";
import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { ExactSvmClient } from "@x402/svm";
import { x402Client } from "@x402/core/client";

config();

const baseURL = process.env.RESOURCE_SERVER_URL as string;
const endpointPath = process.env.ENDPOINT_PATH as string;
const url = `${baseURL}${endpointPath}`;
const evmAccount = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const svmSigner = await createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY as string));

const client = new x402Client()
  .registerScheme("eip155:*", new ExactEvmClient(evmAccount))
  .registerScheme("solana:*", new ExactSvmClient(svmSigner))
  .registerSchemeV1("base-sepolia", new ExactEvmClientV1(evmAccount))
  .registerSchemeV1("base", new ExactEvmClientV1(evmAccount))
  .registerSchemeV1("solana-devnet", new ExactSvmClientV1(svmSigner))
  .registerSchemeV1("solana", new ExactSvmClientV1(svmSigner))

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
