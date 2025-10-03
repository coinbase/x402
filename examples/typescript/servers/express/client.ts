import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withDeferredPaymentInterceptor } from "x402-axios";
import axios from "axios";
import { baseSepolia } from "viem/chains";

// Create a wallet client
const account = privateKeyToAccount(
  "0x7492e7f8c59dd58f73a500c7d38b763cc525273cfb195fdc5862e495b257b41a",
);
const client = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
});

// Create an Axios instance with payment handling
const api = withDeferredPaymentInterceptor(
  axios.create({ baseURL: "http://localhost:3002" }),
  client,
);

// Make a request that may require payment
const response = await api.get("/premium-joke");
console.log(response.data);
