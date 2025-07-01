import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient, Hex } from "viem";
import axios from "axios";
import { withPaymentInterceptor } from "x402-axios";

// --- Load .env ---
const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);
const envPath = path.resolve(__dirname_env, "./.env");
dotenv.config({ path: envPath });
// ---------------------------

// --- Environment Variable Checks ---
let clientPrivateKey = process.env.PRIVATE_KEY as Hex | undefined;
// if not prefixed, add 0x as prefix
if (clientPrivateKey && !clientPrivateKey.startsWith("0x")) {
  clientPrivateKey = "0x" + clientPrivateKey;
}

const providerUrl = process.env.PROVIDER_URL;

if (!clientPrivateKey || !providerUrl) {
  console.error("Missing PRIVATE_KEY or PROVIDER_URL in .env file");
  process.exit(1);
}
// ----------------------------------------

// --- Viem Client Setup ---
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);
const clientWallet = createWalletClient({
  account: clientAccount,
  chain: baseSepolia,
  transport: http(providerUrl),
}).extend(publicActions);

// --- Axios Setup with x402 Interceptor ---
const resourceServerPort = 4023; // Port for the VRF resource server
const resourceServerUrl = `http://localhost:${resourceServerPort}`;
const requestMintUrl = `${resourceServerUrl}/request-mint`;

let axiosInstance = axios.create();
// Apply the x402 interceptor to handle payments
axiosInstance = withPaymentInterceptor(axiosInstance, clientWallet);

// --- Main Execution ---
async function makeMintRequest() {
  console.log(
    `Client: Requesting NFT mint from ${requestMintUrl} using wallet ${clientAccount.address}`,
  );

  try {
    // Make the POST request. The x402 interceptor handles the 402 payment flow.
    const response = await axiosInstance.post(requestMintUrl, {});

    console.log("Client: Success! Resource Server Response:");
    console.log(" Status:", response.status);
    console.log(" Data:", JSON.stringify(response.data, null, 2));
    console.log(
      "Check the NFT on testnet.opensea.io, using the NFT Contract's address: '0xcD8841f9a8Dbc483386fD80ab6E9FD9656Da39A2'. You can also check the NFT contract's transactions on Base Sepolia's explorer: https://sepolia.basescan.org/address/0xcD8841f9a8Dbc483386fD80ab6E9FD9656Da39A2.",
    );
  } catch (error: any) {
    console.error("Client: Request failed!");
    if (axios.isAxiosError(error)) {
      console.error(` Error: ${error.message}`);
      if (error.response) {
        console.error(` Status: ${error.response.status}`);
        console.error(` Data: ${JSON.stringify(error.response.data, null, 2)}`);
        if (error.response.status === 402) {
          console.error(" (Payment was required but failed. Check facilitator/resource logs)");
        }
      } else {
        console.error(" (No response received from server)");
      }
    } else {
      console.error(" Unexpected Error:", error);
    }
    process.exit(1);
  }
}

makeMintRequest();
