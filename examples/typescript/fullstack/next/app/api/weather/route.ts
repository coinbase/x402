import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { server, paywall, evmAddress } from "../../../proxy";

const handler = async (_: NextRequest) => {
  return NextResponse.json(
    {
      report: {
        weather: "sunny",
        temperature: 72,
      },
    },
    { status: 200 },
  );
};

export const GET = withX402(
  handler,
  {
    accepts: {
      scheme: "exact",
      price: "$0.001",
      network: "eip155:8453",
      payTo: evmAddress,
    },
    description: "Access to weather API",
    mimeType: "application/json",
    extensions: {
      ...declareDiscoveryExtension({
        output: {
          example: {
            report: {
              weather: "sunny",
              temperature: 72,
            },
          },
        },
      }),
    },
  },
  server,
  undefined,
  paywall,
);
