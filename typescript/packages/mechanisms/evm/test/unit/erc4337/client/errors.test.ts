import { describe, it, expect } from "vitest";
import { parseAAError, PaymentCreationError } from "../../../../src/exact/client/erc4337/errors";

describe("parseAAError", () => {
  it("should parse AA error codes from error messages", () => {
    const result = parseAAError(new Error("AA21: insufficient funds"));
    expect(result).not.toBeNull();
    expect(result!.code).toBe("AA21");
    expect(result!.reason).toBe("Insufficient funds for gas prefund");
  });

  it("should parse AA24 signature validation failed", () => {
    const result = parseAAError(new Error("AA24 signature error"));
    expect(result).not.toBeNull();
    expect(result!.code).toBe("AA24");
    expect(result!.reason).toBe("Signature validation failed");
  });

  it("should return null for non-AA errors", () => {
    expect(parseAAError(new Error("regular error"))).toBeNull();
    expect(parseAAError("string error")).toBeNull();
  });

  it("should handle unknown AA codes", () => {
    const result = parseAAError(new Error("AA99 unknown code"));
    expect(result).not.toBeNull();
    expect(result!.code).toBe("AA99");
    expect(result!.reason).toBe("Unknown AA error");
  });

  it("should parse AA error code from a plain string (not Error object)", () => {
    const result = parseAAError("something went wrong AA21 in the bundler");
    expect(result).not.toBeNull();
    expect(result!.code).toBe("AA21");
    expect(result!.reason).toBe("Insufficient funds for gas prefund");
  });

  it("should parse AA30 paymaster not deployed", () => {
    const result = parseAAError(new Error("AA30 paymaster not deployed"));
    expect(result).not.toBeNull();
    expect(result!.code).toBe("AA30");
    expect(result!.reason).toBe("Paymaster not deployed");
  });
});

describe("PaymentCreationError", () => {
  it("should create error with all fields", () => {
    const error = new PaymentCreationError("test error", {
      phase: "preparation",
      reason: "test reason",
      safeAddress: "0x1234",
      network: "eip155:84532",
      code: "AA21",
    });
    expect(error.message).toBe("test error");
    expect(error.name).toBe("PaymentCreationError");
    expect(error.phase).toBe("preparation");
    expect(error.reason).toBe("test reason");
    expect(error.safeAddress).toBe("0x1234");
    expect(error.network).toBe("eip155:84532");
    expect(error.code).toBe("AA21");
  });

  it("should serialize to JSON", () => {
    const error = new PaymentCreationError("test", {
      phase: "signing",
      reason: "test reason",
      code: "AA24",
    });
    const json = error.toJSON();
    expect(json.name).toBe("PaymentCreationError");
    expect(json.phase).toBe("signing");
    expect(json.reason).toBe("test reason");
    expect(json.code).toBe("AA24");
  });

  it("should preserve cause", () => {
    const cause = new Error("original");
    const error = new PaymentCreationError("wrapped", {
      phase: "validation",
      reason: "wrapped reason",
      cause,
    });
    expect(error.cause).toBe(cause);
  });

  it("should support all phases", () => {
    const phases = ["preparation", "signing", "validation"] as const;
    for (const phase of phases) {
      const error = new PaymentCreationError("test", {
        phase,
        reason: "test",
      });
      expect(error.phase).toBe(phase);
    }
  });

  it("should omit optional fields from toJSON when absent", () => {
    const error = new PaymentCreationError("minimal error", {
      phase: "validation",
      reason: "minimal reason",
      // No code, safeAddress, or network
    });
    const json = error.toJSON();
    expect(json.name).toBe("PaymentCreationError");
    expect(json.message).toBe("minimal error");
    expect(json.phase).toBe("validation");
    expect(json.reason).toBe("minimal reason");
    // Optional fields should not be present in JSON
    expect(json).not.toHaveProperty("code");
    expect(json).not.toHaveProperty("safeAddress");
    expect(json).not.toHaveProperty("network");
  });

  it("should include all optional fields in toJSON when present", () => {
    const error = new PaymentCreationError("full error", {
      phase: "preparation",
      reason: "full reason",
      code: "AA21",
      safeAddress: "0x1234",
      network: "eip155:84532",
    });
    const json = error.toJSON();
    expect(json.code).toBe("AA21");
    expect(json.safeAddress).toBe("0x1234");
    expect(json.network).toBe("eip155:84532");
  });
});
