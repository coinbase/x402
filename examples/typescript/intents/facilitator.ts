import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { verify, settle } from "x402/facilitator";
import {
  evm,
  PaymentPayload,
  PaymentPayloadSchema,
  PaymentRequirements,
  PaymentRequirementsSchema,
} from "x402/types";

const port = 4020;

type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

type SettleRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

const { createClientBase, createSignerBase } = evm;

const client = createClientBase();

const app = new Hono();
app.use("*", logger());

app.post("/verify", async c => {
  const req: VerifyRequest = await c.req.json();

  const paymentRequirements = PaymentRequirementsSchema.parse(req.paymentRequirements);
  const paymentPayload = PaymentPayloadSchema.parse(req.paymentPayload);

  console.log("verifying request", {
    payload: paymentPayload,
    requirements: paymentRequirements,
  });

  const valid = await verify(client, paymentPayload, paymentRequirements);

  console.log("verification result", valid);
  return c.json(valid);
});

app.post("/settle", async c => {
  const req: SettleRequest = await c.req.json();

  const paymentRequirements = PaymentRequirementsSchema.parse(req.paymentRequirements);
  const paymentPayload = PaymentPayloadSchema.parse(req.paymentPayload);

  console.log("settling request", {
    payload: paymentPayload,
    requirements: paymentRequirements,
  });

  const signer = createSignerBase(process.env.FACILITATOR_WALLET_PRIVATE_KEY as `0x${string}`);

  const res = await settle(signer, paymentPayload, paymentRequirements);

  console.log("settlement result", res);
  return c.json(res);
});

console.log(`Facilitator running on port ${port}`);

serve({
  port: port,
  fetch: app.fetch,
});
