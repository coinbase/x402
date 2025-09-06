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
  SupportedHederaNetworks,
  Signer,
  ConnectedClient,
  SupportedPaymentKind,
  isSvmSignerWallet,
  isHederaSignerWallet,
} from "x402/types";

config();

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY || "";
const SVM_PRIVATE_KEY = process.env.SVM_PRIVATE_KEY || "";
const HEDERA_PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY || "";
const HEDERA_ACCOUNT_ID = process.env.HEDERA_ACCOUNT_ID || "";

if (!EVM_PRIVATE_KEY && !SVM_PRIVATE_KEY && !HEDERA_PRIVATE_KEY) {
  console.error("Missing required environment variables");
  console.error(
    "Provide at least one of: EVM_PRIVATE_KEY, SVM_PRIVATE_KEY, or HEDERA_PRIVATE_KEY (with HEDERA_ACCOUNT_ID)",
  );
  process.exit(1);
}

// Validate Hedera configuration
if (HEDERA_PRIVATE_KEY && !HEDERA_ACCOUNT_ID) {
  console.error("HEDERA_ACCOUNT_ID is required when HEDERA_PRIVATE_KEY is provided");
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
    const body: VerifyRequest = req.body;
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);

    // use the correct client/signer based on the requested network
    // svm and hedera verify require a Signer because they sign & simulate the txn
    let client: Signer | ConnectedClient;
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      client = createConnectedClient(paymentRequirements.network);
    } else if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      client = await createSigner(paymentRequirements.network, SVM_PRIVATE_KEY);
    } else if (SupportedHederaNetworks.includes(paymentRequirements.network)) {
      const hederaPrivateKeyWithAccount = `${HEDERA_PRIVATE_KEY}|${HEDERA_ACCOUNT_ID}`;
      client = await createSigner(paymentRequirements.network, hederaPrivateKeyWithAccount);
    } else {
      throw new Error("Invalid network");
    }

    // verify
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
  let kinds: SupportedPaymentKind[] = [];

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

  // hedera
  if (HEDERA_PRIVATE_KEY && HEDERA_ACCOUNT_ID) {
    const hederaPrivateKeyWithAccount = `${HEDERA_PRIVATE_KEY}|${HEDERA_ACCOUNT_ID}`;
    const signer = await createSigner("hedera-testnet", hederaPrivateKeyWithAccount);
    const feePayer = isHederaSignerWallet(signer) ? signer.accountId.toString() : undefined;

    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "hedera-testnet",
      extra: {
        feePayer,
      },
    });

    // Also support mainnet if available
    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "hedera-mainnet",
      extra: {
        feePayer,
      },
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

    // use the correct private key based on the requested network
    let signer: Signer;
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      signer = await createSigner(paymentRequirements.network, EVM_PRIVATE_KEY);
    } else if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      signer = await createSigner(paymentRequirements.network, SVM_PRIVATE_KEY);
    } else if (SupportedHederaNetworks.includes(paymentRequirements.network)) {
      const hederaPrivateKeyWithAccount = `${HEDERA_PRIVATE_KEY}|${HEDERA_ACCOUNT_ID}`;
      signer = await createSigner(paymentRequirements.network, hederaPrivateKeyWithAccount);
    } else {
      throw new Error("Invalid network");
    }

    // settle
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
