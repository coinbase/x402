import { NextResponse } from "next/server";

/**
 * Protected Aptos endpoint requiring payment (proxy middleware)
 */
export const runtime = "nodejs";

/**
 * Protected Aptos endpoint requiring payment (proxy middleware)
 */
export async function GET() {
  return NextResponse.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
}
