import { CdpClient } from "@coinbase/cdp-sdk";
import axios from "axios";
import { config } from "dotenv";
import { createPublicClient, createWalletClient, http, LocalAccount } from "viem";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";
import { toAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { decodeXPaymentResponse, withPaymentInterceptor } from "x402-axios";

config();

const apiKeyId = process.env.CDP_API_KEY_ID as string;
const apiKeySecret = process.env.CDP_API_KEY_SECRET as string;
const walletSecret = process.env.CDP_WALLET_SECRET as string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!baseURL || !apiKeyId || !apiKeySecret || !walletSecret || !endpointPath) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const client = new CdpClient({
  apiKeyId,
  apiKeySecret,
  walletSecret,
});
const serverAccount = await client.evm.getOrCreateAccount({
  name: "x402",
});

const smartAccount = await client.evm.getOrCreateSmartAccount({
  name: "x402",
  owner: serverAccount,
});

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
})

// const smartAccountAccount = toAccount(smartAccount as any) as LocalAccount;
const account = await toCoinbaseSmartAccount({
  owners: [toAccount(serverAccount) as LocalAccount],
  client: publicClient,
  version: "1.1",
  address: smartAccount.address
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
})

await client.evm.requestFaucet({
  address: smartAccount.address,
  network: "base-sepolia",
  token: "usdc",
})

await new Promise(resolve => setTimeout(resolve, 10000));

const api = withPaymentInterceptor(
  axios.create({
    baseURL,
  }),
  walletClient as any,
);


api
  .get(endpointPath)
  .then(response => {
    console.log(response.data);

    const paymentResponse = decodeXPaymentResponse(response.headers["x-payment-response"]);
    console.log(paymentResponse);
  })
  .catch(error => {
    console.error(error);
  });
