import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  diagnoseEip3009SimulationFailure,
  simulateEip3009Transfer,
} from "../../../src/exact/facilitator/eip3009-utils";
import * as Errors from "../../../src/exact/facilitator/errors";
import type { FacilitatorEvmSigner } from "../../../src/signer";
import type { PaymentRequirements } from "@x402/core/types";
import type { ExactEIP3009Payload } from "../../../src/types";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PAYER = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" as `0x${string}`;
const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;

function makePayload(overrides?: Partial<ExactEIP3009Payload["authorization"]>): ExactEIP3009Payload {
  return {
    signature: "0x" + "ab".repeat(65), // 130 hex chars = ECDSA
    authorization: {
      from: PAYER,
      to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as `0x${string}`,
      value: "100000",
      validAfter: "0",
      validBefore: String(Date.now() + 3_600_000),
      nonce: "0x" + "0".repeat(64) as `0x${string}`,
      ...overrides,
    },
  };
}

function makeRequirements(extra?: Record<string, string>): PaymentRequirements {
  return {
    scheme: "exact",
    network: "eip155:8453",
    asset: TOKEN,
    amount: "100000",
    payTo: "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc" as `0x${string}`,
    maxTimeoutSeconds: 300,
    extra,
  };
}

function makeSigner(readContract = vi.fn()): FacilitatorEvmSigner {
  return {
    getAddresses: vi.fn().mockReturnValue([PAYER]),
    readContract,
    verifyTypedData: vi.fn(),
    writeContract: vi.fn(),
    sendTransaction: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getCode: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Mock the multicall module so each test can control its results independently.
// ---------------------------------------------------------------------------

vi.mock("../../../src/multicall", () => ({
  multicall: vi.fn(),
}));

import { multicall } from "../../../src/multicall";
const mockMulticall = vi.mocked(multicall);

// ---------------------------------------------------------------------------
// diagnoseEip3009SimulationFailure
// ---------------------------------------------------------------------------

describe("diagnoseEip3009SimulationFailure", () => {
  const payload = makePayload();
  const signer = makeSigner();

  beforeEach(() => {
    mockMulticall.mockReset();
  });

  it("returns ErrEip3009NotSupported when authorizationState call fails", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 1_000_000n },
      { status: "success", result: "USD Coin" },
      { status: "success", result: "2" },
      { status: "failure", error: new Error("revert") },
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements(),
      "100000",
    );

    expect(result).toMatchObject({
      isValid: false,
      invalidReason: Errors.ErrEip3009NotSupported,
      payer: PAYER,
    });
  });

  it("returns ErrEip3009NonceAlreadyUsed when authorizationState returns true", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 1_000_000n },
      { status: "success", result: "USD Coin" },
      { status: "success", result: "2" },
      { status: "success", result: true },
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements(),
      "100000",
    );

    expect(result).toMatchObject({
      isValid: false,
      invalidReason: Errors.ErrEip3009NonceAlreadyUsed,
      payer: PAYER,
    });
  });

  it("returns ErrEip3009TokenNameMismatch when token name differs from requirements.extra.name", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 1_000_000n },
      { status: "success", result: "WrappedUSD" }, // <-- wrong name
      { status: "success", result: "2" },
      { status: "success", result: false },
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements({ name: "USD Coin" }),
      "100000",
    );

    expect(result).toMatchObject({
      isValid: false,
      invalidReason: Errors.ErrEip3009TokenNameMismatch,
      payer: PAYER,
    });
  });

  it("does NOT return ErrEip3009TokenNameMismatch when requirements.extra.name is absent", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 1_000_000n },
      { status: "success", result: "WrappedUSD" },
      { status: "success", result: "2" },
      { status: "success", result: false },
    ]);

    // requirements has no extra.name → name mismatch path must be skipped
    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements(),
      "100000",
    );

    expect(result.invalidReason).not.toBe(Errors.ErrEip3009TokenNameMismatch);
  });

  it("returns ErrEip3009TokenVersionMismatch when token version differs from requirements.extra.version", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 1_000_000n },
      { status: "success", result: "USD Coin" },
      { status: "success", result: "1" }, // <-- wrong version
      { status: "success", result: false },
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements({ version: "2" }),
      "100000",
    );

    expect(result).toMatchObject({
      isValid: false,
      invalidReason: Errors.ErrEip3009TokenVersionMismatch,
      payer: PAYER,
    });
  });

  it("does NOT return ErrEip3009TokenVersionMismatch when requirements.extra.version is absent", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 1_000_000n },
      { status: "success", result: "USD Coin" },
      { status: "success", result: "99" },
      { status: "success", result: false },
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements(),
      "100000",
    );

    expect(result.invalidReason).not.toBe(Errors.ErrEip3009TokenVersionMismatch);
  });

  it("returns ErrEip3009InsufficientBalance when balance is below required amount", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 50_000n }, // less than 100000
      { status: "success", result: "USD Coin" },
      { status: "success", result: "2" },
      { status: "success", result: false },
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements(),
      "100000",
    );

    expect(result).toMatchObject({
      isValid: false,
      invalidReason: Errors.ErrEip3009InsufficientBalance,
      payer: PAYER,
    });
  });

  it("does NOT return ErrEip3009InsufficientBalance when balance exactly equals required amount", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 100_000n }, // exactly equal
      { status: "success", result: "USD Coin" },
      { status: "success", result: "2" },
      { status: "success", result: false },
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements(),
      "100000",
    );

    expect(result.invalidReason).not.toBe(Errors.ErrEip3009InsufficientBalance);
  });

  it("returns ErrEip3009SimulationFailed as fallback when balance call also fails", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "failure", error: new Error("revert balanceOf") },
      { status: "failure", error: new Error("revert name") },
      { status: "failure", error: new Error("revert version") },
      { status: "success", result: false }, // authState ok, nonce not used
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements(),
      "100000",
    );

    expect(result).toMatchObject({
      isValid: false,
      invalidReason: Errors.ErrEip3009SimulationFailed,
      payer: PAYER,
    });
  });

  it("returns ErrEip3009SimulationFailed when multicall itself throws", async () => {
    mockMulticall.mockRejectedValueOnce(new Error("RPC unreachable"));

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements(),
      "100000",
    );

    expect(result).toMatchObject({
      isValid: false,
      invalidReason: Errors.ErrEip3009SimulationFailed,
      payer: PAYER,
    });
  });

  it("prioritises authorizationState failure over name/version/balance checks", async () => {
    // authState is failure AND balance is low AND version mismatches — authState wins
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 1n },
      { status: "success", result: "WrappedUSD" },
      { status: "success", result: "99" },
      { status: "failure", error: new Error("revert") },
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements({ name: "USD Coin", version: "2" }),
      "100000",
    );

    expect(result.invalidReason).toBe(Errors.ErrEip3009NotSupported);
  });

  it("prioritises NonceAlreadyUsed over name mismatch", async () => {
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: 1_000_000n },
      { status: "success", result: "WrappedUSD" }, // name mismatch
      { status: "success", result: "2" },
      { status: "success", result: true }, // nonce used
    ]);

    const result = await diagnoseEip3009SimulationFailure(
      signer,
      TOKEN,
      payload,
      makeRequirements({ name: "USD Coin" }),
      "100000",
    );

    expect(result.invalidReason).toBe(Errors.ErrEip3009NonceAlreadyUsed);
  });
});

