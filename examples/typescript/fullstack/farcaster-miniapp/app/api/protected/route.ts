import { NextResponse } from "next/server";

/**
 * Protected API endpoint that requires x402 payment to access.
 * This route demonstrates how to protect API endpoints with payment requirements.
 *
 * @returns {Promise<NextResponse>} JSON response indicating success or error
 */
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      message: "Protected action completed successfully",
    });
  } catch (error) {
    console.error("Error in protected route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
