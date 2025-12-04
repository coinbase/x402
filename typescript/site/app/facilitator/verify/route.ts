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
import { ALLOWED_NETWORKS } from "../config";
import { isLightningNetwork, verifyLightningWithLnd } from "../lightning-lnd";

type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

/**
 * Handles POST requests to verify x402 payments.
 *
 * For EVM/SVM networks:
 *  - Creates the appropriate client/signer and delegates to `x402/facilitator.verify`.
 *
 * For Lightning networks:
 *  - Delegates to the LND-flavored Lightning verifier (`verifyLightningWithLnd`),
 *    which in turn uses the generic Lightning scheme implementation plus LND
 *    invoice introspection.
 *
 * @param req - The incoming request containing payment verification details
 * @returns A JSON response indicating whether the payment is valid
 */
export async function POST(req: Request) {
  const body: VerifyRequest = await req.json();

  const network = body.paymentRequirements.network;

  // 1) Check that this facilitator is configured to support the requested network
  if (!ALLOWED_NETWORKS.includes(network)) {
    console.error("Attempted to use unsupported network:", {
      network,
      allowedNetworks: ALLOWED_NETWORKS,
    });
    return Response.json(
      {
        isValid: false,
        invalidReason: "invalid_network",
        error: `This facilitator only supports: ${ALLOWED_NETWORKS.join(
          ", ",
        )}. Network '${network}' is not supported.`,
      } as VerifyResponse,
      { status: 400 },
    );
  }

  // 2) Parse and validate the PaymentPayload
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
        isValid: false,
        invalidReason: "invalid_payload",
        error: errorMessage,
        payer:
          body.paymentPayload?.payload && "authorization" in body.paymentPayload.payload
            ? body.paymentPayload.payload.authorization.from
            : "",
      } as VerifyResponse,
      { status: 400 },
    );
  }

  // 3) Parse and validate the PaymentRequirements
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
        isValid: false,
        invalidReason: "invalid_payment_requirements",
        error: errorMessage,
        payer:
          "authorization" in paymentPayload.payload
            ? paymentPayload.payload.authorization.from
            : "",
      } as VerifyResponse,
      { status: 400 },
    );
  }

  // 4) Lightning path: use LND-flavored verifier (no EVM/SVM client needed)
  if (isLightningNetwork(network)) {
    try {
      const result = await verifyLightningWithLnd(paymentPayload, paymentRequirements);
      return Response.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error("Error verifying Lightning payment via LND:", {
        message: errorMessage,
        stack: errorStack,
        paymentPayload,
        paymentRequirements,
      });

      return Response.json(
        {
          isValid: false,
          invalidReason: "unexpected_verify_error",
          error: errorMessage,
          payer:
            "authorization" in paymentPayload.payload
              ? paymentPayload.payload.authorization.from
              : "",
        } as VerifyResponse,
        { status: 500 },
      );
    }
  }

  // 5) EVM / SVM path: use existing x402 facilitator logic
  const client = SupportedEVMNetworks.includes(network)
    ? createConnectedClient(paymentRequirements.network)
    : SupportedSVMNetworks.includes(network)
      ? await createSigner(network, process.env.SOLANA_PRIVATE_KEY)
      : undefined;

  if (!client) {
    console.error("No client available for non-Lightning network:", {
      network,
      supportedEvmNetworks: SupportedEVMNetworks,
      supportedSvmNetworks: SupportedSVMNetworks,
    });

    return Response.json(
      {
        isValid: false,
        invalidReason: "invalid_network",
      } as VerifyResponse,
      { status: 400 },
    );
  }

  try {
    const valid = await verify(client, paymentPayload, paymentRequirements);
    return Response.json(valid);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("Error verifying payment:", {
      message: errorMessage,
      stack: errorStack,
      paymentPayload,
      paymentRequirements,
    });

    return Response.json(
      {
        isValid: false,
        invalidReason: "unexpected_verify_error",
        error: errorMessage,
        payer:
          "authorization" in paymentPayload.payload
            ? paymentPayload.payload.authorization.from
            : "",
      } as VerifyResponse,
      { status: 500 },
    );
  }
}

/**
 * Provides API documentation for the verify endpoint.
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
