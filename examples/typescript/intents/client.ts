import axios from "axios";
import { withPaymentInterceptor } from "x402-axios";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient } from "viem";
import { Hex } from "viem";
import { getNearNep141Balance, publishSwapIntent } from "./intents";
import { BASE_USDC_ASSET_ID, NEAR_USDC_ASSET_ID } from "./constants";

const wallet = createWalletClient({
  chain: base,
  transport: http(),
  account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex),
}).extend(publicActions);

const resourceUrl = "http://localhost:4021/rpc";

let axiosInstance = axios.create({});
axiosInstance = withPaymentInterceptor(axiosInstance, wallet);

const usdcContractId = NEAR_USDC_ASSET_ID.split(":")[1];
const receiverId = "robertyan.near";

const receiverBalance = Number(await getNearNep141Balance(usdcContractId, receiverId)) / 10 ** 6;
console.log(`Receiver USDC balance on NEAR: ${receiverBalance} USDC`);

// Publish an intent that swaps 0.01 Base USDC to NEAR USDC
// The Base USDC is paid via x402 payment protocol
await publishSwapIntent({
  axiosInstance,
  url: resourceUrl,
  signer: wallet,
  receiverId,
  amountIn: 10n ** 6n / 100n, // 0.01 USDC,
  tokenIn: BASE_USDC_ASSET_ID,
  tokenOut: NEAR_USDC_ASSET_ID,
});

const newReceiverBalance = Number(await getNearNep141Balance(usdcContractId, receiverId)) / 10 ** 6;
console.log(
  `Receiver USDC balance on NEAR: ${newReceiverBalance} USDC (increased by ${(newReceiverBalance - receiverBalance).toFixed(6)} USDC)`,
);
