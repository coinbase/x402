import { NextResponse } from "next/server";

/**
 * Protected endpoint requiring payment
 */
export const runtime = "nodejs";

/**
 * Protected endpoint requiring payment
 */
export async function GET() {
  return NextResponse.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
} 