import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST handler for generating a Coinbase Onramp session token (Node runtime).
 *
 * @param {NextRequest} request - The incoming request with addresses and optional assets
 * @returns {Promise<NextResponse>} JSON response with the session token or an error
 */
export async function POST(request: NextRequest) {
  try {
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      return NextResponse.json(
        { error: "Server configuration error: Missing CDP API credentials" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      addresses?: Array<{ address: string; blockchains?: string[] }>;
      assets?: string[];
    };
    const { addresses, assets } = body;

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { error: "addresses is required and must be a non-empty array" },
        { status: 400 },
      );
    }

    const jwt = await generateJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod: "POST",
      requestHost: "api.developer.coinbase.com",
      requestPath: "/onramp/v1/token",
    });

    const tokenRequestPayload = {
      addresses: addresses.map(addr => ({
        address: addr.address,
        blockchains: addr.blockchains || ["base"],
      })),
      ...(assets && { assets }),
    };

    const response = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokenRequestPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to generate session token:", response.status, errorText);
      return NextResponse.json(
        { error: "Failed to generate session token" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error generating session token:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
