import type { NextRequest } from "next/server";
import { POST as handleSessionToken } from "x402-next";

export const runtime = "nodejs";

/**
 * Route handler that delegates to the default x402 session-token endpoint.
 *
 * @param request - Incoming Next.js request.
 * @param context - Route params context (unused).
 * @param context.params - Route params promise (unused).
 * @returns Session token response.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) {
  void context;
  type SessionTokenHandler = (req: NextRequest) => ReturnType<typeof handleSessionToken>;
  const delegate = handleSessionToken as unknown as SessionTokenHandler;
  return delegate(request);
}
