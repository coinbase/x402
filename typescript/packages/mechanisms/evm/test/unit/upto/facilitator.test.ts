import { describe, it, expect, beforeEach, vi } from "vitest";
import { UptoEvmScheme } from "../../../src/upto/facilitator/scheme";
import { verifyUptoPermit2, settleUptoPermit2 } from "../../../src/upto/facilitator/permit2";
import type { FacilitatorEvmSigner } from "../../../src/signer";
import { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { x402UptoPermit2ProxyAddress, PERMIT2_ADDRESS } from "../../../src/constants";
import {
  ErrUptoSettlementExceedsAmount,
  ErrPermit2AmountMismatch,
} from "../../../src/upto/facilitator/errors";
import type { UptoPermit2Payload } from "../../../src/types";

const now = () => Math.floor(Date.now() / 1000);

function makePermit2Payload(overrides?: Partial<UptoPermit2Payload>): UptoPermit2Payload {
  const base: UptoPermit2Payload = {
    signature: "0xmocksig" as `0x${string}`,
    permit2Authorization: {
      from: "0x1234567890123456789012345678901234567890",
      permitted: {
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "2000000",
      },
      spender: x402UptoPermit2ProxyAddress,
      nonce: "12345",
      deadline: (now() + 3600).toString(),
      witness: {
        to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        validAfter: (now() - 600).toString(),
      },
    },
  };
  return { ...base, ...overrides };
}

function makePayload(permit2?: UptoPermit2Payload, acceptedOverrides?: Record<string, unknown>): PaymentPayload {
  const p2 = permit2 ?? makePermit2Payload();
  return {
    x402Version: 2,
    accepted: { scheme: "upto", network: "eip155:8453", ...acceptedOverrides },
    payload: p2,
  } as PaymentPayload;
}

function makeRequirements(overrides?: Partial<PaymentRequirements>): PaymentRequirements {
  return {
    scheme: "upto",
    network: "eip155:8453",
    amount: "1000000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    maxTimeoutSeconds: 300,
    extra: { assetTransferMethod: "permit2" },
    ...overrides,
  };
}

describe("UptoEvmScheme (Facilitator)", () => {
  let mockSigner: FacilitatorEvmSigner;
  let scheme: UptoEvmScheme;

  beforeEach(() => {
    mockSigner = {
      getAddresses: () => ["0xfacilitator1234567890123456789012345678" as `0x${string}`],
      readContract: vi.fn().mockResolvedValue(BigInt("999999999999999999")),
      verifyTypedData: vi.fn().mockResolvedValue(true),
      writeContract: vi.fn().mockResolvedValue("0xtxhash1234" as `0x${string}`),
      sendTransaction: vi.fn(),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      getCode: vi.fn(),
    };
    scheme = new UptoEvmScheme(mockSigner);
  });

  describe("Construction", () => {
    it("should create instance with scheme=upto", () => {
      expect(scheme).toBeDefined();
      expect(scheme.scheme).toBe("upto");
    });
  });

  describe("verify", () => {
    it("should return isValid=true for a valid payload", async () => {
      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
      expect(mockSigner.verifyTypedData).toHaveBeenCalled();
    });

    it("should reject if scheme is not upto", async () => {
      const payload = makePayload(undefined, { scheme: "exact" });
      const requirements = makeRequirements({ scheme: "exact" as any });

      const result = await scheme.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_scheme");
    });

    it("should reject if network mismatches", async () => {
      const payload = makePayload(undefined, { network: "eip155:1" });
      const requirements = makeRequirements({ network: "eip155:8453" as any });

      const result = await scheme.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("network_mismatch");
    });

    it("should reject if spender is not x402UptoPermit2ProxyAddress", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.spender = "0x0000000000000000000000000000000000000001";
      const payload = makePayload(p2);

      const result = await scheme.verify(payload, makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_spender");
    });

    it("should reject if deadline is expired", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.deadline = "1";
      const payload = makePayload(p2);

      const result = await scheme.verify(payload, makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("permit2_deadline_expired");
    });

    it("should reject if validAfter is in the future", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.witness.validAfter = (now() + 3600).toString();
      const payload = makePayload(p2);

      const result = await scheme.verify(payload, makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("permit2_not_yet_valid");
    });

    it("should reject if token mismatches", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.token = "0x0000000000000000000000000000000000000099";
      const payload = makePayload(p2);

      const result = await scheme.verify(payload, makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("permit2_token_mismatch");
    });

    it("should reject if witness.to doesn't match payTo", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.witness.to = "0x0000000000000000000000000000000000000001";
      const payload = makePayload(p2);

      const result = await scheme.verify(payload, makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_recipient_mismatch");
    });

    it("should PASS when permitted.amount > requirements.amount (upto feature)", async () => {
      // permitted = 2000000, requirements = 1000000 → should pass
      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(true);
    });

    it("should FAIL when permitted.amount < requirements.amount", async () => {
      // permitted = 2000000, requirements = 5000000
      const requirements = makeRequirements({ amount: "5000000" });

      const result = await scheme.verify(makePayload(), requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrPermit2AmountMismatch);
    });

    it("should reject if signature is invalid", async () => {
      mockSigner.verifyTypedData = vi.fn().mockResolvedValue(false);

      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_signature");
    });

    it("should reject non-Permit2 payload via scheme wrapper with unsupported_payload_type", async () => {
      const payload: PaymentPayload = {
        x402Version: 2,
        accepted: { scheme: "upto", network: "eip155:8453" },
        payload: {
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            value: "1000000",
            validAfter: "0",
            validBefore: "999999999999",
            nonce: "0x00",
          },
          signature: "0x",
        },
      } as PaymentPayload;

      const result = await scheme.verify(payload, makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_payload_type");
    });
  });

  describe("settle", () => {
    it("should settle successfully and return tx hash", async () => {
      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhash1234");
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
      expect(mockSigner.writeContract).toHaveBeenCalled();
    });

    it("should return success with empty tx for zero settlement amount", async () => {
      const requirements = makeRequirements({ amount: "0" });

      const result = await scheme.settle(makePayload(), requirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("");
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("should succeed when settlement amount < permitted amount (upto core feature)", async () => {
      // permitted = 2000000, settlement = 1000000
      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhash1234");
      expect(mockSigner.writeContract).toHaveBeenCalled();

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.functionName).toBe("settle");
    });

    it("should fail when settlement exceeds permitted amount (caught by verify)", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.amount = "1000000";
      const payload = makePayload(p2);
      const requirements = makeRequirements({ amount: "2000000" });

      const result = await scheme.settle(payload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrPermit2AmountMismatch);
    });

    it("should reject non-Permit2 payload via scheme wrapper with unsupported_payload_type", async () => {
      const payload: PaymentPayload = {
        x402Version: 2,
        accepted: { scheme: "upto", network: "eip155:8453" },
        payload: {
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            value: "1000000",
            validAfter: "0",
            validBefore: "999999999999",
            nonce: "0x00",
          },
          signature: "0x",
        },
      } as PaymentPayload;

      const result = await scheme.settle(payload, makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("unsupported_payload_type");
    });
  });

  describe("settle error mapping", () => {
    it("should map Permit2612AmountMismatch revert", async () => {
      mockSigner.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("execution reverted: Permit2612AmountMismatch()"));

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("permit2_2612_amount_mismatch");
    });

    it("should map InvalidAmount revert", async () => {
      mockSigner.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("execution reverted: InvalidAmount()"));

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("permit2_invalid_amount");
    });

    it("should map InvalidNonce revert", async () => {
      mockSigner.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("execution reverted: InvalidNonce()"));

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("permit2_invalid_nonce");
    });
  });

  describe("direct function calls (verifyUptoPermit2 / settleUptoPermit2)", () => {
    it("verifyUptoPermit2 returns isValid=true for valid input", async () => {
      const p2 = makePermit2Payload();
      const result = await verifyUptoPermit2(
        mockSigner,
        makePayload(p2),
        makeRequirements(),
        p2,
      );

      expect(result.isValid).toBe(true);
    });

    it("settleUptoPermit2 returns success for zero amount", async () => {
      const p2 = makePermit2Payload();
      const result = await settleUptoPermit2(
        mockSigner,
        makePayload(p2),
        makeRequirements({ amount: "0" }),
        p2,
      );

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("");
      expect(result.amount).toBe("0");
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("settleUptoPermit2 rejects when settlement exceeds permitted (caught by verify)", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.amount = "500000";
      const result = await settleUptoPermit2(
        mockSigner,
        makePayload(p2),
        makeRequirements({ amount: "1000000" }),
        p2,
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrPermit2AmountMismatch);
    });
  });
});
