import { config } from "dotenv";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { ExactAptosScheme } from "@x402/aptos/exact/client";
import { Account, Ed25519PrivateKey, PrivateKey, PrivateKeyVariants } from "@aptos-labs/ts-sdk";
import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { x402Client, x402HTTPClient } from "@x402/core/client";

config();

const baseURL = process.env.RESOURCE_SERVER_URL as string;
const endpointPath = process.env.ENDPOINT_PATH as string;
const url = `${baseURL}${endpointPath}`;
const evmAccount = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const svmSigner = await createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY as string));

// Create a public client for on-chain reads (needed for EIP-2612 extension)
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// Compose account + publicClient into a full ClientEvmSigner
const evmSigner = toClientEvmSigner(evmAccount, publicClient);

// Initialize Aptos signer if key is provided
let aptosAccount: Account | undefined;
if (process.env.APTOS_PRIVATE_KEY) {
  const formattedKey = PrivateKey.formatPrivateKey(process.env.APTOS_PRIVATE_KEY, PrivateKeyVariants.Ed25519);
  const aptosPrivateKey = new Ed25519PrivateKey(formattedKey);
  aptosAccount = Account.fromPrivateKey({ privateKey: aptosPrivateKey });
}

// Create client and register EVM, SVM, and Aptos schemes using the register helpers
const client = new x402Client();
registerExactEvmScheme(client, { signer: evmSigner });
registerExactSvmScheme(client, { signer: svmSigner });
if (aptosAccount) {
  client.register("aptos:*", new ExactAptosScheme(aptosAccount));
}

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

fetchWithPayment(url, {
  method: "GET",
}).then(async response => {
  const data = await response.json();
  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse((name) => response.headers.get(name));

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

  const result = {
    success: paymentResponse.success,
    data: data,
    status_code: response.status,
    payment_response: paymentResponse,
  };

  // Output structured result as JSON for proxy to parse
  console.log(JSON.stringify(result));
  process.exit(0);
});
