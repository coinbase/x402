import { describe, it, expect } from "vitest";
import { authorizationTypes, eip3009ABI } from "../../src/constants";

describe("EVM Constants", () => {
  describe("authorizationTypes", () => {
    it("should have TransferWithAuthorization type definition", () => {
      expect(authorizationTypes.TransferWithAuthorization).toBeDefined();
      expect(authorizationTypes.TransferWithAuthorization).toHaveLength(6);
    });

    it("should have correct field names", () => {
      const fields = authorizationTypes.TransferWithAuthorization;
      const fieldNames = fields.map(f => f.name);

      expect(fieldNames).toContain("from");
      expect(fieldNames).toContain("to");
      expect(fieldNames).toContain("value");
      expect(fieldNames).toContain("validAfter");
      expect(fieldNames).toContain("validBefore");
      expect(fieldNames).toContain("nonce");
    });

    it("should have correct field types", () => {
      const fields = authorizationTypes.TransferWithAuthorization;
      const fromField = fields.find(f => f.name === "from");
      const valueField = fields.find(f => f.name === "value");
      const nonceField = fields.find(f => f.name === "nonce");

      expect(fromField?.type).toBe("address");
      expect(valueField?.type).toBe("uint256");
      expect(nonceField?.type).toBe("bytes32");
    });
  });

  describe("eip3009ABI", () => {
    it("should include transferWithAuthorization functions", () => {
      const transferFunctions = eip3009ABI.filter(
        item => item.type === "function" && item.name === "transferWithAuthorization",
      );
      expect(transferFunctions.length).toBeGreaterThan(0);
    });

    it("should include balanceOf function", () => {
      const balanceOfFunction = eip3009ABI.find(
        item => item.type === "function" && item.name === "balanceOf",
      );
      expect(balanceOfFunction).toBeDefined();
      expect(balanceOfFunction?.stateMutability).toBe("view");
    });

    it("should include version function", () => {
      const versionFunction = eip3009ABI.find(
        item => item.type === "function" && item.name === "version",
      );
      expect(versionFunction).toBeDefined();
      expect(versionFunction?.stateMutability).toBe("view");
    });

    it("should have transferWithAuthorization with split signature (v, r, s)", () => {
      const splitSigFunction = eip3009ABI.find(
        item =>
          item.type === "function" &&
          item.name === "transferWithAuthorization" &&
          item.inputs.some(input => input.name === "v"),
      );
      expect(splitSigFunction).toBeDefined();
    });

    it("should have transferWithAuthorization with bytes signature", () => {
      const bytesSigFunction = eip3009ABI.find(
        item =>
          item.type === "function" &&
          item.name === "transferWithAuthorization" &&
          item.inputs.some(input => input.name === "signature"),
      );
      expect(bytesSigFunction).toBeDefined();
    });
  });
});
