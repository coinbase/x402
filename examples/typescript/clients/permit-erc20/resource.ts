import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import axios from "axios";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { Hex } from "viem";

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "./.env");
dotenv.config({ path: envPath });

// Constants
const PORT = 4024;
const FACILITATOR_URL = "http://localhost:3002";
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Hex; // USDC
const PAYMENT_AMOUNT = "50000"; // 0.05 USDC (50000 wei, assuming 6 decimals)
const PAYMENT_RECIPIENT = "0xaec0188efb73769aedd1ffcbb7c5e1fe468e64e3" as Hex;

// Payment details
const paymentDetails = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: PAYMENT_AMOUNT,
  resource: `http://localhost:${PORT}/protected-resource`,
  description: "Access to protected resource with EIP-2612 Permit",
  mimeType: "application/json",
  payTo: PAYMENT_RECIPIENT,
  maxTimeoutSeconds: 3600,
  asset: USDC_ADDRESS,
  outputSchema: {},
  extra: {
    authorizationType: "permit",
  },
};

// Hono App
const app = new Hono();
app.use("*", logger());

// POST /protected-resource
app.post("/protected-resource", async (c) => {
  console.log("📥 Received POST /protected-resource");
  const paymentHeaderBase64 = c.req.header("X-PAYMENT");

  // Return 402 if no payment header
  if (!paymentHeaderBase64) {
    console.log("💰 No X-PAYMENT header, responding 402 Payment Required");
    return c.json(
      {
        x402Version: 1,
        accepts: [paymentDetails],
        error: "Payment required",
      },
      402
    );
  }

  // Decode payment header
  let paymentHeader;
  try {
    const paymentHeaderJson = Buffer.from(paymentHeaderBase64, "base64").toString("utf-8");
    paymentHeader = JSON.parse(paymentHeaderJson);
    console.log("🔍 Decoded X-PAYMENT header:", JSON.stringify(paymentHeader, null, 2));
  } catch (err) {
    console.error("❌ Error decoding X-PAYMENT header:", err);
    return c.json({ error: "Invalid payment header format" }, 400);
  }

  // Verify payment with Facilitator
  try {
    console.log(`🔐 Verifying payment with Facilitator at ${FACILITATOR_URL}/verify...`);
    const verifyResponse = await axios.post(`${FACILITATOR_URL}/verify`, {
      paymentPayload: paymentHeader,
      paymentRequirements: paymentDetails,
    });

    const verificationResult = verifyResponse.data;
    console.log("✅ Facilitator verify response:", verificationResult);

    if (!verificationResult?.isValid) {
      console.log("❌ Payment verification failed");
      return c.json(
        {
          x402Version: 1,
          accepts: [paymentDetails],
          error: "Payment verification failed",
          details: verificationResult?.invalidReason || "Unknown",
        },
        402
      );
    }
  } catch (err) {
    console.error("❌ Error calling facilitator /verify:", err.response?.data || err.message);
    return c.json({ error: "Facilitator verification failed" }, 500);
  }

  // Settle payment with Facilitator
  try {
    console.log(`💸 Settling payment with Facilitator at ${FACILITATOR_URL}/settle...`);
    const settleResponse = await axios.post(`${FACILITATOR_URL}/settle`, {
      paymentPayload: paymentHeader,
      paymentRequirements: paymentDetails,
    });

    const settlementResult = settleResponse.data;
    console.log("✅ Facilitator settle response:", settlementResult);

    if (!settlementResult?.success) {
      console.error("⚠️  Settlement failed:", settlementResult?.errorReason);
    }
  } catch (err) {
    console.error("❌ Error calling facilitator /settle:", err.response?.data || err.message);
  }

  // Return success response
  console.log("✅ Responding 200 OK to client");
  return c.json({
    message: "Payment verified and settled successfully with EIP-2612 Permit!",
    authorizationType: "permit",
    payer: paymentHeader.payload?.authorization?.owner,
  });
});

// Start server
console.log(`\n═══════════════════════════════════════════`);
console.log(`  EIP-2612 Permit Resource Server`);
console.log(`═══════════════════════════════════════════`);
console.log(`  Port: ${PORT}`);
console.log(`  Token: ${USDC_ADDRESS} (USDC)`);
console.log(`  Payment: ${PAYMENT_AMOUNT} wei (1 DAI)`);
console.log(`  Facilitator: ${FACILITATOR_URL}`);
console.log(`═══════════════════════════════════════════\n`);

serve({
  port: PORT,
  fetch: app.fetch,
});

