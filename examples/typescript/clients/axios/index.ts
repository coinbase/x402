import { config } from "dotenv";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withPaymentInterceptor } from "x402-axios";
import axios from "axios";
import { baseSepolia } from "viem/chains";

config();

const { RESOURCE_SERVER_URL, PRIVATE_KEY, ENDPOINT_PATH } = process.env;

if (!RESOURCE_SERVER_URL || !PRIVATE_KEY || !ENDPOINT_PATH) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const client = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
}).extend(publicActions);

const api = withPaymentInterceptor(
  axios.create({
    baseURL: `${RESOURCE_SERVER_URL}`,
  }),
  client,
);

api
  .get(`${ENDPOINT_PATH}`)
  .then(response => {
    console.log(response.headers);
    console.log(response.data);
  })
  .catch(error => {
    console.error(error.response?.data?.error);
  });
