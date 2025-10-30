import {
  PaymentPayload,
  PaymentPayloadSchema,
  PaymentRequirements,
  PaymentRequirementsSchema,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  VerifyResponse,
  createConnectedClient,
  createSigner,
} from "x402/types";
import { verify } from "x402/facilitator";

type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

/**
 * Handles POST requests to verify x402 payments
 *
 * @param req - The incoming request containing payment verification details
 * @returns A JSON response indicating whether the payment is valid
 */
export async function POST(req: Request) {
  const body: VerifyRequest = await req.json();

  const network = body.paymentRequirements.network;
  const client = SupportedEVMNetworks.includes(network)
    ? createConnectedClient(body.paymentRequirements.network)
    : SupportedSVMNetworks.includes(network)
      ? await createSigner(network, process.env.SOLANA_PRIVATE_KEY)
      : undefined;

  if (!client) {
    return Response.json(
      {
        isValid: false,
        invalidReason: "invalid_network",
      } as VerifyResponse,
      { status: 400 },
    );
  }

  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
  } catch (error) {
    console.error("Invalid payment payload:", error);
    // Extract payer from either authorization or permit payload
    const payer =
      body.paymentPayload?.payload && "authorization" in body.paymentPayload.payload
        ? body.paymentPayload.payload.authorization.from
        : body.paymentPayload?.payload && "permit" in body.paymentPayload.payload
          ? body.paymentPayload.payload.permit.owner
          : "";
    return Response.json(
      {
        isValid: false,
        invalidReason: "invalid_payload",
        payer,
      } as VerifyResponse,
      { status: 400 },
    );
  }

  let paymentRequirements: PaymentRequirements;
  try {
    paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
  } catch (error) {
    console.error("Invalid payment requirements:", error);
    // Extract payer from either authorization or permit payload
    const payer =
      "authorization" in paymentPayload.payload
        ? paymentPayload.payload.authorization.from
        : "permit" in paymentPayload.payload
          ? paymentPayload.payload.permit.owner
          : "";
    return Response.json(
      {
        isValid: false,
        invalidReason: "invalid_payment_requirements",
        payer,
      } as VerifyResponse,
      { status: 400 },
    );
  }

  try {
    const valid = await verify(client, paymentPayload, paymentRequirements);
    return Response.json(valid);
  } catch (error) {
    console.error("Error verifying payment:", error);
    // Extract payer from either authorization or permit payload
    const payer =
      "authorization" in paymentPayload.payload
        ? paymentPayload.payload.authorization.from
        : "permit" in paymentPayload.payload
          ? paymentPayload.payload.permit.owner
          : "";
    return Response.json(
      {
        isValid: false,
        invalidReason: "unexpected_verify_error",
        payer,
      } as VerifyResponse,
      { status: 500 },
    );
  }
}

/**
 * Provides API documentation for the verify endpoint
 *
 * @returns A JSON response describing the verify endpoint and its expected request body
 */
export async function GET() {
  return Response.json({
    endpoint: "/verify",
    description: "POST to verify x402 payments",
    body: {
      paymentPayload: "PaymentPayload",
      paymentRequirements: "PaymentRequirements",
    },
  });
}
