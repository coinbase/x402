import { NextResponse } from "next/server";

/**
 * Protected Stellar endpoint requiring payment (proxy middleware)
 */
export const runtime = "nodejs";

/**
 * Protected Stellar endpoint requiring payment (proxy middleware)
 */
export async function GET() {
  return NextResponse.json({
    message: "Protected Stellar endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
}
