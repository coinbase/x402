import { config } from "dotenv";
import express from "express";
import { exact } from "x402/schemes";
import {
  Network,
  PaymentPayload,
  PaymentRequirements,
  Price,
  Resource,
  settleResponseHeader,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import { processPriceToAtomicAmount, findMatchingPaymentRequirements } from "x402/shared";

config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}`;

if (!facilitatorUrl || !payTo) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const app = express();
const { verify, settle } = useFacilitator({ url: facilitatorUrl });
const x402Version = 1;

/**
 * Creates payment requirements for a given price and network
 *
 * @param price - The price to be paid for the resource
 * @param network - The blockchain network to use for payment
 * @param resource - The resource being accessed
 * @param description - Optional description of the payment
 * @returns An array of payment requirements
 */
function createExactPaymentRequirements(
  price: Price,
  network: Network,
  resource: Resource,
  description = "",
): PaymentRequirements {
  const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
  if ("error" in atomicAmountForAsset) {
    throw new Error(atomicAmountForAsset.error);
  }
  const { maxAmountRequired, asset } = atomicAmountForAsset;

  return {
    scheme: "exact",
    network,
    maxAmountRequired,
    resource,
    description,
    mimeType: "",
    payTo: payTo,
    maxTimeoutSeconds: 60,
    asset: asset.address,
    outputSchema: undefined,
    extra: {
      name: asset.eip712.name,
      version: asset.eip712.version,
    },
  };
}

/**
 * Verifies a payment and handles the response
 *
 * @param req - The Express request object
 * @param res - The Express response object
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A promise that resolves to true if payment is valid, false otherwise
 */
async function verifyPayment(
  req: express.Request,
  res: express.Response,
  paymentRequirements: PaymentRequirements[],
): Promise<boolean> {
  const payment = req.header("X-PAYMENT");
  if (!payment) {
    res.status(402).json({
      x402Version,
      error: "X-PAYMENT header is required",
      accepts: paymentRequirements,
    });
    return false;
  }

  let decodedPayment: PaymentPayload;
  try {
    decodedPayment = exact.evm.decodePayment(payment);
    decodedPayment.x402Version = x402Version;
  } catch (error) {
    res.status(402).json({
      x402Version,
      error: error || "Invalid or malformed payment header",
      accepts: paymentRequirements,
    });
    return false;
  }

  try {
    const selectedPaymentRequirement =
      findMatchingPaymentRequirements(paymentRequirements, decodedPayment) ||
      paymentRequirements[0];
    const response = await verify(decodedPayment, selectedPaymentRequirement);
    if (!response.isValid) {
      res.status(402).json({
        x402Version,
        error: response.invalidReason,
        accepts: paymentRequirements,
        payer: response.payer,
      });
      return false;
    }
  } catch (error) {
    res.status(402).json({
      x402Version,
      error,
      accepts: paymentRequirements,
    });
    return false;
  }

  return true;
}

// Delayed settlement example endpoint
app.get("/delayed-settlement", async (req, res) => {
  const resource = `${req.protocol}://${req.headers.host}${req.originalUrl}` as Resource;
  const paymentRequirements = [
    createExactPaymentRequirements(
      "$0.001",
      // network: "base" // uncomment for Base mainnet
      "base-sepolia",
      resource,
      "Access to weather data (async)",
    ),
  ];

  const isValid = await verifyPayment(req, res, paymentRequirements);
  if (!isValid) return;

  // Return weather data immediately
  res.json({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });

  // Process payment asynchronously
  try {
    const settleResponse = await settle(
      exact.evm.decodePayment(req.header("X-PAYMENT")!),
      paymentRequirements[0],
    );
    const responseHeader = settleResponseHeader(settleResponse);
    // In a real application, you would store this response header
    // and associate it with the payment for later verification
    console.log("Payment settled:", responseHeader);
  } catch (error) {
    console.error("Payment settlement failed:", error);
    // In a real application, you would handle the failed payment
    // by marking it for retry or notifying the user
  }
});

// Dynamic price example endpoint
app.get("/dynamic-price", async (req, res) => {
  // Use query params, body, or external factors to determine if price is impacted
  const multiplier = parseInt((req.query.multiplier as string) ?? "1");
  // Adjust pricing based on impact from inputs
  const price = 0.001 * multiplier;

  const resource = `${req.protocol}://${req.headers.host}${req.originalUrl}` as Resource;
  const paymentRequirements = [
    createExactPaymentRequirements(
      price, // Expect dynamic pricing
      // network: "base" // uncomment for Base mainnet
      "base-sepolia",
      resource,
      "Access to weather data",
    ),
  ];

  const isValid = await verifyPayment(req, res, paymentRequirements);
  if (!isValid) return;

  try {
    // Process payment synchronously
    const settleResponse = await settle(
      exact.evm.decodePayment(req.header("X-PAYMENT")!),
      paymentRequirements[0],
    );
    const responseHeader = settleResponseHeader(settleResponse);
    res.setHeader("X-PAYMENT-RESPONSE", responseHeader);

    // Return the weather data
    res.json({
      report: {
        success: "sunny",
        temperature: 70,
      },
    });
  } catch (error) {
    res.status(402).json({
      x402Version,
      error,
      accepts: paymentRequirements,
    });
  }
});

// Multiple payment requirements example endpoint
app.get("/multiple-payment-requirements", async (req, res) => {
  const resource = `${req.protocol}://${req.headers.host}${req.originalUrl}` as Resource;

  // Payment requirements is an array. You can mix and match tokens, prices, and networks.
  const paymentRequirements = [
    createExactPaymentRequirements("$0.001", "base", resource),
    createExactPaymentRequirements(
      {
        amount: "1000",
        asset: {
          address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          decimals: 6,
          eip712: {
            name: "USDC",
            version: "2",
          },
        },
      },
      // network: "base" // uncomment for Base mainnet
      "base-sepolia",
      resource,
    ),
  ];

  const isValid = await verifyPayment(req, res, paymentRequirements);
  if (!isValid) return;

  try {
    // Process payment synchronously
    const decodedPayment = exact.evm.decodePayment(req.header("X-PAYMENT")!);

    // Find the matching payment requirement
    const selectedPaymentRequirement =
      findMatchingPaymentRequirements(paymentRequirements, decodedPayment) ||
      paymentRequirements[0];

    const settleResponse = await settle(decodedPayment, selectedPaymentRequirement);
    const responseHeader = settleResponseHeader(settleResponse);
    res.setHeader("X-PAYMENT-RESPONSE", responseHeader);

    // Return the weather data
    res.json({
      report: {
        success: "sunny",
        temperature: 70,
      },
    });
  } catch (error) {
    res.status(402).json({
      x402Version,
      error,
      accepts: paymentRequirements,
    });
  }
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:4021`);
});
