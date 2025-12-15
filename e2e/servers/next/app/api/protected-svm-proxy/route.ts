import { NextResponse } from "next/server";

/**
 * Protected SVM endpoint requiring payment (proxy middleware)
 */
export const runtime = "nodejs";

/**
 * Protected SVM endpoint requiring payment (proxy middleware)
 */
export async function GET() {
  return NextResponse.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
}

