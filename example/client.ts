/**
 * Note: this is all stuff that we would wrap up in agentkit / other client packages.
 * This code is also purposely longer than it needs to be to show the flow of the payment.
 */
import axios from "axios";
import { withPaymentInterceptor } from "x402/axios";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient } from "viem";
import { Hex } from "viem";

const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex),
}).extend(publicActions);

const resourceUrl = "http://localhost:4021/joke";

let axiosInstance = axios.create({});
axiosInstance = withPaymentInterceptor(axiosInstance, wallet);

console.log("Making request");
const res = await axiosInstance.get(resourceUrl);

console.log(res.data);
console.log("wow this joke was so funny");
