import { NextRequest, NextResponse } from "next/server";
import { BazaarResponse, BazaarResponseSchema } from "x402/types";

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // TODO: Implement actual discovery logic
    // For now, return mock data
    const mockBazaarResponse: BazaarResponse = {
      version: 1,
      items: [
        {
          paymentRequirements: {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "1000000000000000000", // 1 ETH in wei
            resource: "https://api.example.com/ai/completion",
            description: "AI text completion service",
            mimeType: "application/json",
            payTo: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
            maxTimeoutSeconds: 300,
            asset: "0x0000000000000000000000000000000000000000", // ETH
          },
          requestStructure: {
            spec: "http",
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
          metadata: {
            categories: ["ai", "text-generation"],
            successRate7d: 98.5,
            avgLatencyMs: 1200,
            totalRequests: 15420,
          },
        },
        {
          paymentRequirements: {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "500000000000000000", // 0.5 ETH in wei
            resource: "https://api.example.com/image/generate",
            description: "AI image generation service",
            mimeType: "application/json",
            payTo: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
            maxTimeoutSeconds: 600,
            asset: "0x0000000000000000000000000000000000000000", // ETH
          },
          requestStructure: {
            spec: "http",
            method: "POST",
            bodyType: "json",
            bodyFields: {
              prompt: "string",
              width: "number",
              height: "number",
            },
            headerFields: {
              "Content-Type": "application/json",
            },
          },
          metadata: {
            categories: ["ai", "image-generation"],
            successRate7d: 95.2,
            avgLatencyMs: 4500,
            totalRequests: 8230,
          },
        },
      ],
      numItems: 2,
      pagination: {
        offset,
      },
    };

    // Validate response with schema
    const validatedResponse = BazaarResponseSchema.parse(mockBazaarResponse);

    return NextResponse.json(validatedResponse);
  } catch (error) {
    console.error("Error in discover/list:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
