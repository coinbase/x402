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
  evm,
  X402RequestSchema,
  DeferredEvmPayloadSchema,
} from "x402/types";
import { deferred } from "x402/schemes";

config();

const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY || "";
const SVM_PRIVATE_KEY = process.env.SVM_PRIVATE_KEY || "";

if (!EVM_PRIVATE_KEY && !SVM_PRIVATE_KEY) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();

// Configure express to parse JSON bodies
app.use(express.json());

// Initialize the in-memory voucher store for deferred payments
const voucherStore = new deferred.evm.InMemoryVoucherStore();

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
    // svm verify requires a Signer because it signs & simulates the txn
    let client: Signer | ConnectedClient;
    if (SupportedEVMNetworks.includes(paymentRequirements.network)) {
      client = createConnectedClient(paymentRequirements.network);
    } else if (SupportedSVMNetworks.includes(paymentRequirements.network)) {
      client = await createSigner(paymentRequirements.network, SVM_PRIVATE_KEY);
    } else {
      throw new Error("Invalid network");
    }

    // verify
    const valid = await verify(client, paymentPayload, paymentRequirements, {
      deferred: { voucherStore },
    });
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

  // evm exact
  if (EVM_PRIVATE_KEY) {
    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
    });

    // evm deferred
    kinds.push({
      x402Version: 1,
      scheme: "deferred",
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
    const response = await settle(signer, paymentPayload, paymentRequirements, {
      deferred: { voucherStore },
    });
    res.json(response);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: `Invalid request: ${error}` });
  }
});

// Deferred scheme endpoints

// GET /deferred/vouchers/:id
app.get("/deferred/vouchers/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const vouchers = await voucherStore.getVoucherSeries(id, {});
    res.json(vouchers);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: "Invalid request" });
  }
});

// GET /deferred/vouchers/available/:buyer/:seller
app.get("/deferred/vouchers/available/:buyer/:seller", async (req: Request, res: Response) => {
  try {
    const { buyer, seller } = req.params;
    const voucher = await voucherStore.getAvailableVoucher(buyer, seller);

    if (!voucher) {
      return res.status(404).json({ error: "No vouchers available for this buyer-seller pair" });
    }

    res.json(voucher);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: "Invalid request" });
  }
});

// POST /deferred/vouchers
app.post("/deferred/vouchers", async (req: Request, res: Response) => {
  try {
    const { paymentPayload, paymentRequirements } = X402RequestSchema.parse(req.body);

    // Verify the voucher
    const client = evm.createConnectedClient(paymentPayload.network);
    const verifyResponse = await verify(client, paymentPayload, paymentRequirements, {
      deferred: { voucherStore },
    });

    if (!verifyResponse.isValid) {
      return res.status(400).json(verifyResponse);
    }

    // Extract and store the voucher
    const { signature, voucher } = DeferredEvmPayloadSchema.parse(paymentPayload.payload);
    const signedVoucher = { ...voucher, signature };
    const result = await voucherStore.storeVoucher(signedVoucher);

    if (!result.success) {
      return res.status(400).json({
        error: result.error ?? "Unknown voucher storage error",
        details: { voucher: signedVoucher },
      });
    }

    res.status(201).json(signedVoucher);
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ error: "Invalid request" });
  }
});

// POST /deferred/vouchers/:id/:nonce/settle
app.post("/deferred/vouchers/:id/:nonce/settle", async (req: Request, res: Response) => {
  try {
    const { id, nonce } = req.params;
    const nonceNum = parseInt(nonce, 10);

    if (isNaN(nonceNum)) {
      return res.status(400).json({ success: false, error: "Invalid nonce" });
    }

    const voucher = await voucherStore.getVoucher(id, nonceNum);
    if (!voucher) {
      return res.status(404).json({ success: false, error: "Voucher not found" });
    }

    // Get the signer for the voucher's network
    const signer = evm.createSigner("base-sepolia", EVM_PRIVATE_KEY as `0x${string}`);

    // Extract signature and voucher data
    const { signature, ...voucherData } = voucher;

    // Settle the voucher
    const response = await deferred.evm.settleVoucher(signer, voucherData, signature, voucherStore);

    if (!response.success) {
      return res.status(400).json({
        success: false,
        error: response.errorReason || "Settlement failed",
      });
    }

    res.json({
      success: true,
      transactionHash: response.transaction,
      network: response.network || "base-sepolia",
    });
  } catch (error) {
    console.error("error", error);
    res.status(400).json({ success: false, error: `Settlement failed: ${error}` });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server listening at http://localhost:${process.env.PORT || 3000}`);

  console.log(
    `For deferred voucher history: GET http://localhost:${process.env.PORT || 3000}/deferred/vouchers/:id`,
  );
  console.log(
    `To settle a deferred voucher: POST http://localhost:${process.env.PORT || 3000}/deferred/vouchers/:id/:nonce/settle`,
  );
});
