import { NextResponse } from "next/server";
import { APTOS_PAYEE_ADDRESS } from "../../../proxy";

/**
 * Protected Aptos endpoint requiring payment (proxy middleware)
 */
export const runtime = "nodejs";

/**
 * Protected Aptos endpoint requiring payment (proxy middleware)
 */
export async function GET() {
  if (!APTOS_PAYEE_ADDRESS) {
    return NextResponse.json({
      error: "Aptos payments not configured",
      message: "APTOS_PAYEE_ADDRESS environment variable is not set",
    }, { status: 501 });
  }
  return NextResponse.json({
    message: "Protected endpoint accessed successfully",
    timestamp: new Date().toISOString(),
  });
}
