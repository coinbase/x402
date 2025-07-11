import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSigner, KeyPairSigner } from "@solana/kit";
import { getFeePayer, GetFeePayerResponse } from "./feePayer";

describe("getFeePayer", () => {
  let mockSigner: KeyPairSigner;

  beforeEach(async () => {
    mockSigner = await generateKeyPairSigner();
  });

  it("should return the facilitator's signer address as fee payer", async () => {
    const result = getFeePayer(mockSigner);

    expect(result).toEqual({
      feePayer: mockSigner.address.toString(),
    });
  });

  it("should return correct response type", async () => {
    const result = getFeePayer(mockSigner);

    expect(result).toMatchObject<GetFeePayerResponse>({
      feePayer: expect.any(String),
    });
  });

  it("should return a valid base58 address format", async () => {
    const result = getFeePayer(mockSigner);

    // Base58 addresses should only contain alphanumeric characters (excluding 0, O, I, l)
    expect(result.feePayer).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it("should return the same address when called multiple times", async () => {
    const result1 = getFeePayer(mockSigner);
    const result2 = getFeePayer(mockSigner);

    expect(result1.feePayer).toBe(result2.feePayer);
    expect(result1.feePayer).toBe(mockSigner.address.toString());
  });
});
