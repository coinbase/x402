import { NextRequest, NextResponse } from "next/server";
import { withX402, Network, Resource } from "x402-next";
import { Address } from "viem";

const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource;
const payTo = process.env.RESOURCE_WALLET_ADDRESS as Address;
const network = process.env.NETWORK as Network;

/**
 * Weather API endpoint handler
 *
 * @param {NextRequest} _ - The incoming request object
 * @returns JSON response with weather data
 */
const handler = async (_: NextRequest) => {
  const response = NextResponse.json(
    {
      report: {
        weather: "sunny",
        temperature: 70,
      },
    },
    { status: 200 },
  );
  return response;
};

/**
 * Protected weather API endpoint
 * Payment is only settled after successful response (status < 400)
 */
export const GET = withX402(
  handler,
  payTo,
  {
    price: "$0.01",
    network,
    config: {
      description: "Access to weather API",
    },
  },
  {
    url: facilitatorUrl,
  },
  {
    appName: "Next x402 Demo",
    appLogo: "/x402-icon-blue.png",
  },
);
