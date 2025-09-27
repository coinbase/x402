import { SupportedPaymentKindsResponse } from "x402/types";

/**
 * Returns the supported payment kinds for the x402 protocol
 *
 * @returns A JSON response containing the list of supported payment kinds
 */
export async function GET() {
  const kinds: SupportedPaymentKindsResponse["kinds"] = [
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
  ];

  if (process.env.NETWORK === "algorand" || process.env.NETWORK === "algorand-testnet") {
    const algorandFeePayer = process.env.FEE_PAYER;
    kinds.push({
      x402Version: 1,
      scheme: "exact",
      network: process.env.NETWORK,
      extra: {
        feePayer: algorandFeePayer,
        decimals: 6,
      },
    });
  }

  const response: SupportedPaymentKindsResponse = {
    kinds,
  };

  return Response.json(response);
}
