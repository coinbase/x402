import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCdpAuthHeaders, createFacilitatorConfig } from "./index";

// Mock the generateJwt function from the correct path
vi.mock("x402/shared", () => ({
  createAuthHeader: vi.fn().mockResolvedValue("Bearer mock-jwt-token"),
  createCorrelationHeader: vi.fn().mockReturnValue("correlation-header"),
}));

describe("coinbase-x402", () => {
  const mockApiKeyId = "test-api-key-id";
  const mockApiKeySecret = "test-api-key-secret";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CDP_API_KEY_ID = mockApiKeyId;
    process.env.CDP_API_KEY_SECRET = mockApiKeySecret;
  });

  afterEach(() => {
    delete process.env.CDP_API_KEY_ID;
    delete process.env.CDP_API_KEY_SECRET;
  });

  describe("createCdpAuthHeaders", () => {
    it("should create auth headers using provided API keys", async () => {
      const createHeaders = createCdpAuthHeaders(mockApiKeyId, mockApiKeySecret);
      const headers = await createHeaders();

      expect(headers.verify.Authorization).toBe("Bearer mock-jwt-token");
      expect(headers.settle.Authorization).toBe("Bearer mock-jwt-token");
      expect(headers.verify["Correlation-Context"]).toBe("correlation-header");
      expect(headers.settle["Correlation-Context"]).toBe("correlation-header");
    });

    it("should create auth headers using environment variables when no API keys provided", async () => {
      const createHeaders = createCdpAuthHeaders();
      const headers = await createHeaders();

      expect(headers.verify.Authorization).toBe("Bearer mock-jwt-token");
      expect(headers.settle.Authorization).toBe("Bearer mock-jwt-token");
      expect(headers.verify["Correlation-Context"]).toBe("correlation-header");
      expect(headers.settle["Correlation-Context"]).toBe("correlation-header");
    });

    it("should throw error when API keys are missing", async () => {
      delete process.env.CDP_API_KEY_ID;
      delete process.env.CDP_API_KEY_SECRET;

      const createHeaders = createCdpAuthHeaders();
      await expect(createHeaders()).rejects.toThrow(
        "Missing environment variables: CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set when using default facilitator",
      );
    });
  });

  describe("createFacilitatorConfig", () => {
    it("should create facilitator config with provided API keys", () => {
      const config = createFacilitatorConfig(mockApiKeyId, mockApiKeySecret);

      expect(config.url).toBe("https://api.cdp.coinbase.com/platform/v2/x402");
      expect(config.createAuthHeaders).toBeDefined();
    });

    it("should create facilitator config using environment variables when no API keys provided", () => {
      const config = createFacilitatorConfig();

      expect(config.url).toBe("https://api.cdp.coinbase.com/platform/v2/x402");
      expect(config.createAuthHeaders).toBeDefined();
    });

    it("should create default facilitator config", () => {
      const config = createFacilitatorConfig();

      expect(config.url).toBe("https://api.cdp.coinbase.com/platform/v2/x402");
      expect(config.createAuthHeaders).toBeDefined();
    });
  });
});
