import { http, publicActions, createWalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { Hex } from "viem";
import Anthropic from "@anthropic-ai/sdk";
import { wrapFetchWithPayment } from "x402-fetch";
import { config } from "dotenv";

config();

const { RESOURCE_SERVER_URL, PRIVATE_KEY } = process.env;

if (!RESOURCE_SERVER_URL || !PRIVATE_KEY) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(PRIVATE_KEY as Hex),
}).extend(publicActions);

const anthropic = new Anthropic({
  baseURL: RESOURCE_SERVER_URL,
  apiKey: "not needed",
  fetch: wrapFetchWithPayment(fetch, wallet),
});

const msg = await anthropic.messages.create({
  model: "claude-3-7-sonnet-20250219",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, Claude do you know what x402 is?" }],
});
console.log(msg);
