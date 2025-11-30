import { NextRequest, NextResponse } from "next/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from "x402/types";
import { verifyLightningWithLnd, settleLightningWithLnd } from "@/app/facilitator/lightning-lnd";

/**
 * x402 Lightning demo resource.
 *
 * Flow:
 * - First request (no X-PAYMENT header) -> 402 with Lightning payment requirements.
 * - Second request with a settled Lightning invoice in X-PAYMENT -> 200 with demo data.
 *
 * @param {NextRequest} request - Incoming request.
 * @returns {Promise<NextResponse>} JSON response with either 402 + payment requirements or 200 + data.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const x402Version = 1 as const;

  // This describes how to pay for THIS resource.
  const paymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "btc-lightning-signet",
    maxAmountRequired: "1000", // 1000 sats demo
    resource: "/examples/lightning",
    description: "Lightning-powered random number demo",
    mimeType: "application/json",
    // For Lightning we don't actually use `payTo` on the server side, but it is required by the schema.
    payTo: "lightning:external-wallet",
    maxTimeoutSeconds: 600,
    asset: "BTC",
    outputSchema: undefined,
    extra: undefined,
  };

  const x402ErrorResponse = (
    error: VerifyResponse["invalidReason"] | SettleResponse["errorReason"],
  ) =>
    NextResponse.json(
      {
        x402Version,
        error,
        accepts: [paymentRequirements],
      },
      { status: 402 },
    );

  // Read X-PAYMENT header from client (if present)
  const paymentHeader = request.headers.get("x-payment");

  // 1) No payment header -> tell the client how to pay.
  if (!paymentHeader) {
    return x402ErrorResponse("insufficient_funds");
  }

  let paymentPayload: PaymentPayload;

  try {
    paymentPayload = JSON.parse(paymentHeader) as PaymentPayload;
  } catch {
    // Malformed header
    return x402ErrorResponse("invalid_payment");
  }

  // 2) Basic shape / version checks (fast fail before talking to LND)
  if (paymentPayload.x402Version !== x402Version) {
    return x402ErrorResponse("invalid_x402_version");
  }

  if (paymentPayload.scheme !== "exact") {
    return x402ErrorResponse("invalid_scheme");
  }

  if (paymentPayload.network !== paymentRequirements.network) {
    return x402ErrorResponse("invalid_network");
  }

  // 3) Verify and settle via our LND helper
  try {
    const verifyResult = await verifyLightningWithLnd(paymentPayload, paymentRequirements);

    if (!verifyResult.isValid) {
      return x402ErrorResponse(verifyResult.invalidReason ?? "invalid_payment");
    }

    const settleResult = await settleLightningWithLnd(paymentPayload, paymentRequirements);

    if (!settleResult.success) {
      return x402ErrorResponse(settleResult.errorReason ?? "invalid_payment");
    }

    // 4) Success: return your actual API payload
    const body = {
      message: "Paid Lightning content ✨",
      network: settleResult.network,
      transaction: settleResult.transaction,
      amountSats: paymentRequirements.maxAmountRequired,
      // put any useful API data here:
      randomNumber: Math.floor(Math.random() * 1000),
    };

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error("Unexpected Lightning settle error", error);
    return x402ErrorResponse("unexpected_settle_error");
  }
}
