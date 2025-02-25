import { paymentDetailsSchema, PaymentDetails, SignerWallet } from "x402/types";
import { createWalletClient, Hex, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { settle } from "x402/server";

type SettleRequest = {
  payload: string;
  details: PaymentDetails;
};

const wallet: SignerWallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(
    process.env.FACILITATOR_WALLET_PRIVATE_KEY as Hex
  ),
}).extend(publicActions);

export async function POST(req: Request) {
  const body: SettleRequest = await req.json();

  const paymentDetails = paymentDetailsSchema.parse(body.details);

  const response = await settle(wallet, body.payload, paymentDetails);

  return Response.json(response);
}

export async function GET(req: Request) {
  return Response.json({
    endpoint: "/settle",
    description: "POST to settle x402 payments",
    body: {
      payload: "string",
      details: "PaymentDetails",
    },
  });
}
