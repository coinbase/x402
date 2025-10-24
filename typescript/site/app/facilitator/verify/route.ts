import {
  PaymentPayload,
  PaymentPayloadSchema,
  PaymentRequirements,
  PaymentRequirementsSchema,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  VerifyResponse,
  createSigner,
} from "x402/types";
import { verify } from "x402/facilitator";

type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

/**
 * Helper function to extract the payer address from different authorization types
 *
 * @param payload - The payment payload containing authorization information
 * @returns The payer's address as a string, or empty string if not found
 */
function getPayerAddress(payload: PaymentPayload["payload"]): string {
  if ("authorization" in payload) {
    const auth = payload.authorization;
    // EIP-3009 uses 'from', Permit/Permit2 use 'owner'
    if ("from" in auth) {
      return auth.from;
    } else if ("owner" in auth) {
      return auth.owner;
    }
  }
  return "";
}

/**
 * Handles POST requests to verify x402 payments
 *
 * @param req - The incoming request containing payment verification details
 * @returns A JSON response indicating whether the payment is valid
 */
export async function POST(req: Request) {
  const body: VerifyRequest = await req.json();

  const network = body.paymentRequirements.network;
  // For EVM with Permit/Permit2, we need a Signer to access facilitator's address
  // For SVM, we always need a Signer because it signs & simulates the txn
  const client = SupportedEVMNetworks.includes(network)
    ? await createSigner(body.paymentRequirements.network, process.env.EVM_PRIVATE_KEY)
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
    return Response.json(
      {
        isValid: false,
        invalidReason: "invalid_payload",
        payer: body.paymentPayload?.payload ? getPayerAddress(body.paymentPayload.payload) : "",
      } as VerifyResponse,
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
        isValid: false,
        invalidReason: "invalid_payment_requirements",
        payer: getPayerAddress(paymentPayload.payload),
      } as VerifyResponse,
      { status: 400 },
    );
  }

  try {
    const valid = await verify(client, paymentPayload, paymentRequirements);
    return Response.json(valid);
  } catch (error) {
    console.error("Error verifying payment:", error);
    return Response.json(
      {
        isValid: false,
        invalidReason: "unexpected_verify_error",
        payer: getPayerAddress(paymentPayload.payload),
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
