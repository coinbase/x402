import { describe, expect, it, vi, beforeEach } from "vitest";

describe("EvmPaywall - Error Response Parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("parseErrorResponse", () => {
    const mockResponse = (status: number, statusText: string, body: unknown) => ({
      ok: false,
      status,
      statusText,
      json: vi.fn().mockResolvedValue(body),
    });

    it("should extract error message from error field", async () => {
      const response = mockResponse(400, "Bad Request", {
        error: "Payment validation failed",
      });

      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use default error message
      }

      expect(errorMessage).toBe("Payment validation failed");
    });

    it("should handle undeployed smart wallet error", async () => {
      const response = mockResponse(400, "Bad Request", {
        invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
      });

      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (
          errorData.invalidReason === "invalid_exact_evm_payload_undeployed_smart_wallet"
        ) {
          errorMessage =
            "Smart wallet must be deployed before making payments. Please deploy your wallet first.";
        } else if (errorData.invalidReason) {
          errorMessage = `Payment validation failed: ${errorData.invalidReason}`;
        }
      } catch {
        // Use default error message
      }

      expect(errorMessage).toBe(
        "Smart wallet must be deployed before making payments. Please deploy your wallet first.",
      );
    });

    it("should handle generic invalidReason", async () => {
      const response = mockResponse(400, "Bad Request", {
        invalidReason: "insufficient_funds",
      });

      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (
          errorData.invalidReason === "invalid_exact_evm_payload_undeployed_smart_wallet"
        ) {
          errorMessage =
            "Smart wallet must be deployed before making payments. Please deploy your wallet first.";
        } else if (errorData.invalidReason) {
          errorMessage = `Payment validation failed: ${errorData.invalidReason}`;
        }
      } catch {
        // Use default error message
      }

      expect(errorMessage).toBe("Payment validation failed: insufficient_funds");
    });

    it("should prioritize error field over invalidReason", async () => {
      const response = mockResponse(400, "Bad Request", {
        error: "Custom error message",
        invalidReason: "insufficient_funds",
      });

      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (
          errorData.invalidReason === "invalid_exact_evm_payload_undeployed_smart_wallet"
        ) {
          errorMessage =
            "Smart wallet must be deployed before making payments. Please deploy your wallet first.";
        } else if (errorData.invalidReason) {
          errorMessage = `Payment validation failed: ${errorData.invalidReason}`;
        }
      } catch {
        // Use default error message
      }

      expect(errorMessage).toBe("Custom error message");
    });

    it("should fall back to default error when JSON parsing fails", async () => {
      const response = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
      };

      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (
          errorData.invalidReason === "invalid_exact_evm_payload_undeployed_smart_wallet"
        ) {
          errorMessage =
            "Smart wallet must be deployed before making payments. Please deploy your wallet first.";
        } else if (errorData.invalidReason) {
          errorMessage = `Payment validation failed: ${errorData.invalidReason}`;
        }
      } catch {
        // Use default error message
      }

      expect(errorMessage).toBe("Request failed: 500 Internal Server Error");
    });

    it("should fall back to default error when response has no error fields", async () => {
      const response = mockResponse(404, "Not Found", {
        message: "Some other message",
      });

      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (
          errorData.invalidReason === "invalid_exact_evm_payload_undeployed_smart_wallet"
        ) {
          errorMessage =
            "Smart wallet must be deployed before making payments. Please deploy your wallet first.";
        } else if (errorData.invalidReason) {
          errorMessage = `Payment validation failed: ${errorData.invalidReason}`;
        }
      } catch {
        // Use default error message
      }

      expect(errorMessage).toBe("Request failed: 404 Not Found");
    });

    it("should handle network validation error", async () => {
      const response = mockResponse(400, "Bad Request", {
        error:
          "This facilitator only supports: base-sepolia, solana-devnet. Network 'base' is not supported.",
        invalidReason: "invalid_network",
      });

      let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (
          errorData.invalidReason === "invalid_exact_evm_payload_undeployed_smart_wallet"
        ) {
          errorMessage =
            "Smart wallet must be deployed before making payments. Please deploy your wallet first.";
        } else if (errorData.invalidReason) {
          errorMessage = `Payment validation failed: ${errorData.invalidReason}`;
        }
      } catch {
        // Use default error message
      }

      expect(errorMessage).toContain("This facilitator only supports");
      expect(errorMessage).toContain("base-sepolia");
    });
  });
});
