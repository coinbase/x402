/* eslint-env node */
import { config } from "dotenv";
import express from "express";
import { verify, settle } from "x402/facilitator";
import {
  PaymentRequirementsSchema,
  PaymentRequirements,
  evm,
  PaymentPayload,
  PaymentPayloadSchema,
} from "x402/types";

config();

const { PRIVATE_KEY, PORT } = process.env;

if (!PRIVATE_KEY || !PORT) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const { createClientSepolia, createSignerSepolia } = evm;

const app = express();
const port = parseInt(PORT);

// Configure express to parse JSON bodies
app.use(express.json());

type VerifyRequest = {
  payload: PaymentPayload;
  details: PaymentRequirements;
};

type SettleRequest = {
  payload: PaymentPayload;
  details: PaymentRequirements;
};

const client = createClientSepolia();

app.get("/verify", (req, res) => {
  res.json({
    endpoint: "/verify",
    description: "POST to verify x402 payments",
    body: {
      payload: "string",
      details: "PaymentRequirements",
    },
  });
});

app.post("/verify", async (req, res) => {
  try {
    const body: VerifyRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.details);
    const paymentPayload = PaymentPayloadSchema.parse(body.payload);
    const valid = await verify(client, paymentPayload, paymentRequirements);
    res.json(valid);
  } catch {
    res.status(400).json({ error: "Invalid request" });
  }
});

app.get("/settle", (req, res) => {
  res.json({
    endpoint: "/settle",
    description: "POST to settle x402 payments",
    body: {
      payload: "string",
      details: "PaymentRequirements",
    },
  });
});

app.post("/settle", async (req, res) => {
  try {
    const signer = createSignerSepolia(PRIVATE_KEY as `0x${string}`);
    const body: SettleRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.details);
    const paymentPayload = PaymentPayloadSchema.parse(body.payload);
    const response = await settle(signer, paymentPayload, paymentRequirements);
    res.json(response);
  } catch {
    res.status(400).json({ error: "Invalid request" });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