// ---------------------------------------------------------------------------
// simulateEip3009Transfer
// ---------------------------------------------------------------------------

// A valid 65-byte ECDSA signature: r (32 bytes 0xaa), s (32 bytes 0xbb), v=0x1b (27)
const VALID_ECDSA_SIG = ("0x" + "aa".repeat(32) + "bb".repeat(32) + "1b") as `0x${string}`;

describe("simulateEip3009Transfer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when readContract resolves without error (ECDSA path)", async () => {
    const readContract = vi.fn().mockResolvedValue(undefined);
    const signer = makeSigner(readContract);
    const payload = makePayload({ ...undefined });
    payload.signature = VALID_ECDSA_SIG;

    const result = await simulateEip3009Transfer(signer, TOKEN, payload);

    expect(result).toBe(true);
    expect(readContract).toHaveBeenCalledOnce();
  });

  it("returns false when readContract rejects (ECDSA path)", async () => {
    const readContract = vi.fn().mockRejectedValue(new Error("revert: expired"));
    const signer = makeSigner(readContract);
    const payload = makePayload();
    payload.signature = VALID_ECDSA_SIG;

    const result = await simulateEip3009Transfer(signer, TOKEN, payload);

    expect(result).toBe(false);
  });

  it("uses bytes-signature path for non-ECDSA signature length", async () => {
    const readContract = vi.fn().mockResolvedValue(undefined);
    const signer = makeSigner(readContract);
    // 132 hex chars = 66 bytes → not 65 bytes (ECDSA) → bytes path
    const payload: ExactEIP3009Payload = {
      ...makePayload(),
      signature: "0x" + "ab".repeat(66),
    };

    const result = await simulateEip3009Transfer(signer, TOKEN, payload);

    expect(result).toBe(true);
    // bytes path passes the raw sig directly
    const call = readContract.mock.calls[0][0];
    expect(call.args[call.args.length - 1]).toBe(payload.signature);
  });

  it("returns false for non-ECDSA signature when readContract rejects", async () => {
    const readContract = vi.fn().mockRejectedValue(new Error("invalid signature"));
    const signer = makeSigner(readContract);
    const payload: ExactEIP3009Payload = {
      ...makePayload(),
      signature: "0x" + "cd".repeat(66),
    };

    const result = await simulateEip3009Transfer(signer, TOKEN, payload);

    expect(result).toBe(false);
  });
});
