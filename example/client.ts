/**
 * Note: this is all stuff that we would wrap up in agentkit / other client packages.
 * This code is also purposely longer than it needs to be to show the flow of the payment.
 */
import axios from "axios";
import { paymentDetailsSchema, settleResponseFromHeader } from "x402/types";
import { createPaymentHeader } from "x402/exact/evm";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient } from "viem";
import { Hex } from "viem";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const botWallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex),
}).extend(publicActions);

const resourceUrl = "http://localhost:4021/joke";

console.log("Making request with no payment header");
const res = await axios.get(resourceUrl, { validateStatus: () => true });
console.log(`Received status code: ${res.status}`);
console.log(res.data);

console.log(
  "============================================================================"
);
console.log(
  "This failed because of no payment, now make request with payment header"
);
console.log(
  "============================================================================"
);
await delay(2000);
console.log(res.data.paymentDetails);

const wallet = botWallet;

const paymentDetails = paymentDetailsSchema.parse(res.data.paymentDetails);

const payload = await createPaymentHeader(wallet, paymentDetails);

const res2 = await axios.get(resourceUrl, {
  headers: {
    "X-PAYMENT": payload,
    "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
  },
  validateStatus: () => true,
});

const settleResponse = settleResponseFromHeader(
  res2.headers["x-payment-response"]
);

console.log("Settlement response", settleResponse);

console.log(`Received status code: ${res2.status}`);
console.log(res2.data);
console.log("wow this joke was so funny");
