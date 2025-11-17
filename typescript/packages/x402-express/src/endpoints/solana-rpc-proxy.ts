import type { Request, Response } from "express";

/**
 * Proxy Solana RPC requests to avoid exposing API keys in the browser
 *
 * This endpoint proxies Solana RPC requests from the client to the configured
 * Solana RPC endpoint, keeping the API key secure on the server.
 *
 * Setup:
 * 1. Set RPC_URL_SOLANA_MAINNET and/or RPC_URL_SOLANA_DEVNET environment variables
 * 2. Add this to your Express app at your chosen path
 * 3. Client can specify network via query parameter: ?network=devnet
 *
 * @param req - The Express Request containing the RPC request and optional ?network query
 * @param res - The Express Response object
 * @returns Promise<void> - The response containing the RPC result or error
 */
export async function POST(req: Request, res: Response) {
  try {
    const network = req.query.network === "devnet" ? "devnet" : "mainnet";

    const rpcUrl =
      network === "devnet"
        ? process.env.RPC_URL_SOLANA_DEVNET || "https://api.devnet.solana.com"
        : process.env.RPC_URL_SOLANA_MAINNET || "https://api.mainnet-beta.solana.com";

    console.log("rpcUrl", rpcUrl);

    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "Invalid request body: Expected JSON-RPC request object",
      });
    }

    const { jsonrpc, method } = req.body;
    if (!jsonrpc || !method) {
      return res.status(400).json({
        error: "Invalid JSON-RPC request: Missing jsonrpc or method field",
      });
    }

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      console.error("Solana RPC error:", response.status, response.statusText);
      return res.status(response.status).json({
        error: "Solana RPC request failed",
        details: response.statusText,
      });
    }

    const data = await response.json();

    return res.json(data);
  } catch (error) {
    console.error("Error proxying Solana RPC:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
