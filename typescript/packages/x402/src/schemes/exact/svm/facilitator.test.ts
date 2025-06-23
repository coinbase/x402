import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFeePayer, GetFeePayerResponse } from "./facilitator";
import { KeyPairSigner } from "@solana/kit";

describe("SVM Facilitator", () => {
  describe("getFeePayer", () => {
    let mockSigner: KeyPairSigner;
    const signerAddress = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

    beforeEach(() => {
      // Create a mock KeyPairSigner
      mockSigner = {
        address: {
          toString: vi.fn().mockReturnValue(signerAddress),
        },
        signMessage: vi.fn(),
        signTransaction: vi.fn(),
        signAllTransactions: vi.fn(),
      } as unknown as KeyPairSigner;
    });

    it("should return the signer's address as fee payer", async () => {
      const result = getFeePayer(mockSigner);

      expect(result).toEqual({
        feePayer: signerAddress,
      });
      expect(mockSigner.address.toString).toHaveBeenCalledOnce();
    });

    it("should return correct response type", async () => {
      const result = getFeePayer(mockSigner);

      expect(result).toMatchObject<GetFeePayerResponse>({
        feePayer: expect.any(String),
      });
    });

    it("should handle different address formats", async () => {
      const differentAddress = "11111111111111111111111111111112";
      mockSigner.address.toString = vi.fn().mockReturnValue(differentAddress);

      const result = getFeePayer(mockSigner);

      expect(result.feePayer).toBe(differentAddress);
    });

    it("should return a valid base58 address format", async () => {
      const result = getFeePayer(mockSigner);

      // Base58 addresses should only contain alphanumeric characters (excluding 0, O, I, l)
      expect(result.feePayer).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it("should handle empty address string", async () => {
      mockSigner.address.toString = vi.fn().mockReturnValue("");

      const result = getFeePayer(mockSigner);

      expect(result.feePayer).toBe("");
    });
  });
});
