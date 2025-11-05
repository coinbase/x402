import { config } from "dotenv";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmClient } from "@x402/evm";
import { ExactEvmClientV1 } from "@x402/evm/v1";
import { ExactSvmClientV1 } from "@x402/svm/v1";
import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { ExactSvmClient } from "@x402/svm";

config();

const baseURL = process.env.RESOURCE_SERVER_URL as string;
const endpointPath = process.env.ENDPOINT_PATH as string;
const url = `${baseURL}${endpointPath}`;
const evmAccount = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const svmSigner = await createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY as string));

const fetchWithPayment = wrapFetchWithPayment(fetch, {
  schemes: [
    {
      network: "eip155:*",
      client: new ExactEvmClient(evmAccount),
    },
    {
      network: "base-sepolia" as `${string}:${string}`,
      x402Version: 1,
      client: new ExactEvmClientV1(evmAccount),
    },
    {
      network: "base" as `${string}:${string}`,
      x402Version: 1,
      client: new ExactEvmClientV1(evmAccount),
    },
    {
      network: "solana:*",
      x402Version: 2,
      client: new ExactSvmClient(svmSigner),
    },
    {
      network: "solana-devnet" as `${string}:${string}`,
      x402Version: 1,
      client: new ExactSvmClientV1(svmSigner),
    },
    {
      network: "solana" as `${string}:${string}`,
      x402Version: 1,
      client: new ExactSvmClientV1(svmSigner),
    },
  ],
});

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
