import {
  PaymentPayload,
  PaymentPayloadSchema,
  PaymentRequirements,
  PaymentRequirementsSchema,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  createConnectedClient,
  createSigner,
  createVerifyResponse,
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
      createVerifyResponse({
        invalidReason: "invalid_network",
        context: {
          network,
        },
      }),
      {
        status: 400,
      },
    );
  }

  const paymentPayload = PaymentPayloadSchema.safeParse(body.paymentPayload);
  if (!paymentPayload.success) {
    console.error("Invalid payment payload:", paymentPayload.error);
    return Response.json(
      createVerifyResponse({
        invalidReason: "invalid_payload",
        context: {
          expected: paymentPayload.error.toString(),
          value: JSON.stringify(body.paymentPayload),
        },
        payer:
          body.paymentPayload?.payload && "authorization" in body.paymentPayload.payload
            ? body.paymentPayload.payload.authorization.from
            : "",
      }),
      { status: 400 },
    );
  }

  const paymentRequirements = PaymentRequirementsSchema.safeParse(body.paymentRequirements);
  if (!paymentRequirements.success) {
    console.error("Invalid payment requirements:", paymentRequirements.error);
    return Response.json(
      createVerifyResponse({
        invalidReason: "invalid_payment_requirements",
        context: {
          expected: paymentRequirements.error.toString(),
          value: JSON.stringify(body.paymentRequirements),
        },
        payer:
          "authorization" in paymentPayload.data.payload
            ? paymentPayload.data.payload.authorization.from
            : "",
      }),
      { status: 400 },
    );
  }

  try {
    const valid = await verify(client, paymentPayload, paymentRequirements);
    return Response.json(valid);
  } catch (error) {
    console.error("Error verifying payment:", error);
    return Response.json(
      createVerifyResponse({
        invalidReason: "unexpected_verify_error",
        payer:
          "authorization" in paymentPayload.data.payload
            ? paymentPayload.data.payload.authorization.from
            : "",
      }),
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
