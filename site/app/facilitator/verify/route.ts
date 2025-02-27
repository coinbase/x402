import { paymentDetailsSchema, PaymentDetails } from "x402/types";
import { verify } from "x402/facilitator";
import { evm } from "x402/shared";

type VerifyRequest = {
  payload: string;
  details: PaymentDetails;
};

const client = evm.wallet.createClientSepolia();

export async function POST(req: Request) {
  const body: VerifyRequest = await req.json();

  const paymentDetails = paymentDetailsSchema.parse(body.details);

  const valid = await verify(client, body.payload, paymentDetails);

  return Response.json(valid);
}

export async function GET() {
  return Response.json({
    endpoint: "/verify",
    description: "POST to verify x402 payments",
    body: {
      payload: "string",
      details: "PaymentDetails",
    },
  });
}
