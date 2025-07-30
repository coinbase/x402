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
      items: [
        {
          type: "http",
          resource: "https://api.example.com/ai/completion",
          x402Version: 1,
          lastUpdated: Date.now(),
          accepts: [
            {
              scheme: "exact",
              network: "base",
              maxAmountRequired: "1000000000000000000", // 1 ETH in wei
              resource: "https://api.example.com/ai/completion",
              description: "AI text completion service",
              outputSchema: {
                input: {
                  type: "http",
                  method: "POST",
                  bodyType: "json",
                  bodyFields: {
                    prompt: "string",
                    maxTokens: "number",
                  },
                  headerFields: {
                    "Content-Type": "application/json",
                  },
                },
              },
              mimeType: "application/json",
              payTo: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
              maxTimeoutSeconds: 300,
              asset: "0x0000000000000000000000000000000000000000", // ETH
            },
          ],
          metadata: {
            categories: ["ai", "text-generation"],
            successRate7d: 98.5,
            avgLatencyMs: 1200,
            totalRequests: 15420,
          },
        },
        {
          type: "http",
          resource: "https://api.example.com/image/generate",
          x402Version: 1,
          lastUpdated: Date.now(),
          accepts: [
            {
              scheme: "exact",
              network: "base",
              maxAmountRequired: "500000000000000000", // 0.5 ETH in wei
              resource: "https://api.example.com/image/generate",
              description: "AI image generation service",
              outputSchema: {
                input: {
                  type: "http",
                  method: "POST",
                  bodyType: "json",
                  bodyFields: {
                    prompt: "string",
                    width: "number",
                    height: "number",
                  },
                },
              },
              mimeType: "application/json",
              payTo: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
              maxTimeoutSeconds: 600,
              asset: "0x0000000000000000000000000000000000000000", // ETH
            },
          ],
          metadata: {
            categories: ["ai", "image-generation"],
            successRate7d: 95.2,
            avgLatencyMs: 4500,
            totalRequests: 8230,
          },
        },
      ],
      pagination: {
        limit,
        offset,
        total: 2,
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
