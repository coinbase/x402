type PriceRequest = {
  symbol: string;
};

/**
 * Handles price requests for different cryptocurrency symbols.
 *
 * Expects a JSON body like:
 *
 * ```json
 * { "symbol": "btc" }
 * ```
 *
 * Known symbols:
 * - `btc`
 * - `eth`
 * - `sol`
 *
 * Any unknown or invalid symbol returns `{ "price": -1 }`.
 *
 * @param {Request} req - The incoming HTTP request containing a JSON body with a `symbol` field.
 * @returns {Promise<Response>} A JSON response with the price of the requested cryptocurrency, or -1 if not found.
 */
export async function POST(req: Request): Promise<Response> {
  let body: PriceRequest | null = null;

  try {
    body = (await req.json()) as PriceRequest;
  } catch {
    // Keep the behavior simple and non-breaking: invalid JSON just returns -1.
    return Response.json({ price: -1 });
  }

  const symbol = typeof body?.symbol === "string" ? body.symbol.toLowerCase() : "";

  if (symbol === "btc") {
    return Response.json({ price: 90000 });
  }

  if (symbol === "eth") {
    return Response.json({ price: 3000 });
  }

  if (symbol === "sol") {
    return Response.json({ price: 125 });
  }

  // Fallback for unknown symbols to preserve original behavior.
  return Response.json({ price: -1 });
}
