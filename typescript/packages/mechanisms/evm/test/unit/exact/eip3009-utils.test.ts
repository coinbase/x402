import { describe, it, expect } from "vitest";
import { parseEip3009TransferError } from "../../../src/exact/facilitator/eip3009-utils";
import * as Errors from "../../../src/exact/facilitator/errors";

describe("parseEip3009TransferError", () => {
  describe("authorization expired / valid before", () => {
    it("matches 'authorization expired'", () => {
      expect(parseEip3009TransferError(new Error("authorization expired"))).toBe(
        Errors.ErrValidBeforeExpired,
      );
    });

    it("matches 'authorization valid before exceeded'", () => {
      expect(parseEip3009TransferError(new Error("authorization valid before exceeded"))).toBe(
        Errors.ErrValidBeforeExpired,
      );
    });

    it("matches 'AuthorizationExpired' revert string", () => {
      expect(parseEip3009TransferError(new Error("AuthorizationExpired()"))).toBe(
        Errors.ErrValidBeforeExpired,
      );
    });

    it("is case-insensitive", () => {
      expect(parseEip3009TransferError(new Error("Authorization Expired"))).toBe(
        Errors.ErrValidBeforeExpired,
      );
    });
  });

  describe("authorization not yet valid", () => {
    it("matches 'authorization not valid'", () => {
      expect(parseEip3009TransferError(new Error("authorization not valid"))).toBe(
        Errors.ErrValidAfterInFuture,
      );
    });

    it("matches 'AuthorizationNotYetValid' revert string", () => {
      expect(parseEip3009TransferError(new Error("AuthorizationNotYetValid()"))).toBe(
        Errors.ErrValidAfterInFuture,
      );
    });
  });

  describe("nonce already used", () => {
    it("matches 'authorization used'", () => {
      expect(parseEip3009TransferError(new Error("authorization used"))).toBe(
        Errors.ErrEip3009NonceAlreadyUsed,
      );
    });

    it("matches 'AuthorizationAlreadyUsed' revert string", () => {
      expect(parseEip3009TransferError(new Error("AuthorizationAlreadyUsed()"))).toBe(
        Errors.ErrEip3009NonceAlreadyUsed,
      );
    });

    it("matches 'AuthorizationUsedOrCanceled' revert string", () => {
      expect(parseEip3009TransferError(new Error("AuthorizationUsedOrCanceled()"))).toBe(
        Errors.ErrEip3009NonceAlreadyUsed,
      );
    });
  });

  describe("insufficient balance", () => {
    it("matches 'transfer amount exceeds balance'", () => {
      expect(parseEip3009TransferError(new Error("transfer amount exceeds balance"))).toBe(
        Errors.ErrEip3009InsufficientBalance,
      );
    });

    it("matches 'insufficient balance'", () => {
      expect(parseEip3009TransferError(new Error("insufficient balance for transfer"))).toBe(
        Errors.ErrEip3009InsufficientBalance,
      );
    });

    it("matches 'ERC20InsufficientBalance' revert string", () => {
      expect(parseEip3009TransferError(new Error("ERC20InsufficientBalance()"))).toBe(
        Errors.ErrEip3009InsufficientBalance,
      );
    });
  });

  describe("invalid signature", () => {
    it("matches 'invalid signature'", () => {
      expect(parseEip3009TransferError(new Error("invalid signature"))).toBe(
        Errors.ErrInvalidSignature,
      );
    });

    it("matches 'SignerMismatch' revert string", () => {
      expect(parseEip3009TransferError(new Error("SignerMismatch()"))).toBe(
        Errors.ErrInvalidSignature,
      );
    });

    it("matches 'InvalidSignatureV' revert string", () => {
      expect(parseEip3009TransferError(new Error("InvalidSignatureV()"))).toBe(
        Errors.ErrInvalidSignature,
      );
    });

    it("matches 'InvalidSignatureS' revert string", () => {
      expect(parseEip3009TransferError(new Error("InvalidSignatureS()"))).toBe(
        Errors.ErrInvalidSignature,
      );
    });
  });

  describe("fallback", () => {
    it("returns ErrTransactionFailed for unknown errors", () => {
      expect(parseEip3009TransferError(new Error("some unknown revert"))).toBe(
        Errors.ErrTransactionFailed,
      );
    });

    it("handles non-Error objects (strings)", () => {
      expect(parseEip3009TransferError("authorization expired")).toBe(Errors.ErrValidBeforeExpired);
    });

    it("handles non-Error objects (unknown type)", () => {
      expect(parseEip3009TransferError({ code: 42 })).toBe(Errors.ErrTransactionFailed);
    });
  });
});
