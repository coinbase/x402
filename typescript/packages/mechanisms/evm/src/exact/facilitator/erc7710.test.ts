import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyERC7710, settleERC7710 } from "./erc7710";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactERC7710Payload } from "../../types";
import { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import * as Errors from "./errors";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DELEGATION_MANAGER = "0x1234567890abcdef1234567890abcdef12345678" as const;
const DELEGATOR = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as const;
const PAY_TO = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C" as const;
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const NETWORK = "eip155:84532";
const TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" as const;

const validErc7710Payload: ExactERC7710Payload = {
  delegationManager: DELEGATION_MANAGER,
  permissionContext: "0xdeadbeef",
  delegator: DELEGATOR,
};

const validRequirements: PaymentRequirements = {
  scheme: "exact",
  network: NETWORK,
  amount: "10000",
  asset: ASSET,
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
  description: "Test payment",
  extra: {
    assetTransferMethod: "erc7710",
  },
};

const validPayload: PaymentPayload = {
  x402Version: 2,
  resource: {
    url: "https://api.example.com/data",
    description: "Test",
    mimeType: "application/json",
  },
  accepted: {
    scheme: "exact",
    network: NETWORK,
    amount: "10000",
    asset: ASSET,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
  },
  payload: validErc7710Payload,
};

// ---------------------------------------------------------------------------
// Mock signer factory
// ---------------------------------------------------------------------------

function makeSigner(overrides?: Partial<FacilitatorEvmSigner>): FacilitatorEvmSigner {
  return {
    getAddresses: vi.fn().mockReturnValue([PAY_TO]),
    readContract: vi.fn().mockResolvedValue(undefined), // simulation succeeds by default
    verifyTypedData: vi.fn().mockResolvedValue(true),
    writeContract: vi.fn().mockResolvedValue(TX_HASH),
    sendTransaction: vi.fn().mockResolvedValue(TX_HASH),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    getCode: vi.fn().mockResolvedValue("0x"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// verifyERC7710
// ---------------------------------------------------------------------------

describe("verifyERC7710", () => {
  it("returns valid when simulation succeeds", async () => {
    const signer = makeSigner();
    const result = await verifyERC7710(
      signer,
      validPayload,
      validRequirements,
      validErc7710Payload,
    );
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe(DELEGATOR);
  });

  it("returns invalid when scheme mismatches", async () => {
    const signer = makeSigner();
    const badPayload = { ...validPayload, accepted: { ...validPayload.accepted, scheme: "upto" } };
    const result = await verifyERC7710(
      signer,
      badPayload as any,
      validRequirements,
      validErc7710Payload,
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe(Errors.ErrInvalidScheme);
  });

  it("returns invalid when network mismatches", async () => {
    const signer = makeSigner();
    const badReqs = { ...validRequirements, network: "eip155:1" };
    const result = await verifyERC7710(signer, validPayload, badReqs, validErc7710Payload);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe(Errors.ErrNetworkMismatch);
  });

  it("returns invalid for non-address delegationManager", async () => {
    const signer = makeSigner();
    const badPayload = { ...validErc7710Payload, delegationManager: "not-an-address" as any };
    const result = await verifyERC7710(signer, validPayload, validRequirements, badPayload);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe(Errors.ErrERC7710InvalidDelegationManager);
  });

  it("returns invalid for non-address delegator", async () => {
    const signer = makeSigner();
    const badPayload = { ...validErc7710Payload, delegator: "not-an-address" as any };
    const result = await verifyERC7710(signer, validPayload, validRequirements, badPayload);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe(Errors.ErrERC7710InvalidDelegator);
  });

  it("returns invalid for empty permissionContext", async () => {
    const signer = makeSigner();
    const badPayload = { ...validErc7710Payload, permissionContext: "0x" as any };
    const result = await verifyERC7710(signer, validPayload, validRequirements, badPayload);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe(Errors.ErrERC7710InvalidPermissionContext);
  });

  it("returns invalid when simulation throws", async () => {
    const signer = makeSigner({
      readContract: vi.fn().mockRejectedValue(new Error("execution reverted")),
    });
    const result = await verifyERC7710(
      signer,
      validPayload,
      validRequirements,
      validErc7710Payload,
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe(Errors.ErrERC7710SimulationFailed);
  });

  it("calls redeemDelegations with correct args", async () => {
    const signer = makeSigner();
    await verifyERC7710(signer, validPayload, validRequirements, validErc7710Payload);
    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: DELEGATION_MANAGER,
        functionName: "redeemDelegations",
        args: [
          [validErc7710Payload.permissionContext],
          ["0x0000000000000000000000000000000000000000000000000000000000000000"],
          [expect.stringMatching(/^0x/)], // executionCalldata
        ],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// settleERC7710
// ---------------------------------------------------------------------------

describe("settleERC7710", () => {
  it("returns success on happy path", async () => {
    const signer = makeSigner();
    const result = await settleERC7710(
      signer,
      validPayload,
      validRequirements,
      validErc7710Payload,
    );
    expect(result.success).toBe(true);
    expect(result.transaction).toBe(TX_HASH);
    expect(result.payer).toBe(DELEGATOR);
  });

  it("returns failure when verify fails", async () => {
    const signer = makeSigner({
      readContract: vi.fn().mockRejectedValue(new Error("delegation revoked")),
    });
    const result = await settleERC7710(
      signer,
      validPayload,
      validRequirements,
      validErc7710Payload,
    );
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe(Errors.ErrERC7710SimulationFailed);
  });

  it("returns failure when writeContract throws", async () => {
    const signer = makeSigner({
      writeContract: vi.fn().mockRejectedValue(new Error("out of gas")),
    });
    const result = await settleERC7710(
      signer,
      validPayload,
      validRequirements,
      validErc7710Payload,
    );
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe(Errors.ErrERC7710RedeemFailed);
  });

  it("returns failure when receipt status is not success", async () => {
    const signer = makeSigner({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "reverted" }),
    });
    const result = await settleERC7710(
      signer,
      validPayload,
      validRequirements,
      validErc7710Payload,
    );
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe(Errors.ErrERC7710RedeemFailed);
    expect(result.transaction).toBe(TX_HASH);
  });

  it("calls redeemDelegations with correct args on settle", async () => {
    const signer = makeSigner();
    await settleERC7710(signer, validPayload, validRequirements, validErc7710Payload);
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: DELEGATION_MANAGER,
        functionName: "redeemDelegations",
      }),
    );
  });
});
