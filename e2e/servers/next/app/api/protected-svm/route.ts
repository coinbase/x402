import { NextResponse } from "next/server";

/**
 * Protected SVM endpoint requiring payment
 */
export const runtime = "nodejs";

/**
 * Protected SVM endpoint requiring payment
 */
export async function GET() {
  return NextResponse.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
}

