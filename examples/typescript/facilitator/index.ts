/* eslint-env node */
import { config } from "dotenv";
import express, { Request, Response } from "express";
import { verify, settle } from "x402/facilitator";
import {
  PaymentRequirementsSchema,
  type PaymentRequirements,
  type PaymentPayload,
  PaymentPayloadSchema,
  createSigner,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  Signer,
  ConnectedClient,
  SupportedPaymentKind,
  isSvmSignerWallet,
  type X402Config,
} from "x402/types";

config();

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY || "";
const SVM_PRIVATE_KEY = process.env.SVM_PRIVATE_KEY || "";
const SVM_RPC_URL = process.env.SVM_RPC_URL || "";

if (!EVM_PRIVATE_KEY && !SVM_PRIVATE_KEY) {
  console.error("Missing required environment variables");
  process.exit(1);
}

// Create X402 config with custom RPC URL if provided
const x402Config: X402Config | undefined = SVM_RPC_URL
  ? { svmConfig: { rpcUrl: SVM_RPC_URL } }
  : undefined;

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

    // use the correct client/signer based on the requested network
    // For EVM with Permit/Permit2, we need a Signer to access facilitator's address
    // For SVM, we always need a Signer because it signs & simulates the txn
    let client: Signer | ConnectedClient;
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      // Use Signer instead of ConnectedClient for Permit/Permit2 verification
      // which requires checking if the spender matches facilitator's address
      client = await createSigner(paymentRequirements.network, EVM_PRIVATE_KEY);
    } else if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      client = await createSigner(paymentRequirements.network, SVM_PRIVATE_KEY);
    } else {
      throw new Error("Invalid network");
    }

    // verify
    const valid = await verify(client, paymentPayload, paymentRequirements, x402Config);
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

  // evm - supports multiple authorization types
  if (EVM_PRIVATE_KEY) {
    // EIP-3009 (USDC transferWithAuthorization)
    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "base",
      extra: {
        authorizationType: "eip3009",
        description: "USDC/EURC with transferWithAuthorization",
      },
    });

    // EIP-2612 (Standard ERC20 Permit)
    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "base",
      extra: {
        authorizationType: "permit",
        description: "ERC20 tokens with EIP-2612 Permit support",
      },
    });

    // Permit2 (Universal token approvals)
    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "base",
      extra: {
        authorizationType: "permit2",
        description: "Any ERC20 token via Uniswap Permit2",
      },
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
    } else {
      throw new Error("Invalid network");
    }

    // settle
    const response = await settle(signer, paymentPayload, paymentRequirements, x402Config);
    res.json(response);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: `Invalid request: ${error}` });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  X402 Facilitator Server`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`  Server listening at http://localhost:${process.env.PORT || 3000}`);
  console.log(`\n  Supported Authorization Types:`);
  if (EVM_PRIVATE_KEY) {
    console.log(`    ✅ EIP-3009  - USDC/EURC transferWithAuthorization`);
    console.log(`    ✅ EIP-2612  - Standard ERC20 Permit`);
    console.log(`    ✅ Permit2   - Universal token approvals (any ERC20)`);
  }
  if (SVM_PRIVATE_KEY) {
    console.log(`    ✅ Solana    - Token transfers on Solana`);
  }
  console.log(`\n  Endpoints:`);
  console.log(`    POST /verify    - Verify payment signatures`);
  console.log(`    POST /settle    - Settle payments on-chain`);
  console.log(`    GET  /supported - List supported payment types`);
  console.log(`═══════════════════════════════════════════════════════\n`);
});
