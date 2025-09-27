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

/**
 * Retrieves Algorand client options from environment variables.
 *
 * @returns {AlgodClientOptions | undefined} The Algorand client options if at least one of the required
 * environment variables (`ALGOD_SERVER`, `ALGOD_TOKEN`, `ALGOD_PORT`) is set; otherwise, returns `undefined`.
 *
 * @description
 * This function is used to configure the Algorand client connection parameters.
 * If none of the required environment variables are set, it returns `undefined`.
 */
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

/**
 * Resolves the price and asset information for Algorand or an Algorand Standard Asset (ASA).
 *
 * The function uses environment variables `ASSET` and `PRICE` to determine the asset ID and price.
 * - If `ASSET` is "0" or not set, it returns pricing for native ALGO (with 6 decimals).
 * - If `ASSET` is a valid ASA ID, it fetches asset info from the Algorand network and calculates the price using the asset's decimals.
 * - If any error occurs or the environment variables are invalid, it falls back to a default price for ALGO.
 *
 * @returns {Promise<Price>} A promise that resolves to a `Price` object containing the amount and asset details.
 */
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
    return fallback;
  }

  if (assetId === 0) {
    // Native ALGO pricing
    const priceValue = Number(priceEnv);
    if (!Number.isFinite(priceValue)) {
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
      return fallback;
    }
    return {
      amount: Math.round(priceValue * 10 ** decimals).toString(),
      asset: { id: `${assetId}`, decimals, name: assetInfo?.params?.name ?? `${assetId}` },
    };
  } catch (error) {
    console.error("Failed to fetch Algorand ASA info.", error);
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
