import { describe, it, expect } from "vitest";
import {
    VERIFY_ERROR_CODES,
    SETTLE_ERROR_CODES,
    getVerifyErrorMessage,
    getSettleErrorMessage,
} from "../../../src/errors";

describe("Error Codes and Messages", () => {
    describe("VERIFY_ERROR_CODES", () => {
        it("should have all expected error codes", () => {
            expect(VERIFY_ERROR_CODES.INVALID_SIGNATURE).toBe("INVALID_SIGNATURE");
            expect(VERIFY_ERROR_CODES.INSUFFICIENT_AMOUNT).toBe("INSUFFICIENT_AMOUNT");
            expect(VERIFY_ERROR_CODES.PAYMENT_EXPIRED).toBe("PAYMENT_EXPIRED");
            expect(VERIFY_ERROR_CODES.INVALID_NETWORK).toBe("INVALID_NETWORK");
            expect(VERIFY_ERROR_CODES.UNSUPPORTED_SCHEME).toBe("UNSUPPORTED_SCHEME");
            expect(VERIFY_ERROR_CODES.INVALID_ASSET).toBe("INVALID_ASSET");
            expect(VERIFY_ERROR_CODES.INVALID_PAYER).toBe("INVALID_PAYER");
            expect(VERIFY_ERROR_CODES.NONCE_ALREADY_USED).toBe("NONCE_ALREADY_USED");
            expect(VERIFY_ERROR_CODES.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
        });
    });

    describe("SETTLE_ERROR_CODES", () => {
        it("should have all expected error codes", () => {
            expect(SETTLE_ERROR_CODES.TRANSACTION_FAILED).toBe("TRANSACTION_FAILED");
            expect(SETTLE_ERROR_CODES.INSUFFICIENT_BALANCE).toBe("INSUFFICIENT_BALANCE");
            expect(SETTLE_ERROR_CODES.GAS_ESTIMATION_FAILED).toBe("GAS_ESTIMATION_FAILED");
            expect(SETTLE_ERROR_CODES.TRANSACTION_REVERTED).toBe("TRANSACTION_REVERTED");
            expect(SETTLE_ERROR_CODES.NETWORK_ERROR).toBe("NETWORK_ERROR");
            expect(SETTLE_ERROR_CODES.TIMEOUT).toBe("TIMEOUT");
            expect(SETTLE_ERROR_CODES.SERVICE_UNAVAILABLE).toBe("SERVICE_UNAVAILABLE");
        });
    });

    describe("getVerifyErrorMessage", () => {
        it("should return correct message for known error codes", () => {
            expect(getVerifyErrorMessage("INVALID_SIGNATURE")).toContain("signature");
            expect(getVerifyErrorMessage("INSUFFICIENT_AMOUNT")).toContain("amount");
            expect(getVerifyErrorMessage("PAYMENT_EXPIRED")).toContain("expired");
        });

        it("should return default message for unknown error codes", () => {
            expect(getVerifyErrorMessage("UNKNOWN_CODE")).toContain("unknown");
        });
    });

    describe("getSettleErrorMessage", () => {
        it("should return correct message for known error codes", () => {
            expect(getSettleErrorMessage("TRANSACTION_FAILED")).toContain("failed");
            expect(getSettleErrorMessage("INSUFFICIENT_BALANCE")).toContain("balance");
            expect(getSettleErrorMessage("TIMEOUT")).toContain("timed out");
        });

        it("should return default message for unknown error codes", () => {
            expect(getSettleErrorMessage("UNKNOWN_CODE")).toContain("unknown");
        });
    });
});
