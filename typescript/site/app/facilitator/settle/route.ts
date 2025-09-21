import { settle } from "x402/facilitator";
import {
  PaymentPayload,
  PaymentPayloadSchema,
  PaymentRequirements,
  PaymentRequirementsSchema,
  SettleResponse,
  SupportedAVMNetworks,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  createSigner,
} from "x402/types";
import { AlgodClientOptions, createSigner as createAlgorandSigner } from "x402/shared/avm";

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
  const privateKey = SupportedEVMNetworks.includes(network)
    ? process.env.PRIVATE_KEY
    : SupportedSVMNetworks.includes(network)
      ? process.env.SOLANA_PRIVATE_KEY
      : SupportedAVMNetworks.includes(network)
        ? process.env.PRIVATE_KEY
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

  const algodOptions = (() => {
    const server = process.env.ALGOD_SERVER;
    const token = process.env.ALGOD_TOKEN;
    const port = process.env.ALGOD_PORT;
    if (!server && !token && !port) {
      return undefined;
    }

    const options: AlgodClientOptions = {};
    if (server) {
      options.algodServer = server;
    }
    if (token) {
      options.algodToken = token;
    }
    if (port) {
      options.algodPort = port;
    }
    return options;
  })();

  const wallet = SupportedAVMNetworks.includes(network)
    ? createAlgorandSigner(network, privateKey, algodOptions)
    : await createSigner(network, privateKey);

  type SimpleClient = Record<string, unknown> & { address?: string };
  const settleClient: SimpleClient = SupportedAVMNetworks.includes(network)
    ? ({ ...wallet } as unknown as SimpleClient)
    : (wallet as unknown as SimpleClient);

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
    const response = await settle(settleClient, paymentPayload, paymentRequirements);
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
