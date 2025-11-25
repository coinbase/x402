import { settle } from "x402/facilitator";
import {
  PaymentPayload,
  PaymentPayloadSchema,
  PaymentRequirements,
  PaymentRequirementsSchema,
  SettleResponse,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  createSigner,
} from "x402/types";
import { ALLOWED_NETWORKS } from "../config";

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
  const body: SettleRequest = await req.json();

  const network = body.paymentRequirements.network;

  if (!ALLOWED_NETWORKS.includes(network)) {
    console.error("Attempted to use unsupported network:", {
      network,
      allowedNetworks: ALLOWED_NETWORKS,
    });
    return Response.json(
      {
        success: false,
        errorReason: "invalid_network",
        error: `This facilitator only supports: ${ALLOWED_NETWORKS.join(", ")}. Network '${network}' is not supported.`,
        transaction: "",
        network: network,
      } as SettleResponse,
      { status: 400 },
    );
  }

  const privateKey = SupportedEVMNetworks.includes(network)
    ? process.env.PRIVATE_KEY
    : SupportedSVMNetworks.includes(network)
      ? process.env.SOLANA_PRIVATE_KEY
      : undefined;

  if (!privateKey) {
    return Response.json(
      {
        success: false,
        errorReason: "invalid_network",
      } as SettleResponse,
      { status: 400 },
    );
  }

  const wallet = await createSigner(network, privateKey);

  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Invalid payment payload:", {
      message: errorMessage,
      payload: body.paymentPayload,
    });
    return Response.json(
      {
        success: false,
        errorReason: "invalid_payload",
        error: errorMessage,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Invalid payment requirements:", {
      message: errorMessage,
      requirements: body.paymentRequirements,
    });
    return Response.json(
      {
        success: false,
        errorReason: "invalid_payment_requirements",
        error: errorMessage,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("Error settling payment:", {
      message: errorMessage,
      stack: errorStack,
      paymentPayload,
      paymentRequirements,
    });

    return Response.json(
      {
        success: false,
        errorReason: "unexpected_settle_error",
        error: errorMessage,
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
