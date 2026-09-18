import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import {
  buildExactErc3009Accept,
  buildExactPermit2Accept,
  EIP2612_EXTENSION,
  evmResourceServer,
} from "@/lib/testnetProtectedResources";

/**
 * Testnet demo handler for the EVM `exact` default (multi-accept) endpoint.
 *
 * @param _ - Incoming Next.js request (unused; content is static)
 * @returns JSON confirmation of successful payment
 */
const handler = async (_: NextRequest): Promise<NextResponse> => {
  return NextResponse.json({
    ok: true,
    caip2Family: "evm",
    scheme: "exact",
  });
};

export const GET = withX402(
  handler,
  {
    "GET /protected/evm/exact": {
      accepts: [buildExactErc3009Accept(), buildExactPermit2Accept()],
      description: "EVM exact testnet endpoint (erc3009 or permit2)",
      mimeType: "application/json",
      extensions: {
        ...EIP2612_EXTENSION,
      },
    },
  },
  evmResourceServer,
);
