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
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  Signer,
  ConnectedClient,
  SupportedPaymentKind,
  isSvmSignerWallet,
  sui,
} from "x402/types";

config();

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY || "";
const SVM_PRIVATE_KEY = process.env.SVM_PRIVATE_KEY || "";
const SUI_MAINNET_RPC_URL = process.env.SUI_MAINNET_RPC_URL || "";
const SUI_TESTNET_RPC_URL =
  process.env.SUI_TESTNET_RPC_URL || "https://fullnode.testnet.sui.io:443";

// if (!EVM_PRIVATE_KEY && !SVM_PRIVATE_KEY && !SUI_MAINNET_RPC_URL) {
//   // TODO: should this indicate the missing environment variables, and should they all be required?
//   // Code below assumes they are all set
//   console.error("Missing required environment variables");
//   process.exit(1);
// }

const app = express();

// Configure express to parse JSON bodies
app.use(express.json());

type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  x402Version?: number; // Optional to support Python client format
};

type SettleRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  x402Version?: number; // Optional to support Python client format
};

app.post("/verify", async (req: Request, res: Response) => {
  try {
    console.log("[verify] Received request");
    const body: VerifyRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);

    console.log("[verify] Payment Requirements:", {
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      asset: paymentRequirements.asset,
      payTo: paymentRequirements.payTo,
      maxAmountRequired: paymentRequirements.maxAmountRequired,
      extra: paymentRequirements.extra,
    });
    console.log("[verify] Payment Payload:", {
      scheme: paymentPayload.scheme,
      network: paymentPayload.network,
      payloadKeys: Object.keys(paymentPayload.payload),
    });

    // use the correct client/signer based on the requested network
    // svm verify requires a Signer because it signs & simulates the txn
    let client: Signer | ConnectedClient;
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      client = createConnectedClient(paymentRequirements.network);
    } else if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      client = await createSigner(paymentRequirements.network, SVM_PRIVATE_KEY);
    } else if (paymentPayload.network === "sui-testnet") {
      client = sui.createClient(paymentRequirements.network, SUI_TESTNET_RPC_URL);
    } else if (paymentPayload.network === "sui") {
      client = sui.createClient(paymentRequirements.network, SUI_MAINNET_RPC_URL);
    } else {
      throw new Error("Invalid network");
    }

    const valid = await verify(client, paymentPayload, paymentRequirements);
    console.log("[verify] Result:", valid);
    res.json(valid);
  } catch (error) {
    console.error("[verify] Error:", error);
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
  let kinds: SupportedPaymentKind[] = [];

  // Always include Sui testnet
  kinds.push({
    x402Version: 1,
    scheme: "exact",
    network: "sui-testnet",
  });

  // evm
  if (EVM_PRIVATE_KEY) {
    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
    });
  }

  // svm
  if (SVM_PRIVATE_KEY) {
    const signer = await createSigner("solana-devnet", SVM_PRIVATE_KEY);
    const feePayer = isSvmSignerWallet(signer) ? signer.address : undefined;

    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "solana-devnet",
      extra: {
        feePayer,
      },
    });
  }

  // Sui mainnet (if RPC URL is provided)
  if (SUI_MAINNET_RPC_URL) {
    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "sui",
    });
  }

  res.json({
    kinds,
  });
});

app.post("/settle", async (req: Request, res: Response) => {
  try {
    const body: SettleRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    console.log("[settle] Parsed payment requirements:", paymentRequirements);
    console.log("[settle] Parsed payment payload:", paymentPayload);

    // use the correct private key based on the requested network
    let signerOrClient: Signer | ConnectedClient;
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      signerOrClient = await createSigner(paymentRequirements.network, EVM_PRIVATE_KEY);
    } else if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      signerOrClient = await createSigner(paymentRequirements.network, SVM_PRIVATE_KEY);
    } else if (paymentPayload.network === "sui-testnet") {
      signerOrClient = sui.createClient(paymentRequirements.network, SUI_TESTNET_RPC_URL);
    } else if (paymentPayload.network === "sui") {
      signerOrClient = sui.createClient(paymentRequirements.network, SUI_MAINNET_RPC_URL);
    } else {
      throw new Error("Invalid network");
    }

    const response = await settle(signerOrClient, paymentPayload, paymentRequirements);
    res.json(response);
  } catch {
    res.status(400).json({ error: "Invalid request" });
  }
});

// For local development
if (process.env.NODE_ENV !== "production") {
  app.listen(process.env.PORT || 3000);
  console.log(`[facilitator] Server is running on port ${process.env.PORT || 3000}`);
}

// For Vercel deployment
export default app;
