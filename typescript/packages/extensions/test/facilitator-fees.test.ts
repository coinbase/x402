import { describe, expect, test } from "vitest";
import {
  FACILITATOR_FEES,
  FacilitatorFeeQuoteSchema,
  FacilitatorFeeBidSchema,
  FacilitatorFeesPaymentRequiredInfoSchema,
  FacilitatorFeesSettlementInfoSchema,
  declareFacilitatorFeesExtension,
  createFacilitatorFeeBid,
  createFacilitatorFeePaid,
  extractFacilitatorFeesFromPaymentRequired,
  extractFacilitatorFeeBid,
  extractFacilitatorFeePaid,
  isQuoteExpired,
  findOptionByQuoteId,
  filterOptionsByMaxFee,
  calculateBpsFee,
  calculateFee,
  getCanonicalQuotePayload,
  verifySettlementMatchesSelection,
} from "../src/facilitator-fees";

const TEST_FACILITATOR_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

describe("facilitator-fees extension", () => {
  describe("schemas", () => {
    test("FacilitatorFeeQuoteSchema accepts valid flat fee quote", () => {
      const quote = {
        quoteId: "quote_abc123",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "flat",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        flatFee: "1000",
        expiry: 1737400000,
        signature: "0xabcdef",
        signatureScheme: "eip191",
      };

      expect(FacilitatorFeeQuoteSchema.parse(quote)).toEqual(quote);
    });

    test("FacilitatorFeeQuoteSchema accepts valid bps fee quote", () => {
      const quote = {
        quoteId: "quote_xyz789",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "bps",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        bps: 30,
        minFee: "100",
        maxFee: "10000",
        expiry: 1737400000,
        signature: "0xabcdef",
        signatureScheme: "eip191",
      };

      expect(FacilitatorFeeQuoteSchema.parse(quote)).toEqual(quote);
    });

    test("FacilitatorFeeQuoteSchema rejects invalid signature scheme", () => {
      const quote = {
        quoteId: "quote_abc123",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "flat",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        flatFee: "1000",
        expiry: 1737400000,
        signature: "0xabcdef",
        signatureScheme: "invalid",
      };

      expect(() => FacilitatorFeeQuoteSchema.parse(quote)).toThrow();
    });

    test("FacilitatorFeeQuoteSchema rejects bps over 10000", () => {
      const quote = {
        quoteId: "quote_abc123",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "bps",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        bps: 15000, // 150% - invalid
        expiry: 1737400000,
        signature: "0xabcdef",
        signatureScheme: "eip191",
      };

      expect(() => FacilitatorFeeQuoteSchema.parse(quote)).toThrow();
    });

    test("FacilitatorFeeBidSchema accepts valid bid", () => {
      const bid = {
        maxTotalFee: "5000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        selectedQuoteId: "quote_abc123",
        patient: true,
      };

      expect(FacilitatorFeeBidSchema.parse(bid)).toEqual(bid);
    });

    test("FacilitatorFeeBidSchema accepts minimal bid", () => {
      const bid = {
        maxTotalFee: "5000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      };

      expect(FacilitatorFeeBidSchema.parse(bid)).toEqual(bid);
    });

    test("FacilitatorFeesPaymentRequiredInfoSchema accepts valid info", () => {
      const info = {
        version: "1",
        options: [
          {
            facilitatorId: "https://x402.org/facilitator",
            facilitatorFeeQuote: {
              quoteId: "quote_abc123",
              facilitatorAddress: TEST_FACILITATOR_ADDRESS,
              model: "flat",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              flatFee: "1000",
              expiry: 1737400000,
              signature: "0xabcdef",
              signatureScheme: "eip191",
            },
          },
        ],
      };

      expect(FacilitatorFeesPaymentRequiredInfoSchema.parse(info)).toBeTruthy();
    });

    test("FacilitatorFeesPaymentRequiredInfoSchema accepts option with only maxFacilitatorFee", () => {
      const info = {
        version: "1",
        options: [
          {
            facilitatorId: "https://x402.org/facilitator",
            maxFacilitatorFee: "5000",
          },
        ],
      };

      expect(FacilitatorFeesPaymentRequiredInfoSchema.parse(info)).toBeTruthy();
    });

    test("FacilitatorFeesSettlementInfoSchema accepts valid info", () => {
      const info = {
        version: "1",
        facilitatorFeePaid: "1000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        quoteId: "quote_abc123",
        facilitatorId: "https://x402.org/facilitator",
        model: "flat",
      };

      expect(FacilitatorFeesSettlementInfoSchema.parse(info)).toEqual(info);
    });
  });

  describe("helper functions", () => {
    const sampleOptions = [
      {
        facilitatorId: "https://x402.org/facilitator",
        facilitatorFeeQuote: {
          quoteId: "quote_abc123",
          facilitatorAddress: TEST_FACILITATOR_ADDRESS,
          model: "flat" as const,
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          flatFee: "1000",
          expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          signature: "0xabcdef",
          signatureScheme: "eip191" as const,
        },
      },
      {
        facilitatorId: "https://thirdweb.io/facilitator",
        maxFacilitatorFee: "5000",
      },
    ];

    test("declareFacilitatorFeesExtension creates valid extension", () => {
      const extension = declareFacilitatorFeesExtension(sampleOptions);

      expect(extension.info.version).toBe("1");
      expect(extension.info.options).toHaveLength(2);
      expect(extension.schema).toBeDefined();
    });

    test("createFacilitatorFeeBid creates valid bid extension", () => {
      const bid = createFacilitatorFeeBid({
        maxTotalFee: "2000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        selectedQuoteId: "quote_abc123",
      });

      expect(bid.info.version).toBe("1");
      expect(bid.info.facilitatorFeeBid.maxTotalFee).toBe("2000");
      expect(bid.info.facilitatorFeeBid.selectedQuoteId).toBe("quote_abc123");
    });

    test("createFacilitatorFeePaid creates valid fee paid extension", () => {
      const feePaid = createFacilitatorFeePaid({
        facilitatorFeePaid: "1000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        quoteId: "quote_abc123",
        facilitatorId: "https://x402.org/facilitator",
      });

      expect(feePaid.info.version).toBe("1");
      expect(feePaid.info.facilitatorFeePaid).toBe("1000");
    });

    test("extractFacilitatorFeesFromPaymentRequired extracts valid extension", () => {
      const extension = declareFacilitatorFeesExtension(sampleOptions);
      const paymentRequired = {
        extensions: {
          [FACILITATOR_FEES]: extension,
        },
      };

      const extracted = extractFacilitatorFeesFromPaymentRequired(paymentRequired);

      expect(extracted).toBeDefined();
      expect(extracted?.options).toHaveLength(2);
    });

    test("extractFacilitatorFeesFromPaymentRequired returns undefined for missing extension", () => {
      const paymentRequired = { extensions: {} };
      const extracted = extractFacilitatorFeesFromPaymentRequired(paymentRequired);
      expect(extracted).toBeUndefined();
    });

    test("extractFacilitatorFeeBid extracts valid bid", () => {
      const bid = createFacilitatorFeeBid({
        maxTotalFee: "2000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      });
      const paymentPayload = {
        extensions: {
          [FACILITATOR_FEES]: bid,
        },
      };

      const extracted = extractFacilitatorFeeBid(paymentPayload);

      expect(extracted).toBeDefined();
      expect(extracted?.maxTotalFee).toBe("2000");
    });

    test("extractFacilitatorFeePaid extracts valid fee paid", () => {
      const feePaid = createFacilitatorFeePaid({
        facilitatorFeePaid: "1000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      });
      const settlementResponse = {
        extensions: {
          [FACILITATOR_FEES]: feePaid,
        },
      };

      const extracted = extractFacilitatorFeePaid(settlementResponse);

      expect(extracted).toBeDefined();
      expect(extracted?.facilitatorFeePaid).toBe("1000");
    });

    test("isQuoteExpired returns false for valid quote", () => {
      const quote = {
        quoteId: "quote_abc123",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "flat" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        flatFee: "1000",
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      expect(isQuoteExpired(quote)).toBe(false);
    });

    test("isQuoteExpired returns true for expired quote", () => {
      const quote = {
        quoteId: "quote_abc123",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "flat" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        flatFee: "1000",
        expiry: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      expect(isQuoteExpired(quote)).toBe(true);
    });

    test("isQuoteExpired respects grace period", () => {
      const quote = {
        quoteId: "quote_abc123",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "flat" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        flatFee: "1000",
        expiry: Math.floor(Date.now() / 1000) - 10, // 10 seconds ago
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      expect(isQuoteExpired(quote, 30)).toBe(false); // Within 30s grace
      expect(isQuoteExpired(quote, 5)).toBe(true); // Outside 5s grace
    });

    test("findOptionByQuoteId finds matching option", () => {
      const found = findOptionByQuoteId(sampleOptions, "quote_abc123");
      expect(found).toBeDefined();
      expect(found?.facilitatorId).toBe("https://x402.org/facilitator");
    });

    test("findOptionByQuoteId returns undefined for non-existent quote", () => {
      const found = findOptionByQuoteId(sampleOptions, "nonexistent");
      expect(found).toBeUndefined();
    });

    test("filterOptionsByMaxFee filters by flat fee", () => {
      const filtered = filterOptionsByMaxFee(sampleOptions, "2000");

      expect(filtered).toHaveLength(1);
      expect(filtered[0].facilitatorId).toBe("https://x402.org/facilitator");
    });

    test("filterOptionsByMaxFee filters by maxFacilitatorFee", () => {
      const filtered = filterOptionsByMaxFee(sampleOptions, "10000");

      expect(filtered).toHaveLength(2);
    });

    test("filterOptionsByMaxFee excludes options exceeding max", () => {
      const filtered = filterOptionsByMaxFee(sampleOptions, "500");

      expect(filtered).toHaveLength(0);
    });
  });

  describe("extension key", () => {
    test("FACILITATOR_FEES constant is correct", () => {
      expect(FACILITATOR_FEES).toBe("facilitatorFees");
    });
  });

  describe("fee calculation", () => {
    test("calculateBpsFee calculates correct fee", () => {
      const quote = {
        quoteId: "quote_bps",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "bps" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        bps: 30, // 0.3%
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      // 0.3% of 1,000,000 = 3,000
      expect(calculateBpsFee(quote, "1000000")).toBe(BigInt(3000));

      // 0.3% of 100 = 0.3, rounded down to 0
      expect(calculateBpsFee(quote, "100")).toBe(BigInt(0));
    });

    test("calculateBpsFee respects minFee", () => {
      const quote = {
        quoteId: "quote_bps",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "bps" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        bps: 30,
        minFee: "100",
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      // 0.3% of 1000 = 3, but minFee is 100
      expect(calculateBpsFee(quote, "1000")).toBe(BigInt(100));
    });

    test("calculateBpsFee respects maxFee", () => {
      const quote = {
        quoteId: "quote_bps",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "bps" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        bps: 30,
        maxFee: "5000",
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      // 0.3% of 10,000,000 = 30,000, but maxFee is 5000
      expect(calculateBpsFee(quote, "10000000")).toBe(BigInt(5000));
    });

    test("calculateFee handles flat model", () => {
      const quote = {
        quoteId: "quote_flat",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "flat" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        flatFee: "1000",
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      expect(calculateFee(quote)).toBe(BigInt(1000));
      // Payment amount is irrelevant for flat fee
      expect(calculateFee(quote, "999999999")).toBe(BigInt(1000));
    });

    test("calculateFee handles bps model", () => {
      const quote = {
        quoteId: "quote_bps",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "bps" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        bps: 100, // 1%
        expiry: Math.floor(Date.now() / 1000) + 3600,
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      // Without payment amount, cannot calculate
      expect(calculateFee(quote)).toBeUndefined();

      // 1% of 50000 = 500
      expect(calculateFee(quote, "50000")).toBe(BigInt(500));
    });
  });

  describe("canonical quote payload", () => {
    test("getCanonicalQuotePayload produces deterministic output", () => {
      const quote = {
        quoteId: "quote_abc123",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "flat" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        flatFee: "1000",
        expiry: 1737400000,
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      const payload = getCanonicalQuotePayload(quote);

      // Should be valid JSON
      const parsed = JSON.parse(payload);
      expect(parsed.quoteId).toBe("quote_abc123");
      expect(parsed.facilitatorAddress).toBe(TEST_FACILITATOR_ADDRESS);
      expect(parsed.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      expect(parsed.flatFee).toBe("1000");
      expect(parsed.expiry).toBe(1737400000);
      expect(parsed.model).toBe("flat");

      // Should NOT include signature fields
      expect(parsed.signature).toBeUndefined();
      expect(parsed.signatureScheme).toBeUndefined();
    });

    test("getCanonicalQuotePayload excludes undefined fields", () => {
      const quote = {
        quoteId: "quote_bps",
        facilitatorAddress: TEST_FACILITATOR_ADDRESS,
        model: "bps" as const,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        bps: 30,
        expiry: 1737400000,
        signature: "0xabcdef",
        signatureScheme: "eip191" as const,
      };

      const payload = getCanonicalQuotePayload(quote);
      const parsed = JSON.parse(payload);

      expect(parsed.bps).toBe(30);
      expect(parsed.flatFee).toBeUndefined();
      expect(parsed.minFee).toBeUndefined();
      expect(parsed.maxFee).toBeUndefined();
    });
  });

  describe("settlement verification", () => {
    test("verifySettlementMatchesSelection validates matching selection", () => {
      const settlementInfo = {
        version: "1" as const,
        facilitatorFeePaid: "1000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        quoteId: "quote_abc123",
        facilitatorId: "https://x402.org/facilitator",
        model: "flat" as const,
      };

      const result = verifySettlementMatchesSelection(
        settlementInfo,
        "quote_abc123",
        "https://x402.org/facilitator",
      );

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("verifySettlementMatchesSelection detects quote ID mismatch", () => {
      const settlementInfo = {
        version: "1" as const,
        facilitatorFeePaid: "1000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        quoteId: "different_quote",
        facilitatorId: "https://x402.org/facilitator",
      };

      const result = verifySettlementMatchesSelection(
        settlementInfo,
        "quote_abc123",
        "https://x402.org/facilitator",
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Quote ID mismatch");
    });

    test("verifySettlementMatchesSelection detects facilitator ID mismatch", () => {
      const settlementInfo = {
        version: "1" as const,
        facilitatorFeePaid: "1000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        quoteId: "quote_abc123",
        facilitatorId: "https://other.facilitator.io",
      };

      const result = verifySettlementMatchesSelection(
        settlementInfo,
        "quote_abc123",
        "https://x402.org/facilitator",
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Facilitator ID mismatch");
    });
  });
});
