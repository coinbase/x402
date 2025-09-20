import { generateJwt } from "@coinbase/cdp-sdk/auth";
import type { Context } from "koa";

/**
 * Generate a session token for Coinbase Onramp and Offramp using Secure Init
 *
 * This endpoint creates a server-side session token that can be used
 * instead of passing appId and addresses directly in onramp/offramp URLs.
 *
 * Setup:
 * 1. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables
 * 2. Add this to your Koa router: router.post("/api/x402/session-token", POST);
 *
 * @param ctx - The Koa Context object containing the request and response
 * @returns Promise<void> - The response containing the session token or error
 */
export async function POST(ctx: Context): Promise<void> {
  try {
    // Get CDP API credentials from environment variables
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      console.error("Missing CDP API credentials");
      ctx.status = 500;
      ctx.body = {
        error: "Server configuration error: Missing CDP API credentials",
      };
      return;
    }

    // Parse request body
    const body = ctx.request.body as {
      addresses?: Array<{ address: string; blockchains?: string[] }>;
      assets?: string[];
    };
    const { addresses, assets } = body;

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      ctx.status = 400;
      ctx.body = {
        error: "addresses is required and must be a non-empty array",
      };
      return;
    }

    // Generate JWT for authentication
    const jwt = await generateJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod: "POST",
      requestHost: "api.developer.coinbase.com",
      requestPath: "/onramp/v1/token",
    });

    // Create session token request payload
    const tokenRequestPayload = {
      addresses: addresses.map((addr: { address: string; blockchains?: string[] }) => ({
        address: addr.address,
        blockchains: addr.blockchains || ["base"],
      })),
      ...(assets && { assets }),
    };

    // Call Coinbase API to generate session token
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
      ctx.status = response.status;
      ctx.body = {
        error: "Failed to generate session token",
      };
      return;
    }

    const data = await response.json();

    ctx.body = data;
  } catch (error) {
    console.error("Error generating session token:", error);
    ctx.status = 500;
    ctx.body = { error: "Internal server error" };
  }
}