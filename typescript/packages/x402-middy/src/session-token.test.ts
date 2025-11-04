import type { APIGatewayProxyEvent } from "aws-lambda";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { handler } from "./session-token";

// Mock the CDP SDK
vi.mock("@coinbase/cdp-sdk/auth", () => ({
  generateJwt: vi.fn(),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe("session-token handler", () => {
  let mockEvent: Partial<APIGatewayProxyEvent>;
  let mockEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock environment variables
    mockEnv = {
      CDP_API_KEY_ID: "test-key-id",
      CDP_API_KEY_SECRET: "test-key-secret",
    };
    vi.stubGlobal("process", {
      env: mockEnv,
    });

    // Set up Lambda event mock
    mockEvent = {
      body: null,
      headers: {},
    } as APIGatewayProxyEvent;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("successful token generation", () => {
    it("should generate session token successfully", async () => {
      const mockJwt = "mock-jwt-token";
      const mockSessionToken = {
        token: "session-token-123",
        expires_at: "2024-01-01T00:00:00Z",
      };

      mockEvent.body = JSON.stringify({
        addresses: [{ address: "0x1234567890123456789012345678901234567890" }],
      });

      vi.mocked(generateJwt).mockResolvedValue(mockJwt);
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSessionToken),
      } as unknown as globalThis.Response);

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(generateJwt).toHaveBeenCalledWith({
        apiKeyId: "test-key-id",
        apiKeySecret: "test-key-secret",
        requestMethod: "POST",
        requestHost: "api.developer.coinbase.com",
        requestPath: "/onramp/v1/token",
      });

      expect(fetch).toHaveBeenCalledWith("https://api.developer.coinbase.com/onramp/v1/token", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mockJwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          addresses: [
            {
              address: "0x1234567890123456789012345678901234567890",
              blockchains: ["base"],
            },
          ],
        }),
      });

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockSessionToken);
    });
  });

  describe("environment variable validation", () => {
    it("should return 500 when CDP_API_KEY_ID is missing", async () => {
      mockEnv.CDP_API_KEY_ID = undefined;

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: "Server configuration error: Missing CDP API credentials",
      });
    });

    it("should return 500 when CDP_API_KEY_SECRET is missing", async () => {
      mockEnv.CDP_API_KEY_SECRET = undefined;

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: "Server configuration error: Missing CDP API credentials",
      });
    });

    it("should return 500 when both API keys are missing", async () => {
      mockEnv.CDP_API_KEY_ID = undefined;
      mockEnv.CDP_API_KEY_SECRET = undefined;

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: "Server configuration error: Missing CDP API credentials",
      });
    });
  });

  describe("request body validation", () => {
    it("should return 400 when addresses is missing", async () => {
      mockEvent.body = JSON.stringify({});

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: "addresses is required and must be a non-empty array",
      });
    });

    it("should return 400 when addresses is null", async () => {
      mockEvent.body = JSON.stringify({ addresses: null });

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: "addresses is required and must be a non-empty array",
      });
    });

    it("should return 400 when addresses is not an array", async () => {
      mockEvent.body = JSON.stringify({ addresses: "not-an-array" });

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: "addresses is required and must be a non-empty array",
      });
    });

    it("should return 400 when addresses is empty array", async () => {
      mockEvent.body = JSON.stringify({ addresses: [] });

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: "addresses is required and must be a non-empty array",
      });
    });
  });

  describe("JWT generation errors", () => {
    it("should return 500 when JWT generation fails", async () => {
      mockEvent.body = JSON.stringify({
        addresses: [{ address: "0x1234567890123456789012345678901234567890" }],
      });

      vi.mocked(generateJwt).mockRejectedValue(new Error("JWT generation failed"));

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: "Internal server error",
      });
    });
  });

  describe("CDP API errors", () => {
    it("should return 400 when CDP API returns 400", async () => {
      mockEvent.body = JSON.stringify({
        addresses: [{ address: "0x1234567890123456789012345678901234567890" }],
      });

      vi.mocked(generateJwt).mockResolvedValue("mock-jwt");
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      } as unknown as globalThis.Response);

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({
        error: "Failed to generate session token",
      });
    });

    it("should return 401 when CDP API returns 401", async () => {
      mockEvent.body = JSON.stringify({
        addresses: [{ address: "0x1234567890123456789012345678901234567890" }],
      });

      vi.mocked(generateJwt).mockResolvedValue("mock-jwt");
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      } as unknown as globalThis.Response);

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({
        error: "Failed to generate session token",
      });
    });

    it("should return 500 when CDP API returns 500", async () => {
      mockEvent.body = JSON.stringify({
        addresses: [{ address: "0x1234567890123456789012345678901234567890" }],
      });

      vi.mocked(generateJwt).mockResolvedValue("mock-jwt");
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      } as unknown as globalThis.Response);

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: "Failed to generate session token",
      });
    });
  });

  describe("network errors", () => {
    it("should return 500 when fetch fails", async () => {
      mockEvent.body = JSON.stringify({
        addresses: [{ address: "0x1234567890123456789012345678901234567890" }],
      });

      vi.mocked(generateJwt).mockResolvedValue("mock-jwt");
      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: "Internal server error",
      });
    });

    it("should return 500 when response.json() fails", async () => {
      mockEvent.body = JSON.stringify({
        addresses: [{ address: "0x1234567890123456789012345678901234567890" }],
      });

      vi.mocked(generateJwt).mockResolvedValue("mock-jwt");
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("JSON parsing error")),
      } as unknown as globalThis.Response);

      const result = await handler(mockEvent as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({
        error: "Internal server error",
      });
    });
  });
});
