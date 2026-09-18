import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { buildExactPermit2Accept, evmResourceServer } from "@/lib/testnetProtectedResources";

/**
 * Testnet demo handler for the EVM `exact` / permit2 (no extension) endpoint.
 *
 * @param _ - Incoming Next.js request (unused; content is static)
 * @returns JSON confirmation of successful payment
 */
const handler = async (_: NextRequest): Promise<NextResponse> => {
  return NextResponse.json({
    ok: true,
    caip2Family: "evm",
    scheme: "exact",
    assetTransferMethod: "permit2",
  });
};

export const GET = withX402(
  handler,
  {
    "GET /protected/evm/exact/permit2": {
      accepts: buildExactPermit2Accept(),
      description: "EVM exact testnet endpoint (permit2, no gas-sponsoring extension)",
      mimeType: "application/json",
    },
  },
  evmResourceServer,
);
