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
} from "../src/facilitator-fees";

describe("facilitator-fees extension", () => {
  describe("schemas", () => {
    test("FacilitatorFeeQuoteSchema accepts valid flat fee quote", () => {
      const quote = {
        quoteId: "quote_abc123",
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
        model: "flat",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        flatFee: "1000",
        expiry: 1737400000,
        signature: "0xabcdef",
        signatureScheme: "invalid",
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
});
