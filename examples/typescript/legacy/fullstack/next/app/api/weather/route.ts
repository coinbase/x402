import { NextRequest, NextResponse } from "next/server";

/**
 * Weather endpoint requiring payment
 */
export const runtime = "nodejs";

/**
 * Get weather information for a city (hardcoded response)
 */
export async function POST(request: NextRequest) {
  try {
    console.info(request);
    const body = await request.json();
    console.info(body);
    const { city } = body;
    console.info(city);

    if (!city) {
      return NextResponse.json(
        { error: "City parameter is required" },
        { status: 400 }
      );
    }

    // Return hardcoded temperature
    return NextResponse.json({
      city,
      temperature: 72,
      unit: "F",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

