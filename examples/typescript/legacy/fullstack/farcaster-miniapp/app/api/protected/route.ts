import { NextResponse } from "next/server";

/**
 * Protected API endpoint that requires x402 payment to access.
 * This route demonstrates how to protect API endpoints with payment requirements.
 *
 * @returns {Promise<NextResponse>} JSON response indicating success or error
 */
export async function GET() {
  try {
    console.log("Protected route accessed successfully");

    return NextResponse.json({
      success: true,
      message: "Protected action completed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in protected route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
