import { paymentMiddleware, Resource, Network, Price } from "x402-next";
import { NextRequest, NextResponse } from "next/server";
import { AlgodClientOptions, createAlgorandClient } from "x402/shared/avm";

const address = process.env.RESOURCE_WALLET_ADDRESS as string;
const network = process.env.NETWORK as Network;
const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource;
const cdpClientKey = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;

// Blocked countries and regions
const BLOCKED_COUNTRIES = ["KP", "IR", "CU", "SY"];
const BLOCKED_REGIONS = { UA: ["43", "14", "09"] };

function getAlgodOptions(): AlgodClientOptions | undefined {
  const server = process.env.ALGOD_SERVER || undefined;
  const token = process.env.ALGOD_TOKEN || undefined;
  const port = process.env.ALGOD_PORT || undefined;

  if (!server && !token && !port) return undefined;

  return {
    algodServer: server,
    algodToken: token,
    algodPort: port,
  };
}

// 🔑 This version assumes you ONLY call it when network is algorand/algorand-testnet
async function resolveAlgorandPrice(): Promise<Price> {
  const assetEnv = process.env.ASSET ?? "0";
  const priceEnv = process.env.PRICE ?? "0.01";

  // Default fallback (Algo, 6 decimals)
  const fallback: Price = {
    amount: (0.01 * 1e6).toString(),
    asset: { id: "0", decimals: 6 },
  };

  const assetId = Number(assetEnv);
  if (!Number.isFinite(assetId) || assetId < 0) {
    console.warn("[x402 site] Invalid ASSET env value. Falling back to default price.");
    return fallback;
  }

  if (assetId === 0) {
    // Native ALGO pricing
    const priceValue = Number(priceEnv);
    if (!Number.isFinite(priceValue)) {
      console.warn("[x402 site] Invalid PRICE env value. Falling back to default.");
      return fallback;
    }
    const decimals = 6;
    return {
      amount: Math.round(priceValue * 10 ** decimals).toString(),
      asset: { id: "0", decimals },
    };
  }

  try {
    const options = getAlgodOptions();
    const algorandClient = createAlgorandClient(network, options);
    const assetInfo = await algorandClient.client.getAssetByID(assetId).do();

    const decimals = Number(assetInfo?.params?.decimals ?? 0);
    const priceValue = Number(priceEnv);

    if (!Number.isFinite(priceValue)) {
      console.warn("[x402 site] Invalid PRICE env value. Falling back to default.");
      return fallback;
    }
    return {
      amount: Math.round(priceValue * 10 ** decimals).toString(),
      asset: { id: `${assetId}`, decimals, name: assetInfo?.params?.name ?? `${assetId}` },
    };
  } catch (error) {
    console.error("[x402 site] Failed to fetch Algorand ASA info.", error);
    return fallback;
  }
}

const geolocationMiddleware = async (req: NextRequest) => {
  const country = req.headers.get("x-vercel-ip-country") || "US";
  const region = req.headers.get("x-vercel-ip-country-region");

  const isCountryBlocked = BLOCKED_COUNTRIES.includes(country);
  const isRegionBlocked =
    region && BLOCKED_REGIONS[country as keyof typeof BLOCKED_REGIONS]?.includes(region);

  if (isCountryBlocked || isRegionBlocked) {
    return new NextResponse("Access denied: This service is not available in your region", {
      status: 451,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return null;
};

export const middleware = async (req: NextRequest) => {
  const geolocationResponse = await geolocationMiddleware(req);
  if (geolocationResponse) return geolocationResponse;

  let price: Price;
  if (network === "algorand" || network === "algorand-testnet") {
    price = await resolveAlgorandPrice();
  } else {
    // Default non-Algorand price as simple USD-equivalent ALGO
    price = "$0.01";
  }

  const x402PaymentMiddleware = paymentMiddleware(
    address,
    {
      "/protected": {
        price,
        config: { description: "Access to protected content" },
        network,
      },
    },
    { url: facilitatorUrl },
    {
      cdpClientKey,
      appLogo: "/logos/x402-examples.png",
      appName: "x402 Demo",
      sessionTokenEndpoint: "/api/x402/session-token",
    },
  );

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
