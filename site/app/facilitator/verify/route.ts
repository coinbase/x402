import { paymentDetailsSchema, PaymentDetails, SignerWallet } from "x402/types";
import { createClient, http, publicActions } from "viem";
import { baseSepolia } from "viem/chains";
import { verify } from "x402/server";

type VerifyRequest = {
  payload: string;
  details: PaymentDetails;
};

const client = createClient({
  chain: baseSepolia,
  transport: http(),
}).extend(publicActions);

export async function POST(req: Request) {
  const body: VerifyRequest = await req.json();

  const paymentDetails = paymentDetailsSchema.parse(body.details);

  const valid = await verify(client, body.payload, paymentDetails);

  return Response.json(valid);
}

export async function GET(req: Request) {
  return Response.json({
    endpoint: "/verify",
    description: "POST to verify x402 payments",
    body: {
      payload: "string",
      details: "PaymentDetails",
    },
  });
}
