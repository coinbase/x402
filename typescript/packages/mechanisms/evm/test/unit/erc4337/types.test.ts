import { describe, it, expect } from "vitest";
import { isErc4337Payload, extractUserOperationCapability } from "../../../src/erc4337";
import type { PaymentRequirements } from "@x402/core/types";

describe("isErc4337Payload", () => {
  it("should return true for a valid ERC-4337 payload", () => {
    const payload = {
      type: "erc4337" as const,
      entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      bundlerRpcUrl: "https://bundler.example.com",
      userOperation: {
        sender: "0x1234567890123456789012345678901234567890",
        nonce: "0x0",
        callData: "0x",
        callGasLimit: "0x5208",
        verificationGasLimit: "0x5208",
        preVerificationGas: "0x5208",
        maxFeePerGas: "0x3B9ACA00",
        maxPriorityFeePerGas: "0x3B9ACA00",
        signature: "0x",
      },
    };
    expect(isErc4337Payload(payload)).toBe(true);
  });

  it("should return true without explicit type field", () => {
    const payload = {
      entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      userOperation: {
        sender: "0x1234567890123456789012345678901234567890",
        nonce: "0x0",
        callData: "0x",
        callGasLimit: "0x5208",
        verificationGasLimit: "0x5208",
        preVerificationGas: "0x5208",
        maxFeePerGas: "0x3B9ACA00",
        maxPriorityFeePerGas: "0x3B9ACA00",
        signature: "0x",
      },
    };
    expect(isErc4337Payload(payload)).toBe(true);
  });

  it("should return false for null", () => {
    expect(isErc4337Payload(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isErc4337Payload(undefined)).toBe(false);
  });

  it("should return false for a non-object", () => {
    expect(isErc4337Payload("string")).toBe(false);
  });

  it("should return false for an object without userOperation", () => {
    expect(isErc4337Payload({ entryPoint: "0x..." })).toBe(false);
  });

  it("should return false for an EIP-3009 payload", () => {
    const payload = {
      authorization: {
        from: "0x1234",
        to: "0x5678",
        value: "1000",
        validAfter: "0",
        validBefore: "999999999999",
        nonce: "0x1234",
      },
    };
    expect(isErc4337Payload(payload)).toBe(false);
  });

  it("should return false for a Permit2 payload", () => {
    const payload = {
      permit2Authorization: {
        permitted: { token: "0x1234", amount: "1000" },
        spender: "0x5678",
        nonce: "1",
        deadline: "999999999999",
        witness: { to: "0x5678", validAfter: "0" },
        from: "0x1234",
      },
      signature: "0x1234",
    };
    expect(isErc4337Payload(payload)).toBe(false);
  });
});

describe("extractUserOperationCapability", () => {
  it("should extract user operation capability from requirements", () => {
    const requirements = {
      extra: {
        userOperation: {
          supported: true,
          bundlerUrl: "https://bundler.example.com",
          entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
        },
      },
    } as unknown as PaymentRequirements;

    const result = extractUserOperationCapability(requirements);
    expect(result).toBeDefined();
    expect(result!.supported).toBe(true);
    expect(result!.bundlerUrl).toBe("https://bundler.example.com");
  });

  it("should return undefined when no userOperation in extra", () => {
    const requirements = {
      extra: {},
    } as unknown as PaymentRequirements;

    const result = extractUserOperationCapability(requirements);
    expect(result).toBeUndefined();
  });

  it("should return undefined when extra is undefined", () => {
    const requirements = {} as unknown as PaymentRequirements;
    const result = extractUserOperationCapability(requirements);
    expect(result).toBeUndefined();
  });

  it("should return undefined when supported is not true", () => {
    const requirements = {
      extra: {
        userOperation: {
          supported: false,
        },
      },
    } as unknown as PaymentRequirements;

    const result = extractUserOperationCapability(requirements);
    expect(result).toBeUndefined();
  });
});
