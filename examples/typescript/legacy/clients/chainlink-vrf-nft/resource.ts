import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import axios from "axios";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { createWalletClient, http, publicActions, Hex, parseAbiItem, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// --- Types for Payment Handling ---
type PaymentDetails = {
  scheme: string;
  network: string;
  maxAmountRequired: string; // Amount in wei
  resource: string;
  description: string;
  mimeType: string;
  payTo: Hex;
  asset: Hex;
  maxTimeoutSeconds: number;
  outputSchema: object;
  extra: object;
};

type ExactEvmPayload = {
  signature: Hex;
  authorization: {
    from: Hex;
    to: Hex;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
    version: string;
  };
};

type XPaymentHeader = {
  x402Version: number;
  scheme: string;
  network?: string; // Expecting network name from x402-axios
  networkId?: string; // Keep for type flexibility, but validation uses network
  payload: ExactEvmPayload;
  resource: string;
};
// ---------------------------

// --- Load .env ---
const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);
const envPath = path.resolve(__dirname_env, "./.env");
dotenv.config({ path: envPath });
// ---------------------------

// --- Environment Variable Checks ---
let resourceServerPrivateKey = process.env.PRIVATE_KEY;
// if not prefixed, add 0x as prefix
if (resourceServerPrivateKey && !resourceServerPrivateKey.startsWith("0x")) {
  resourceServerPrivateKey = "0x" + resourceServerPrivateKey;
}

const providerUrl = process.env.PROVIDER_URL;

if (!resourceServerPrivateKey || !providerUrl) {
  console.error("Missing PRIVATE_KEY or PROVIDER_URL in .env file");
  process.exit(1);
}
// ----------------------------------------

// --- Constants and Setup ---
const PORT = 4023;
const FACILITATOR_PORT = 3000;
const FACILITATOR_URL = `http://localhost:${FACILITATOR_PORT}`;
const NFT_CONTRACT_ADDRESS = "0xcD8841f9a8Dbc483386fD80ab6E9FD9656Da39A2" as Hex;
const USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Hex; // Base Sepolia USDC
const REQUIRED_USDC_PAYMENT = "50000"; // 0.05 USDC (50000 wei, assuming 6 decimals)
const PAYMENT_RECIPIENT_ADDRESS = "0x52eE5a881287486573cF5CB5e7E7D92F30b03014" as Hex; // TODO @dev - put in your second wallet address as Resource server wallet
const MINT_ETH_VALUE_STR = "0.01"; // Estimated ETH needed for VRF fee
const SCHEME = "exact";

// --- Viem Client for Resource Server ---
const resourceServerAccount = privateKeyToAccount(resourceServerPrivateKey as Hex);
const resourceServerWalletClient = createWalletClient({
  account: resourceServerAccount,
  chain: baseSepolia,
  transport: http(providerUrl),
}).extend(publicActions);

// --- NFT Contract ABI ---
const nftContractAbi = [
  parseAbiItem(
    "function requestNFT(address _recipient) external payable returns (uint256 requestId)",
  ),
];

// --- Payment Details object (matching PaymentRequirementsSchema) ---
// This format is needed for both the 402 response (for x402-axios)
// and the facilitator calls (for its internal validation).
const paymentDetailsRequired: PaymentDetails = {
  scheme: SCHEME,
  network: baseSepolia.network, // Use network name string
  maxAmountRequired: REQUIRED_USDC_PAYMENT,
  resource: `http://localhost:${PORT}/request-mint`,
  description: "Request to mint a VRF NFT",
  mimeType: "application/json",
  payTo: PAYMENT_RECIPIENT_ADDRESS,
  maxTimeoutSeconds: 60,
  asset: USDC_CONTRACT_ADDRESS,
  outputSchema: {},
  extra: {
    name: "",
    version: "2"
  },
};

// --- Hono App ---
const app = new Hono();
app.use("*", logger());

