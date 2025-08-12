/* eslint-env node */
import { config } from "dotenv";
import express, { Request, Response } from "express";
import { verify, settle } from "x402/facilitator";
import {
  PaymentRequirementsSchema,
  type PaymentRequirements,
  type PaymentPayload,
  PaymentPayloadSchema,
  createConnectedClient,
  createSigner,
  // isSvmSignerWallet, // uncomment for solana
} from "x402/types";

config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

// Configure express to parse JSON bodies
app.use(express.json());

type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

type SettleRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

app.post("/verify", async (req: Request, res: Response) => {
  try {
    // const client = await createSigner("solana-devnet", PRIVATE_KEY);  // uncomment for solana
    const client = createConnectedClient("base-sepolia");
    const body: VerifyRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    const valid = await verify(client, paymentPayload, paymentRequirements);
    res.json(valid);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: "Invalid request" });
  }
});

app.get("/settle", (req: Request, res: Response) => {
  res.json({
    endpoint: "/settle",
    description: "POST to settle x402 payments",
    body: {
      paymentPayload: "PaymentPayload",
      paymentRequirements: "PaymentRequirements",
    },
  });
});

app.get("/supported", async (req: Request, res: Response) => {
  //// uncomment for solana
  // const signer = await createSigner("solana-devnet", PRIVATE_KEY);
  // const feePayer = isSvmSignerWallet(signer) ? signer.address : undefined;

  res.json({
    kinds: [
      {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
      },
      // uncomment for solana
      // {
      //   x402Version: 1,
      //   scheme: "exact",
      //   network: "solana-devnet",
      //   extra: {
      //     feePayer,
      //   },
      // },
    ],
  });
});

app.post("/settle", async (req: Request, res: Response) => {
  try {
    // const signer = await createSigner("solana-devnet", PRIVATE_KEY);  // uncomment for solana
    const signer = await createSigner("base-sepolia", PRIVATE_KEY);
    const body: SettleRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    const response = await settle(signer, paymentPayload, paymentRequirements);
    res.json(response);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: `Invalid request: ${error}` });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server listening at http://localhost:${process.env.PORT || 3000}`);
});
