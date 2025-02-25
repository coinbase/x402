import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { createWalletClient, Hex, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { verify, settle } from "x402/server";
import { paymentDetailsSchema, PaymentDetails } from "x402/types";

const port = 4020;

type VerifyRequest = {
  payload: string;
  details: PaymentDetails;
};

type SettleRequest = {
  payload: string;
  details: PaymentDetails;
};

const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(
    process.env.FACILITATOR_WALLET_PRIVATE_KEY as Hex
  ),
}).extend(publicActions);

const app = new Hono();
app.use("*", logger());

app.post("/verify", async (c) => {
  // TODO: add zod validation
  const req: VerifyRequest = await c.req.json();

  console.log("verifying request", {
    payload: req.payload,
    details: req.details,
  });

  const paymentDetails = paymentDetailsSchema.parse(req.details);

  const valid = await verify(wallet, req.payload, paymentDetails);

  console.log("verification result", valid);
  return c.json(valid);
});

app.post("/settle", async (c) => {
  const req: SettleRequest = await c.req.json();

  const paymentDetails = paymentDetailsSchema.parse(req.details);

  console.log("settling request", {
    payload: req.payload,
    details: paymentDetails,
  });

  const res = await settle(wallet, req.payload, paymentDetails);

  console.log("settlement result", res);
  return c.json(res);
});

console.log(`Facilitator running on port ${port}`);

serve({
  port: port,
  fetch: app.fetch,
});
