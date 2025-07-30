import { NextRequest, NextResponse } from "next/server";
import {
  ListDiscoveryResourcesRequest,
  ListDiscoveryResourcesResponse,
  ListDiscoveryResourcesResponseSchema,
} from "x402/types";

/**
 * This route is used to discover the available services on the facilitator.
 * It returns a list of services that are available on the facilitator.
 *
 * @param request - The request object
 * @returns A list of services that are available on the facilitator
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Implement actual discovery logic

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const { offset, limit } = Object.fromEntries(
      searchParams.entries(),
    ) as ListDiscoveryResourcesRequest;

    // TODO: Search by type, resource, fetching page size and page token

    // For now, return mock data
    const mockListDiscoveryResourcesResponse: ListDiscoveryResourcesResponse = {
      x402Version: 1,
      items: [],
      pagination: {
        limit,
        offset,
        total: 0,
      },
    };

    // Validate response with schema
    const validatedResponse = ListDiscoveryResourcesResponseSchema.parse(
      mockListDiscoveryResourcesResponse,
    );

    return NextResponse.json(validatedResponse);
  } catch (error) {
    console.error("Error in discover/list:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
