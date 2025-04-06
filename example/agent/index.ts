import { paymentDetailsSchema, Money } from "x402/types";
import { createPaymentHeader } from "x402/client";

import { http, publicActions, createWalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { Hex } from "viem";
import Anthropic from "@anthropic-ai/sdk";
import { fetchWithPayment } from "x402/fetch";

const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex),
}).extend(publicActions);

console.log(wallet.account);

const anthropic = new Anthropic({
  baseURL: "http://localhost:4021",
  apiKey: "not needed",
  fetch: fetchWithPayment(fetch, wallet),
});

const msg = await anthropic.messages.create({
  model: "claude-3-7-sonnet-20250219",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, Claude do you know what x402 is?" }],
});
console.log(msg);
