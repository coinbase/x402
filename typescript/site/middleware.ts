import { paymentMiddleware, Resource, Network } from "x402-next";
import { NextRequest, NextResponse } from "next/server";

const address = process.env.RESOURCE_WALLET_ADDRESS as string;
const network = process.env.NETWORK as Network;
const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource;
const cdpClientKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;

// List of blocked countries and regions
const BLOCKED_COUNTRIES = [
  "KP", // North Korea
  "IR", // Iran
  "CU", // Cuba
  "SY", // Syria
];

// List of blocked regions within specific countries
const BLOCKED_REGIONS = {
  UA: ["43", "14", "09"],
};

const x402PaymentMiddleware = paymentMiddleware(
  address,
  {
    "/protected": {
      price: "$0.01",
      config: {
        description: "Access to protected content",
      },
      network,
    },
  },
  {
    url: facilitatorUrl,
  },
  {
    cdpClientKey,
    appLogo: "/logos/x402-examples.png",
    appName: "x402 Demo",
    sessionTokenEndpoint: "/api/x402/session-token",
  },
);

const geolocationMiddleware = async (req: NextRequest) => {
  // Get the country and region from Vercel's headers
  const country = req.headers.get("x-vercel-ip-country") || "US";
  const region = req.headers.get("x-vercel-ip-country-region");

  const isCountryBlocked = BLOCKED_COUNTRIES.includes(country);
  const isRegionBlocked =
    region && BLOCKED_REGIONS[country as keyof typeof BLOCKED_REGIONS]?.includes(region);

  if (isCountryBlocked || isRegionBlocked) {
    return new NextResponse("Access denied: This service is not available in your region", {
      status: 451,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return null;
};

export const middleware = async (req: NextRequest) => {
  const geolocationResponse = await geolocationMiddleware(req);
  if (geolocationResponse) {
    return geolocationResponse;
  }

  return x402PaymentMiddleware(req);
};

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/", // Include the root path explicitly
  ],
};
