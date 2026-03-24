import { NextResponse } from "next/server";

/**
 * Protected Permit2 ERC-20 endpoint requiring payment with ERC-20 approval gas sponsoring (proxy middleware)
 */
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    message: "Permit2 ERC-20 approval endpoint accessed successfully",
    timestamp: new Date().toISOString(),
    method: "permit2-erc20-approval",
  });
}
