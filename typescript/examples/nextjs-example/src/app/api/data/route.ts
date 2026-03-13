import { NextResponse } from "next/server";
import { withX402 } from "@x402-observed/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const EVM_NETWORK = (process.env.EVM_NETWORK || "eip155:84532") as `${string}:${string}`;
const EVM_PAYEE_ADDRESS = process.env.EVM_PAYEE_ADDRESS as `0x${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL;

if (!EVM_PAYEE_ADDRESS) {
  throw new Error("EVM_PAYEE_ADDRESS environment variable is required");
}

if (!facilitatorUrl) {
  throw new Error("FACILITATOR_URL environment variable is required");
}

// Create HTTP facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Create x402 resource server
const server = new x402ResourceServer(facilitatorClient);

// Register EVM scheme for Base Sepolia
server.register("eip155:*", new ExactEvmScheme());

const handler = async () => {
  return NextResponse.json({
    success: true,
    message: "🎉 Payment Successful!",
    content: "You now have access to data content",
    timestamp: new Date().toISOString(),
    data: {
      feature: "data",
      value: "This is data content that required payment",
      benefits: [
        "Premium features unlocked",
        "Priority support access",
        "Exclusive community access",
      ],
    },
  });
};

export const GET = withX402(
  handler,
  {
    accepts: {
      payTo: EVM_PAYEE_ADDRESS,
      scheme: "exact",
      price: "$0.005",
      network: EVM_NETWORK,
    },
    description: "Data API endpoint - $0.005 USDC",
  },
  server,
);
