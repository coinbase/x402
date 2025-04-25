import { Hex } from "viem";
import { settle } from "x402/facilitator";
import {
  PaymentPayload,
  PaymentPayloadSchema,
  PaymentRequirements,
  PaymentRequirementsSchema,
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
  const wallet = evm.createSignerSepolia(process.env.PRIVATE_KEY as Hex);

  const body: SettleRequest = await req.json();

  const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
  const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);

  const response = await settle(wallet, paymentPayload, paymentRequirements);

  return Response.json(response);
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
