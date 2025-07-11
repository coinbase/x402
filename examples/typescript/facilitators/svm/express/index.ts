/* eslint-env node */
import { config } from "dotenv";
import express, { type Request, type Response } from "express";
import { verify, settle, getFeePayer } from "x402/facilitator";
import {
  PaymentRequirementsSchema,
  type PaymentRequirements,
  type PaymentPayload,
  PaymentPayloadSchema,
} from "x402/types";
import { svm } from "x402/shared";

config();

const privateKey = process.env.PRIVATE_KEY;

if (!privateKey) {
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

type FeePayerRequest = {
  paymentRequirements: PaymentRequirements;
};

const { createSignerFromBase58 } = svm;

app.get("/verify", (req: Request, res: Response) => {
  res.json({
    endpoint: "/verify",
    description: "POST to verify x402 payments",
    body: {
      paymentPayload: "PaymentPayload",
      paymentRequirements: "PaymentRequirements",
    },
  });
});

app.post("/verify", async (req: Request, res: Response) => {
  try {
    const body: VerifyRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    const signer = await createSignerFromBase58(privateKey);

    const valid = await verify(signer, paymentPayload, paymentRequirements);
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

app.get("/supported", (req: Request, res: Response) => {
  res.json({
    kinds: [
      {
        x402Version: 1,
        scheme: "exact",
        network: "solana-devnet",
      },
      {
        x402Version: 1,
        scheme: "exact",
        network: "solana-mainnet",
      },
    ],
  });
});

app.post("/settle", async (req: Request, res: Response) => {
  try {
    const body: SettleRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    const signer = await createSignerFromBase58(privateKey);

    const result = await settle(signer, paymentPayload, paymentRequirements);
    res.json(result);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: `Invalid request: ${error}` });
  }
});

// fee payer endpoint
app.get("/fee-payer", (req: Request, res: Response) => {
  res.json({
    endpoint: "/fee-payer",
    description:
      "POST to get the facilitator's public address that will sponsor the gas fee for the transaction",
    body: {
      paymentRequirements: "PaymentRequirements",
    },
  });
});

app.post("/fee-payer", async (req: Request, res: Response) => {
  try {
    // load the private key from the environment variable
    const signer = await createSignerFromBase58(privateKey);

    // parse the payment requirements from the request body
    const body: FeePayerRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);

    // get the fee payer
    const feePayer = await getFeePayer(signer, paymentRequirements);

    // return the fee payer
    res.json(feePayer);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: `Invalid request: ${error}` });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server listening at http://localhost:${process.env.PORT || 3000}`);
});
