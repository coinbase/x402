/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { getBase64Encoder, getTransactionDecoder } from "@solana/kit";
import { ExactSvmPayload } from "../../types/verify";
import { decodeTransaction } from "./transaction";

vi.mock("@solana/kit", () => ({
  getBase64Encoder: vi.fn(),
  getTransactionDecoder: vi.fn(),
}));

describe("decodeTransaction", () => {
  it("should decode a valid transaction string", () => {
    const mockDecodedTransaction = { signature: "a_valid_signature" };
    const encodeFn = vi.fn().mockReturnValue(new Uint8Array());
    const decodeFn = vi.fn().mockReturnValue(mockDecodedTransaction);

    vi.mocked(getBase64Encoder).mockReturnValue({
      encode: encodeFn,
      write: vi.fn(),
    } as any);
    vi.mocked(getTransactionDecoder).mockReturnValue({
      decode: decodeFn,
      read: vi.fn(),
    } as any);

    const svmPayload: ExactSvmPayload = {
      transaction: "a_valid_transaction_string",
    };

    const result = decodeTransaction(svmPayload);
    expect(result).toEqual(mockDecodedTransaction);
    expect(encodeFn).toHaveBeenCalledWith("a_valid_transaction_string");
    expect(decodeFn).toHaveBeenCalled();
  });

  it("should throw an error for an invalid transaction string", () => {
    const encodeFn = vi.fn().mockImplementation(() => {
      throw new Error("Encoding failed");
    });
    vi.mocked(getBase64Encoder).mockReturnValue({
      encode: encodeFn,
      write: vi.fn(),
    } as any);

    const svmPayload: ExactSvmPayload = {
      transaction: "an_invalid_transaction_string",
    };

    expect(() => decodeTransaction(svmPayload)).toThrow("invalid_exact_svm_payload_transaction");
  });
});
