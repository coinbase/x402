import { SupportedPaymentKindsResponse } from "x402/types";

/**
 * Returns the supported payment kinds for the x402 protocol
 *
 * @returns A JSON response containing the list of supported payment kinds
 */
export async function GET() {
  const response: SupportedPaymentKindsResponse = {
    kinds: [
      {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
      },
      {
        x402Version: 1,
        scheme: "exact",
        network: "solana-devnet",
        extra: {
          feePayer: process.env.SOLANA_ADDRESS,
        },
      },
    ],
  };

  return Response.json(response);
}
