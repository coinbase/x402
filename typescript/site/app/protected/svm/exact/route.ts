import { withX402 } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";
import { buildSvmExactAccept, svmResourceServer } from "@/lib/testnetProtectedResources";

/**
 * Testnet demo handler for the SVM `exact` endpoint.
 *
 * @param _ - Incoming Next.js request (unused; content is static)
 * @returns JSON confirmation of successful payment
 */
const handler = async (_: NextRequest): Promise<NextResponse> => {
  return NextResponse.json({
    ok: true,
    caip2Family: "svm",
    scheme: "exact",
  });
};

export const GET = withX402(
  handler,
  {
    "GET /protected/svm/exact": {
      accepts: buildSvmExactAccept(),
      description: "SVM exact testnet endpoint",
      mimeType: "application/json",
    },
  },
  svmResourceServer,
);
