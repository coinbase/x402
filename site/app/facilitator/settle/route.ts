import { paymentDetailsSchema, PaymentDetails } from "x402/types";
import { settle } from "x402/facilitator";
import { evm } from "x402/shared";
import { Hex } from "viem";

type SettleRequest = {
  payload: string;
  details: PaymentDetails;
};

const wallet = evm.wallet.createSignerSepolia(process.env.PRIVATE_KEY as Hex);

export async function POST(req: Request) {
  const body: SettleRequest = await req.json();

  const paymentDetails = paymentDetailsSchema.parse(body.details);

  const response = await settle(wallet, body.payload, paymentDetails);

  return Response.json(response);
}

export async function GET() {
  return Response.json({
    endpoint: "/settle",
    description: "POST to settle x402 payments",
    body: {
      payload: "string",
      details: "PaymentDetails",
    },
  });
}
