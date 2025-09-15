import { describe, it, expect, beforeEach, vi } from "vitest";
import { verifyMoveCall } from "./verify";
import { Transaction } from "@mysten/sui/transactions";
import { PaymentRequirements } from "../../../../types/verify";
import { getPackageId } from "../contract-config";
import { bcs } from "@mysten/sui/bcs";

// Helper functions using BCS for proper encoding

// Helper function to create a test transaction with the correct move call
/**
 * Creates a test transaction with the correct move call for testing purposes
 *
 * @param requirements - The payment requirements to create transaction for
 * @param overrides - Optional overrides for transaction parameters
 * @param overrides.amount - Override amount value
 * @param overrides.recipient - Override recipient address
 * @param overrides.nonce - Override nonce value
 * @param overrides.coinType - Override coin type
 * @returns Transaction object configured for testing
 */
function createTestTransaction(
  requirements: PaymentRequirements,
  overrides?: {
    amount?: string;
    recipient?: string;
    nonce?: string;
    coinType?: string;
  },
): Transaction {
  const tx = new Transaction();
  tx.setSender("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

  const packageId = getPackageId(requirements.network);
  const amount = overrides?.amount ?? requirements.maxAmountRequired;
  const recipient = overrides?.recipient ?? requirements.payTo;
  const nonce = overrides?.nonce ?? requirements.extra?.nonce ?? "";
  const coinType = overrides?.coinType ?? requirements.asset;

  // Create mock coin object reference
  const coinObjectRef = tx.object(
    "0x1111111111111111111111111111111111111111111111111111111111111111",
  );

  // Use BCS to encode arguments properly
  const nonceBytes = new TextEncoder().encode(nonce);

  // Add the move call
  tx.moveCall({
    target: `${packageId}::payments::make_payment`,
    arguments: [
      coinObjectRef,
      tx.pure(bcs.u64().serialize(BigInt(amount))),
      tx.pure(bcs.Address.serialize(recipient)),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(nonceBytes))),
    ],
    typeArguments: [coinType],
  });

  return tx;
}

describe("Sui Facilitator Verify", () => {
  let paymentRequirements: PaymentRequirements;
  let validTransaction: Transaction;

  beforeEach(() => {
    // Mock SuiClient for potential future use
    vi.fn();

    // Set up payment requirements
    paymentRequirements = {
      scheme: "exact",
      network: "sui-testnet",
      maxAmountRequired: "1000000",
      resource: "https://example.com/resource",
      description: "Test payment",
      mimeType: "application/json",
      payTo: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      maxTimeoutSeconds: 600,
      asset: "0x2::sui::SUI",
      extra: {
        nonce: "test-nonce-123",
      },
    };

    // Create a valid transaction using direct move call
    validTransaction = createTestTransaction(paymentRequirements);
  });

  describe("verifyMoveCall", () => {
    it("should verify a valid move call to the payment contract", () => {
      expect(() => verifyMoveCall(validTransaction, paymentRequirements)).not.toThrow();
    });

    it("should throw if move call is not found", () => {
      const emptyTx = new Transaction();
      emptyTx.setSender("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

      expect(() => verifyMoveCall(emptyTx, paymentRequirements)).toThrow(
        "invalid_exact_sui_payload_move_call_not_found",
      );
    });

    it("should throw if coin type doesn't match", () => {
      const wrongCoinTx = createTestTransaction(paymentRequirements, {
        coinType: "0x1::some::OTHER_COIN", // Wrong type argument
      });

      expect(() => verifyMoveCall(wrongCoinTx, paymentRequirements)).toThrow(
        "invalid_exact_sui_payload_incorrect_coin_type",
      );
    });

    it("should throw if amount doesn't match", () => {
      const wrongAmountTx = createTestTransaction(paymentRequirements, {
        amount: "500000", // Wrong amount
      });

      expect(() => verifyMoveCall(wrongAmountTx, paymentRequirements)).toThrow(
        "invalid_exact_sui_payload_amount_mismatch",
      );
    });

    it("should throw if recipient doesn't match", () => {
      const wrongRecipientTx = createTestTransaction(paymentRequirements, {
        recipient: "0x9999999999999999999999999999999999999999999999999999999999999999", // Wrong recipient
      });

      expect(() => verifyMoveCall(wrongRecipientTx, paymentRequirements)).toThrow(
        "invalid_exact_sui_payload_incorrect_recipient",
      );
    });

    it("should throw if nonce doesn't match", () => {
      const wrongNonceTx = createTestTransaction(paymentRequirements, {
        nonce: "wrong-nonce", // Wrong nonce
      });

      expect(() => verifyMoveCall(wrongNonceTx, paymentRequirements)).toThrow(
        "invalid_exact_sui_payload_incorrect_nonce",
      );
    });

    it("should handle empty nonce correctly", () => {
      const noNonceRequirements = { ...paymentRequirements };
      delete noNonceRequirements.extra;

      const noNonceTx = createTestTransaction(noNonceRequirements, {
        nonce: "", // Empty nonce
      });

      expect(() => verifyMoveCall(noNonceTx, noNonceRequirements)).not.toThrow();
    });

    it("should verify with different networks", () => {
      const mainnetRequirements = { ...paymentRequirements, network: "sui" as const };

      const mainnetTx = createTestTransaction(mainnetRequirements);

      expect(() => verifyMoveCall(mainnetTx, mainnetRequirements)).not.toThrow();
    });
  });

  describe("nonce handling in verifyMoveCall", () => {
    it("should accept empty nonce when requirements have no nonce", () => {
      const noNonceRequirements = { ...paymentRequirements };
      delete noNonceRequirements.extra;

      const emptyNonceTx = createTestTransaction(noNonceRequirements);

      expect(() => verifyMoveCall(emptyNonceTx, noNonceRequirements)).not.toThrow();
    });

    it("should reject non-empty nonce when requirements expect empty nonce", () => {
      const noNonceRequirements = { ...paymentRequirements };
      delete noNonceRequirements.extra;

      const nonEmptyNonceTx = createTestTransaction(noNonceRequirements, {
        nonce: "some-nonce",
      });

      expect(() => verifyMoveCall(nonEmptyNonceTx, noNonceRequirements)).toThrow(
        "invalid_exact_sui_payload_incorrect_nonce",
      );
    });
  });
});
