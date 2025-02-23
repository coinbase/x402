/**
 * Note: this is all stuff that we would wrap up in agent kit.
 * This code is also purposely longer than it needs to be to show the flow of the payment.
 */

import axios from "axios";
import { botWallet } from "x402/shared/evm/wallet";
import {
  createPayment,
  createPaymentHeader,
} from "x402/src/client/exact/evm/client";
import { paymentNeededDetailsFromObj } from "x402/src/shared/types/convert";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const paymentDetails = paymentNeededDetailsFromObj(res.data.paymentDetails);

const payload = await createPaymentHeader(wallet, paymentDetails);

const res2 = await axios.get(resourceUrl, {
  headers: {
    "X-PAYMENT": payload,
  },
  validateStatus: () => true,
});

console.log(`Received status code: ${res2.status}`);
console.log(res2.data);
console.log("wow this joke was so funny");
