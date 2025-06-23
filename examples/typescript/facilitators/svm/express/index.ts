/* eslint-env node */
import { config } from "dotenv";
import express, { Request, Response } from "express";
import { verify, settle, getFeePayer } from "x402/facilitator";
import {
  PaymentRequirementsSchema,
  PaymentRequirements,
  PaymentPayload,
  PaymentPayloadSchema,
} from "x402/types";
import { svm } from "x402/shared";

config();

const privateKey = process.env.PRIVATE_KEY;
const network = process.env.NETWORK;

if (!privateKey) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const {
  createDevnetRpcClient,
  createMainnetRpcClient,
  createSignerFromBase58
} = svm;
const createClient = network === "solana-devnet" ? createDevnetRpcClient : createMainnetRpcClient;

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

const client = createClient();

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
    const valid = await verify(client, paymentPayload, paymentRequirements);
    res.json(valid);
  } catch {
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
        network: "base-sepolia",
      },
    ],
  });
});

app.post("/settle", async (req: Request, res: Response) => {
  try {
    const signer = await createSignerFromBase58(privateKey);
    const body: SettleRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    const response = await settle(signer, paymentPayload, paymentRequirements);
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: `Invalid request: ${error}` });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server listening at http://localhost:${process.env.PORT || 3000}`);
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
    res.status(400).json({ error: `Invalid request: ${error}` });
  }
});