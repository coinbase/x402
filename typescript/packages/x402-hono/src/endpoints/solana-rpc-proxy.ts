import type { Context } from "hono";

/**
 * Proxy Solana RPC requests to avoid exposing API keys in the browser
 *
 * This endpoint proxies Solana RPC requests from the client to the configured
 * Solana RPC endpoint, keeping the API key secure on the server.
 *
 * Setup:
 * 1. Set RPC_URL_SOLANA_MAINNET and/or RPC_URL_SOLANA_DEVNET environment variables
 * 2. Add this to your Hono app at your chosen path
 * 3. Client can specify network via query parameter: ?network=devnet
 *
 * @param c - The Hono Context object
 * @returns Promise<Response> - The response containing the RPC result or error
 */
export async function POST(c: Context) {
  try {
    const network = c.req.query("network") === "devnet" ? "devnet" : "mainnet";

    const rpcUrl =
      network === "devnet"
        ? process.env.RPC_URL_SOLANA_DEVNET || "https://api.devnet.solana.com"
        : process.env.RPC_URL_SOLANA_MAINNET || "https://api.mainnet-beta.solana.com";

    const body = await c.req.json();

    if (!body || typeof body !== "object") {
      return c.json(
        {
          error: "Invalid request body: Expected JSON-RPC request object",
        },
        400,
      );
    }

    const { jsonrpc, method } = body;
    if (!jsonrpc || !method) {
      return c.json(
        {
          error: "Invalid JSON-RPC request: Missing jsonrpc or method field",
        },
        400,
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
      return c.json(
        {
          error: "Solana RPC request failed",
          details: response.statusText,
        },
        502,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    return c.json(data);
  } catch (error) {
    console.error("Error proxying Solana RPC:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