// --- POST /request-mint Endpoint ---
app.post("/request-mint", async c => {
  console.log("INFO ResourceServer: Received POST /request-mint");
  const paymentHeaderBase64 = c.req.header("X-PAYMENT");

  // 1. Return 402 if no payment header as per the x402 spec.
  if (!paymentHeaderBase64) {
    console.log("INFO ResourceServer: No X-PAYMENT header found. Responding 402.");
    console.info("Resource Server sent back: ", {
      x402Version: 1,
      accepts: [paymentDetailsRequired],
      error: "Payment required",
    });
    // Use the single, correctly formatted details object
    return c.json(
      { x402Version: 1, accepts: [paymentDetailsRequired], error: "Payment required" },
      402,
    );
  }

  // 2. Decode Payment Header
  let paymentHeader: XPaymentHeader;
  try {
    const paymentHeaderJson = Buffer.from(paymentHeaderBase64, "base64").toString("utf-8");
    paymentHeader = JSON.parse(paymentHeaderJson);
    console.log("DEBUG: Decoded X-PAYMENT header:", JSON.stringify(paymentHeader, null, 2)); // Log the decoded payment header
    // Basic validation - check network name now
    if (
      paymentHeader.scheme !== SCHEME ||
      paymentHeader.network !== baseSepolia.network ||
      !paymentHeader.payload?.authorization?.from
    ) {
      throw new Error("Invalid or incomplete payment header content.");
    }
  } catch (err: any) {
    console.error("ERROR ResourceServer: Error decoding/parsing X-PAYMENT header:", err);
    return c.json({ error: "Invalid payment header format.", details: err.message }, 400);
  }

  // >>> Decode payment header for facilitator calls <<<
  // Note @dev :  This should technically be caught by the previous block, but as a safeguard:
  let decodedPaymentPayload: XPaymentHeader;
  try {
    const paymentHeaderJson = Buffer.from(paymentHeaderBase64, "base64").toString("utf-8");
    // We could validate this against PaymentPayloadSchema here, but facilitator also validates
    decodedPaymentPayload = JSON.parse(paymentHeaderJson);
  } catch (err: any) {
    console.error(
      "ERROR ResourceServer: Double-check failed on decoding/parsing X-PAYMENT header:",
      err,
    );
    return c.json(
      { error: "Invalid payment header format (internal parse).", details: err.message },
      400,
    );
  }

  // 3. Verify Payment with Facilitator
  try {
    console.log(`INFO ResourceServer: Verifying payment with Facilitator at ${FACILITATOR_URL}...`);
    // Send the single, correctly formatted details object
    const verifyResponse = await axios.post(`${FACILITATOR_URL}/verify`, {
      paymentPayload: decodedPaymentPayload,
      paymentRequirements: paymentDetailsRequired,
    });
    const verificationResult: { isValid: boolean; invalidReason: string | null } =
      verifyResponse.data;
    console.log("INFO ResourceServer: Facilitator /verify response:", verificationResult);
    if (!verificationResult?.isValid) {
      console.log("INFO ResourceServer: Payment verification failed. Responding 402.");
      // Use the single, correctly formatted details object
      return c.json(
        {
          x402Version: 1,
          accepts: [paymentDetailsRequired],
          error: "Payment verification failed.",
          details: verificationResult?.invalidReason || "Unknown",
        },
        402,
      );
    }
  } catch (err: any) {
    console.error(
      "ERROR ResourceServer: Error calling facilitator /verify:",
      err.response?.data || err.message,
    );
    return c.json({ error: "Facilitator verification call failed." }, 500);
  }

  // 4. Mint NFT (Verification Passed)
  const recipientAddress = decodedPaymentPayload.payload.authorization.from;
  let mintTxHash: Hex | null = null;
  try {
    console.log(
      `INFO ResourceServer: Initiating NFT mint for ${recipientAddress} on contract ${NFT_CONTRACT_ADDRESS}...`,
    );
    mintTxHash = await resourceServerWalletClient.writeContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: nftContractAbi,
      functionName: "requestNFT",
      args: [recipientAddress],
      value: parseEther(MINT_ETH_VALUE_STR), // Include estimated ETH value
    });
    console.log(`INFO ResourceServer: NFT Mint transaction sent: ${mintTxHash}`);
  } catch (err: any) {
    console.error("ERROR ResourceServer: Error sending NFT mint transaction:", err);
    return c.json({ error: "Failed to initiate NFT minting.", details: err.message }, 500);
  }

  // 5. Settle Payment with Facilitator
  let settlementResult: { success: boolean; error: string | null; txHash: Hex | null } = {
    success: false,
    error: "Settlement not attempted",
    txHash: null,
  };
  try {
    console.log(`INFO ResourceServer: Settling payment with Facilitator at ${FACILITATOR_URL}...`);
    // Send the single, correctly formatted details object
    const settleResponse = await axios.post(`${FACILITATOR_URL}/settle`, {
      paymentPayload: decodedPaymentPayload,
      paymentRequirements: paymentDetailsRequired,
    });
    settlementResult = settleResponse.data;
    console.log("INFO ResourceServer: Facilitator /settle response:", settlementResult);
    if (!settlementResult?.success) {
      console.error("WARN ResourceServer: Facilitator settlement failed:", settlementResult?.error);
    }
  } catch (err: any) {
    // Log settlement error but don't necessarily fail the request for the client
    console.error(
      "ERROR ResourceServer: Error calling facilitator /settle:",
      err.response?.data || err.message,
    );
  }

  // 6. Respond to Client
  console.log("INFO ResourceServer: Responding 200 OK to client.");
  return c.json({
    message: "NFT mint request initiated successfully.",
    nftMintTxHash: mintTxHash,
  });
});

// --- Fallback Handler ---
// Catches any requests not matching defined routes
app.all("*", c => {
  console.log(
    `INFO ResourceServer: Received ${c.req.method} on unhandled path ${c.req.url}. Responding 404.`,
  );
  return c.json({ error: "Not Found" }, 404);
});

// --- Start Server ---
console.log(`VRF NFT Resource Server running on port ${PORT}`);
console.log(` - Resource Server Wallet: ${resourceServerAccount.address}`);
console.log(` - NFT Contract: ${NFT_CONTRACT_ADDRESS}`);
console.log(
  ` - Payment Required: ${REQUIRED_USDC_PAYMENT} wei USDC (${USDC_CONTRACT_ADDRESS}) to ${PAYMENT_RECIPIENT_ADDRESS}`,
);
console.log(` - Facilitator URL: ${FACILITATOR_URL}`);

serve({
  port: PORT,
  fetch: app.fetch,
});
