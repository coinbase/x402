import { Hex } from "viem";
import { settle } from "x402/facilitator";
import {
  PaymentPayload,
  PaymentPayloadSchema,
  PaymentRequirements,
  PaymentRequirementsSchema,
  SettleResponse,
  evm,
} from "x402/types";

type SettleRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

/**
 * Handles POST requests to settle x402 payments
 *
 * @param req - The incoming request containing payment settlement details
 * @returns A JSON response with the settlement result
 */
export async function POST(req: Request) {
  const network = process.env.NETWORK ?? "base-sepolia";
  const wallet = evm.createSigner(network, process.env.PRIVATE_KEY as Hex);

  const body: SettleRequest = await req.json();

  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
  } catch (error) {
    console.error("Invalid payment payload:", error);
    return Response.json(
      {
        success: false,
        errorReason: "invalid_payload",
        transaction: "",
        network: body.paymentPayload?.network || "",
      } as SettleResponse,
      { status: 400 },
    );
  }

  let paymentRequirements: PaymentRequirements;
  try {
    paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
  } catch (error) {
    console.error("Invalid payment requirements:", error);
    return Response.json(
      {
        success: false,
        errorReason: "invalid_payment_requirements",
        transaction: "",
        network: paymentPayload.network,
      } as SettleResponse,
      { status: 400 },
    );
  }

  try {
    const response = await settle(wallet, paymentPayload, paymentRequirements);
    return Response.json(response);
  } catch (error) {
    console.error("Error settling payment:", error);
    return Response.json(
      {
        success: false,
        errorReason: "unexpected_settle_error",
        transaction: "",
        network: paymentPayload.network,
      } as SettleResponse,
      { status: 500 },
    );
  }
}

/**
 * Provides API documentation for the settle endpoint
 *
 * @returns A JSON response describing the settle endpoint and its expected request body
 */
export async function GET() {
  return Response.json({
    endpoint: "/settle",
    description: "POST to settle x402 payments",
    body: {
      paymentPayload: "PaymentPayload",
      paymentRequirements: "PaymentRequirements",
    },
  });
}
