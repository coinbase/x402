import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy Solana RPC requests to avoid exposing API keys in the browser
 *
 * This endpoint proxies Solana RPC requests from the client to the configured
 * Solana RPC endpoint, keeping the API key secure on the server.
 *
 * Setup:
 * 1. Set RPC_URL_SOLANA_MAINNET and/or RPC_URL_SOLANA_DEVNET environment variables
 * 2. Add this to your Next.js app at your chosen path
 * 3. Client can specify network via query parameter: ?network=devnet
 *
 * @param request - The Next.js Request object
 * @returns Promise<NextResponse> - The response containing the RPC result or error
 */
export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const network = searchParams.get("network") === "devnet" ? "devnet" : "mainnet";

    const rpcUrl =
      network === "devnet"
        ? process.env.RPC_URL_SOLANA_DEVNET || "https://api.devnet.solana.com"
        : process.env.RPC_URL_SOLANA_MAINNET || "https://api.mainnet-beta.solana.com";

    const body = (await request.json()) as Record<string, unknown>;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body: Expected JSON-RPC request object" },
        { status: 400 },
      );
    }

    const { jsonrpc, method } = body;
    if (!jsonrpc || !method) {
      return NextResponse.json(
        { error: "Invalid JSON-RPC request: Missing jsonrpc or method field" },
        { status: 400 },
      );
    }

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("Solana RPC error:", response.status, response.statusText);
      return NextResponse.json(
        {
          error: "Solana RPC request failed",
          details: response.statusText,
        },
        { status: 502 },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error proxying Solana RPC:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
