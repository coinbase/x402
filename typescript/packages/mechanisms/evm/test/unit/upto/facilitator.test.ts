import { describe, it, expect, beforeEach, vi } from "vitest";
import { UptoEvmScheme } from "../../../src/upto/facilitator/scheme";
import { verifyUptoPermit2, settleUptoPermit2 } from "../../../src/upto/facilitator/permit2";
import { verifyUptoEIP3009 } from "../../../src/upto/facilitator/eip3009";
import { createUptoEIP3009Nonce } from "../../../src/upto/client/eip3009";
import type { FacilitatorEvmSigner } from "../../../src/signer";
import { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  InMemoryPendingSettlementStore,
  type PendingSettlementStore,
} from "@x402/core/facilitator";
import { getAddress } from "viem";
import { x402UptoErc3009ProxyAddress, x402UptoPermit2ProxyAddress } from "../../../src/constants";
import {
  ErrPermit2AmountMismatch,
  ErrUptoAmountExceedsPermitted,
  ErrUptoFacilitatorMismatch,
  ErrUptoSettlementExceedsAmount,
  ErrUptoUnauthorizedFacilitator,
  ErrUptoInvalidScheme,
  ErrUptoNetworkMismatch,
  ErrUptoTransactionFailed,
  ErrUptoEip3009AmountMismatch,
  ErrUptoEip3009InsufficientBalance,
  ErrUptoEip3009NonceAlreadyUsed,
  ErrUptoEip3009NonceMismatch,
  ErrUptoEip3009ReceiverMismatch,
  ErrUptoEip3009RecipientMismatch,
  ErrUptoEip3009SettlerMismatch,
  ErrUptoEip3009SimulationFailed,
  ErrUptoInvalidPayload,
  ErrUptoPendingMismatch,
} from "../../../src/upto/facilitator/errors";
import {
  ErrErc20ApprovalBroadcastFailed,
  ErrSettlementPending,
} from "../../../src/exact/facilitator/errors";
import type { UptoEIP3009Payload, UptoPermit2Payload } from "../../../src/types";
import { ERC20_APPROVAL_GAS_SPONSORING_KEY } from "../../../src/upto/extensions";
import { resetAssetContractCache } from "../../../src/assetCache";

vi.mock("viem", async importOriginal => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    parseTransaction: vi.fn(),
    recoverTransactionAddress: vi.fn(),
  };
});

const FACILITATOR_ADDRESS = "0xFAC11174700123456789012345678901234aBCDe" as `0x${string}`;

// Settle validates the broadcast hash before waiting on it, so mocks must return a well-formed one.
const MOCK_TX_HASH = ("0x" + "12".repeat(32)) as `0x${string}`;

const now = () => Math.floor(Date.now() / 1000);

function makePermit2Payload(overrides?: Partial<UptoPermit2Payload>): UptoPermit2Payload {
  const base: UptoPermit2Payload = {
    signature: "0xmocksig" as `0x${string}`,
    permit2Authorization: {
      from: "0x1234567890123456789012345678901234567890",
      permitted: {
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "1000000",
      },
      spender: x402UptoPermit2ProxyAddress,
      nonce: "12345",
      deadline: (now() + 3600).toString(),
      witness: {
        to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        facilitator: FACILITATOR_ADDRESS,
        validAfter: (now() - 600).toString(),
      },
    },
  };
  return { ...base, ...overrides };
}

function makePayload(
  permit2?: UptoPermit2Payload,
  acceptedOverrides?: Record<string, unknown>,
): PaymentPayload {
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
    extra: { assetTransferMethod: "permit2", facilitatorAddress: FACILITATOR_ADDRESS },
    ...overrides,
  };
}

function makeEIP3009Requirements(overrides?: Partial<PaymentRequirements>): PaymentRequirements {
  return makeRequirements({
    extra: {
      assetTransferMethod: "eip3009",
      name: "USD Coin",
      version: "2",
      settlerAddress: FACILITATOR_ADDRESS,
    },
    ...overrides,
  });
}

function makeEIP3009Payload(overrides?: Partial<UptoEIP3009Payload>): UptoEIP3009Payload {
  const payTo = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" as `0x${string}`;
  const salt = ("0x" + "33".repeat(32)) as `0x${string}`;
  const paymentInfo = {
    payTo,
    settler: FACILITATOR_ADDRESS,
    salt,
  };
  const base: UptoEIP3009Payload = {
    signature: ("0x" + "ab".repeat(65)) as `0x${string}`,
    authorization: {
      from: "0x1234567890123456789012345678901234567890",
      to: x402UptoErc3009ProxyAddress,
      value: "1000000",
      validAfter: "0",
      validBefore: (now() + 3600).toString(),
      nonce: createUptoEIP3009Nonce(payTo, FACILITATOR_ADDRESS, salt),
    },
    paymentInfo,
  };
  return { ...base, ...overrides };
}

function makeEIP3009PaymentPayload(eip3009 = makeEIP3009Payload()): PaymentPayload {
  return {
    x402Version: 2,
    accepted: { scheme: "upto", network: "eip155:8453" },
    payload: eip3009,
  } as PaymentPayload;
}

function makeFailingPendingStore(shouldFail: (key: string) => boolean) {
  const entries = new Map<string, string>();
  const store: PendingSettlementStore = {
    get: async key => entries.get(key),
    set: async (key, value) => {
      if (shouldFail(key)) throw new Error("injected persistence failure");
      entries.set(key, value);
    },
    delete: async key => {
      entries.delete(key);
    },
  };
  return { store, entries };
}

// Returns deployed-contract bytecode for the token/asset address, EOA ("0x") for everything else.
// Used in payer-is-EOA tests where the token contract must still appear deployed.
const mockGetCodeEOAPayer =
  (assetAddress: string) =>
  ({ address }: { address: `0x${string}` }): Promise<`0x${string}`> =>
    Promise.resolve(
      address.toLowerCase() === assetAddress.toLowerCase()
        ? ("0x6080604052" as `0x${string}`)
        : ("0x" as `0x${string}`),
    );

// Wraps a per-test readContract impl so isValidSignature returns the ERC-1271
// magic value. The strict signature primitive added in the 7702 fix calls
// readContract for ERC-1271 verification; this helper preserves the previous
// "default: signature accepted" semantics for tests that mock readContract for
// other purposes (allowance, nonce, multicall).
const sigValid = "0x1626ba7e";
function rcWithSig(
  impl: unknown | ((args: { address?: string; functionName?: string }) => unknown),
  sigResponse: string = sigValid,
) {
  return vi.fn().mockImplementation(async (args: { address?: string; functionName?: string }) => {
    if (args?.functionName === "isValidSignature") return sigResponse;
    if (typeof impl === "function") {
      return (impl as (a: typeof args) => unknown)(args);
    }
    return impl;
  });
}

describe("UptoEvmScheme (Facilitator)", () => {
  let mockSigner: FacilitatorEvmSigner;
  let scheme: UptoEvmScheme;

  beforeEach(() => {
    resetAssetContractCache();

    mockSigner = {
      getAddresses: () => [FACILITATOR_ADDRESS],
      readContract: rcWithSig(BigInt("999999999999999999")),
      verifyTypedData: vi.fn().mockResolvedValue(true),
      writeContract: vi.fn().mockResolvedValue(MOCK_TX_HASH),
      sendTransaction: vi.fn(),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      // Default: asset is a deployed contract. Tests that need an EOA payer
      // should use mockGetCodeEOAPayer() to keep the asset as a contract.
      getCode: vi.fn().mockResolvedValue("0x6080604052"),
    };
    scheme = new UptoEvmScheme(mockSigner);
  });

  describe("Construction", () => {
    it("should create instance with scheme=upto", () => {
      expect(scheme).toBeDefined();
      expect(scheme.scheme).toBe("upto");
    });
  });

  describe("getExtra", () => {
    it("should return facilitatorAddress from signer", () => {
      const extra = scheme.getExtra("eip155:8453");
      expect(extra).toEqual({
        facilitatorAddress: FACILITATOR_ADDRESS,
        settlerAddress: FACILITATOR_ADDRESS,
      });
    });
  });

  describe("ERC-3009 verify", () => {
    beforeEach(() => {
      mockSigner.readContract = vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === "isValidSignature") return Promise.resolve(sigValid);
        if (functionName === "balanceOf") return Promise.resolve(10_000_000n);
        if (functionName === "authorizationState") return Promise.resolve(false);
        if (functionName === "settle") return Promise.resolve(undefined);
        return Promise.resolve(undefined);
      });
    });

    it("verifies ReceiveWithAuthorization and simulates the proxy with the maximum", async () => {
      const eip3009 = makeEIP3009Payload();
      const result = await verifyUptoEIP3009(
        mockSigner,
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements(),
        eip3009,
      );

      expect(result.isValid).toBe(true);
      expect(mockSigner.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: x402UptoErc3009ProxyAddress,
          functionName: "settle",
          account: FACILITATOR_ADDRESS,
          args: expect.arrayContaining([1_000_000n]),
        }),
      );
      expect(mockSigner.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "isValidSignature" }),
      );
    });

    it.each([
      [
        "canonical receiver",
        (payload: UptoEIP3009Payload) => {
          payload.authorization.to = "0x0000000000000000000000000000000000000001";
        },
        ErrUptoEip3009ReceiverMismatch,
      ],
      [
        "maximum amount",
        (payload: UptoEIP3009Payload) => {
          payload.authorization.value = "999999";
        },
        ErrUptoEip3009AmountMismatch,
      ],
      [
        "recipient",
        (payload: UptoEIP3009Payload) => {
          payload.paymentInfo.payTo = "0x0000000000000000000000000000000000000001";
        },
        ErrUptoEip3009RecipientMismatch,
      ],
      [
        "nonce commitment",
        (payload: UptoEIP3009Payload) => {
          payload.authorization.nonce = ("0x" + "00".repeat(32)) as `0x${string}`;
        },
        ErrUptoEip3009NonceMismatch,
      ],
    ])("rejects an invalid %s", async (_name, mutate, expectedReason) => {
      const eip3009 = makeEIP3009Payload();
      mutate(eip3009);

      const result = await scheme.verify(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements(),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(expectedReason);
    });

    it("requires the bound settler to match requirements and signer membership", async () => {
      const eip3009 = makeEIP3009Payload();
      const result = await scheme.verify(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements({
          extra: {
            assetTransferMethod: "eip3009",
            name: "USD Coin",
            version: "2",
            settlerAddress: "0x0000000000000000000000000000000000000001",
          },
        }),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrUptoEip3009SettlerMismatch);
    });

    it("rejects a bound settler that the facilitator signer does not own", async () => {
      mockSigner.getAddresses = () => ["0x0000000000000000000000000000000000000001"];
      const eip3009 = makeEIP3009Payload();

      const result = await scheme.verify(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements(),
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrUptoEip3009SettlerMismatch);
    });

    it("requires the full maximum balance", async () => {
      mockSigner.readContract = vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === "isValidSignature") return Promise.resolve(sigValid);
        if (functionName === "balanceOf") return Promise.resolve(999_999n);
        if (functionName === "authorizationState") return Promise.resolve(false);
        return Promise.resolve(undefined);
      });

      const result = await scheme.verify(makeEIP3009PaymentPayload(), makeEIP3009Requirements());

      expect(result.invalidReason).toBe(ErrUptoEip3009InsufficientBalance);
    });

    it("rejects an already-used authorization", async () => {
      mockSigner.readContract = vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === "isValidSignature") return Promise.resolve(sigValid);
        if (functionName === "balanceOf") return Promise.resolve(10_000_000n);
        if (functionName === "authorizationState") return Promise.resolve(true);
        return Promise.resolve(undefined);
      });

      const result = await scheme.verify(makeEIP3009PaymentPayload(), makeEIP3009Requirements());

      expect(result.invalidReason).toBe(ErrUptoEip3009NonceAlreadyUsed);
    });

    it("strictly rejects a mixed ERC-3009 and Permit2 payload", async () => {
      const mixed = {
        ...makeEIP3009Payload(),
        permit2Authorization: makePermit2Payload().permit2Authorization,
      };

      const result = await scheme.verify(
        { ...makeEIP3009PaymentPayload(), payload: mixed } as PaymentPayload,
        makeEIP3009Requirements(),
      );

      expect(result.invalidReason).toBe("unsupported_payload_type");
    });

    it.each([undefined, "permit2", "EIP3009"])(
      "requires assetTransferMethod=eip3009 (received %s)",
      async assetTransferMethod => {
        const requirements = makeEIP3009Requirements();
        if (assetTransferMethod === undefined) {
          delete requirements.extra!.assetTransferMethod;
        } else {
          requirements.extra!.assetTransferMethod = assetTransferMethod;
        }

        const result = await scheme.verify(makeEIP3009PaymentPayload(), requirements);

        expect(result).toEqual(
          expect.objectContaining({
            isValid: false,
            invalidReason: ErrUptoInvalidPayload,
          }),
        );
      },
    );

    it.each([
      [
        "payer address",
        (payload: UptoEIP3009Payload, _requirements: PaymentRequirements) => {
          payload.authorization.from = "not-an-address" as `0x${string}`;
        },
      ],
      [
        "authorization value",
        (payload: UptoEIP3009Payload, _requirements: PaymentRequirements) => {
          payload.authorization.value = "1.5";
        },
      ],
      [
        "validAfter",
        (payload: UptoEIP3009Payload, _requirements: PaymentRequirements) => {
          payload.authorization.validAfter = "not-an-integer";
        },
      ],
      [
        "payTo address",
        (payload: UptoEIP3009Payload, _requirements: PaymentRequirements) => {
          payload.paymentInfo.payTo = "not-an-address" as `0x${string}`;
        },
      ],
      [
        "settler address",
        (payload: UptoEIP3009Payload, _requirements: PaymentRequirements) => {
          payload.paymentInfo.settler = "not-an-address" as `0x${string}`;
        },
      ],
      [
        "asset address",
        (_payload: UptoEIP3009Payload, requirements: PaymentRequirements) => {
          requirements.asset = "not-an-address";
        },
      ],
      [
        "maximum amount",
        (_payload: UptoEIP3009Payload, requirements: PaymentRequirements) => {
          requirements.amount = "not-an-integer";
        },
      ],
      [
        "required settler address",
        (_payload: UptoEIP3009Payload, requirements: PaymentRequirements) => {
          requirements.extra!.settlerAddress = "not-an-address";
        },
      ],
    ])("returns an invalid response for malformed %s", async (_name, mutate) => {
      const eip3009 = makeEIP3009Payload();
      const requirements = makeEIP3009Requirements();
      mutate(eip3009, requirements);

      const result = await scheme.verify(makeEIP3009PaymentPayload(eip3009), requirements);

      expect(result).toEqual(
        expect.objectContaining({
          isValid: false,
          invalidReason: ErrUptoInvalidPayload,
        }),
      );
    });
  });

  describe("ERC-3009 settle", () => {
    beforeEach(() => {
      mockSigner.readContract = vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === "isValidSignature") return Promise.resolve(sigValid);
        if (functionName === "balanceOf") return Promise.resolve(10_000_000n);
        if (functionName === "authorizationState") return Promise.resolve(false);
        if (functionName === "settle") return Promise.resolve(undefined);
        return Promise.resolve(undefined);
      });
    });

    it("re-verifies the maximum, simulates the actual amount, and writes the actual amount", async () => {
      const eip3009 = makeEIP3009Payload();
      const result = await scheme.settle(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements({ amount: "400000" }),
      );

      expect(result.success).toBe(true);
      expect(result.amount).toBe("400000");
      expect(mockSigner.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: x402UptoErc3009ProxyAddress,
          functionName: "settle",
          args: expect.arrayContaining([400_000n]),
        }),
      );
      expect(mockSigner.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: x402UptoErc3009ProxyAddress,
          functionName: "settle",
          args: expect.arrayContaining([400_000n]),
          account: getAddress(eip3009.paymentInfo.settler),
        }),
      );
    });

    it("rejects settlement when the actual-amount simulation fails", async () => {
      const eip3009 = makeEIP3009Payload();
      mockSigner.readContract = vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === "isValidSignature") return Promise.resolve(sigValid);
        if (functionName === "balanceOf") return Promise.resolve(10_000_000n);
        if (functionName === "authorizationState") return Promise.resolve(false);
        if (functionName === "settle") return Promise.reject(new Error("refund blocked"));
        return Promise.resolve(undefined);
      });

      const result = await scheme.settle(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements({ amount: "400000" }),
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrUptoEip3009SimulationFailed);
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("returns an invalid response for a malformed settlement amount", async () => {
      const result = await scheme.settle(
        makeEIP3009PaymentPayload(),
        makeEIP3009Requirements({ amount: "not-an-integer" }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          errorReason: ErrUptoInvalidPayload,
        }),
      );
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("skips the transaction for a zero settlement", async () => {
      const eip3009 = makeEIP3009Payload();
      const result = await scheme.settle(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements({ amount: "0" }),
      );

      expect(result).toEqual(
        expect.objectContaining({ success: true, transaction: "", amount: "0" }),
      );
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("rejects an actual amount above the signed maximum", async () => {
      const eip3009 = makeEIP3009Payload();
      const result = await scheme.settle(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements({ amount: "1000001" }),
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrUptoSettlementExceedsAmount);
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("rejects a multi-address signer without sender-selecting writes", async () => {
      mockSigner.getAddresses = () => [
        FACILITATOR_ADDRESS,
        "0x0000000000000000000000000000000000000002",
      ];

      const result = await scheme.settle(
        makeEIP3009PaymentPayload(),
        makeEIP3009Requirements({ amount: "400000" }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          errorReason: ErrUptoEip3009SettlerMismatch,
        }),
      );
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("selects the bound settler when multi-address writes are supported", async () => {
      mockSigner.getAddresses = () => [
        FACILITATOR_ADDRESS,
        "0x0000000000000000000000000000000000000002",
      ];
      mockSigner.writeContractFrom = vi.fn().mockResolvedValue(MOCK_TX_HASH);

      const result = await scheme.settle(
        makeEIP3009PaymentPayload(),
        makeEIP3009Requirements({ amount: "400000" }),
      );

      expect(result.success).toBe(true);
      expect(mockSigner.writeContractFrom).toHaveBeenCalledWith(
        FACILITATOR_ADDRESS,
        expect.objectContaining({
          address: x402UptoErc3009ProxyAddress,
          functionName: "settle",
        }),
      );
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("stores one atomic record and preserves it while the receipt is pending", async () => {
      const eip3009 = makeEIP3009Payload();
      const store = new InMemoryPendingSettlementStore();
      const pendingScheme = new UptoEvmScheme(mockSigner, { pendingSettlementStore: store });
      mockSigner.waitForTransactionReceipt = vi
        .fn()
        .mockRejectedValue(new Error("receipt timeout"));

      const result = await pendingScheme.settle(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements({ amount: "400000" }),
      );

      expect(result.errorReason).toBe(ErrSettlementPending);
      expect(JSON.parse((await store.get(eip3009.signature))!)).toEqual({
        txHash: MOCK_TX_HASH,
        network: "eip155:8453",
        acceptedNetwork: "eip155:8453",
        amount: "400000",
        payer: eip3009.authorization.from,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: getAddress(eip3009.paymentInfo.payTo),
        requiredPayTo: getAddress(eip3009.paymentInfo.payTo),
        nonce: eip3009.authorization.nonce,
      });
    });

    it("does not broadcast when reading pending state fails", async () => {
      const store: PendingSettlementStore = {
        get: async () => {
          throw new Error("injected read failure");
        },
        set: async () => undefined,
        delete: async () => undefined,
      };
      const pendingScheme = new UptoEvmScheme(mockSigner, { pendingSettlementStore: store });

      const result = await pendingScheme.settle(
        makeEIP3009PaymentPayload(),
        makeEIP3009Requirements({ amount: "400000" }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          errorReason: ErrUptoTransactionFailed,
          transaction: "",
          errorMessage: expect.stringContaining("injected read failure"),
        }),
      );
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("does not broadcast when the atomic pending record is malformed", async () => {
      const store = new InMemoryPendingSettlementStore();
      const eip3009 = makeEIP3009Payload();
      await store.set(eip3009.signature, "{not-json");
      const pendingScheme = new UptoEvmScheme(mockSigner, { pendingSettlementStore: store });

      const result = await pendingScheme.settle(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements({ amount: "400000" }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          errorReason: ErrUptoPendingMismatch,
          transaction: "",
        }),
      );
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
      expect(await store.get(eip3009.signature)).toBe("{not-json");
    });

    it("returns a non-retryable manual-reconciliation response when atomic persistence fails", async () => {
      const eip3009 = makeEIP3009Payload();
      const { store, entries } = makeFailingPendingStore(() => true);
      const pendingScheme = new UptoEvmScheme(mockSigner, { pendingSettlementStore: store });
      mockSigner.waitForTransactionReceipt = vi
        .fn()
        .mockRejectedValue(new Error("receipt timeout"));

      const result = await pendingScheme.settle(
        makeEIP3009PaymentPayload(eip3009),
        makeEIP3009Requirements({ amount: "400000" }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          errorReason: ErrUptoTransactionFailed,
          errorMessage: expect.stringMatching(/settlement_pending.*manual reconciliation required/),
          transaction: MOCK_TX_HASH,
          network: "eip155:8453",
          payer: eip3009.authorization.from,
          amount: "400000",
        }),
      );
      expect(entries.size).toBe(0);
      expect(mockSigner.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: MOCK_TX_HASH });
    });

    it.each([
      [
        "amount",
        (_payload: PaymentPayload, requirements: PaymentRequirements) => {
          requirements.amount = "300000";
        },
      ],
      [
        "network and accepted network",
        (payload: PaymentPayload, requirements: PaymentRequirements) => {
          payload.accepted.network = "eip155:1";
          requirements.network = "eip155:1";
        },
      ],
      [
        "accepted network",
        (payload: PaymentPayload) => {
          payload.accepted.network = "eip155:1";
        },
      ],
      [
        "payer",
        (payload: PaymentPayload) => {
          (payload.payload as UptoEIP3009Payload).authorization.from =
            "0x0000000000000000000000000000000000000004";
        },
      ],
      [
        "asset",
        (_payload: PaymentPayload, requirements: PaymentRequirements) => {
          requirements.asset = "0x0000000000000000000000000000000000000005";
        },
      ],
      [
        "payment recipient",
        (payload: PaymentPayload, requirements: PaymentRequirements) => {
          const changedPayTo = "0x0000000000000000000000000000000000000003";
          (payload.payload as UptoEIP3009Payload).paymentInfo.payTo = changedPayTo;
          requirements.payTo = changedPayTo;
        },
      ],
      [
        "required payment recipient",
        (_payload: PaymentPayload, requirements: PaymentRequirements) => {
          requirements.payTo = "0x0000000000000000000000000000000000000003";
        },
      ],
      [
        "payload payment recipient",
        (payload: PaymentPayload) => {
          (payload.payload as UptoEIP3009Payload).paymentInfo.payTo =
            "0x0000000000000000000000000000000000000003";
        },
      ],
      [
        "nonce",
        (payload: PaymentPayload) => {
          (payload.payload as UptoEIP3009Payload).authorization.nonce = ("0x" +
            "00".repeat(32)) as `0x${string}`;
        },
      ],
    ])("preserves pending state when a retry changes %s", async (_name, mutate) => {
      const store = new InMemoryPendingSettlementStore();
      const pendingScheme = new UptoEvmScheme(mockSigner, { pendingSettlementStore: store });
      mockSigner.waitForTransactionReceipt = vi
        .fn()
        .mockRejectedValueOnce(new Error("receipt timeout"))
        .mockResolvedValueOnce({ status: "success" });
      const eip3009 = makeEIP3009Payload();
      const payload = makeEIP3009PaymentPayload(eip3009);
      const requirements = makeEIP3009Requirements({ amount: "400000" });
      const originalAcceptedNetwork = payload.accepted.network;
      const originalRequirements = { ...requirements };
      const originalFrom = eip3009.authorization.from;
      const originalNonce = eip3009.authorization.nonce;
      const originalPayTo = eip3009.paymentInfo.payTo;

      const first = await pendingScheme.settle(payload, requirements);
      const changedRequirements = {
        ...requirements,
        extra: { ...requirements.extra },
      };
      mutate(payload, changedRequirements);
      const mismatch = await pendingScheme.settle(payload, changedRequirements);

      expect(first.errorReason).toBe(ErrSettlementPending);
      expect(mismatch).toEqual(
        expect.objectContaining({
          success: false,
          errorReason: ErrUptoPendingMismatch,
          transaction: MOCK_TX_HASH,
          network: "eip155:8453",
          payer: originalFrom,
        }),
      );
      expect(JSON.parse((await store.get(eip3009.signature))!)).toEqual(
        expect.objectContaining({
          txHash: MOCK_TX_HASH,
          amount: "400000",
          network: "eip155:8453",
          payTo: getAddress(originalPayTo),
          nonce: originalNonce,
        }),
      );

      payload.accepted.network = originalAcceptedNetwork;
      requirements.network = originalRequirements.network;
      requirements.asset = originalRequirements.asset;
      requirements.payTo = originalRequirements.payTo;
      eip3009.authorization.from = originalFrom;
      eip3009.authorization.nonce = originalNonce;
      eip3009.paymentInfo.payTo = originalPayTo;
      const reconciled = await pendingScheme.settle(payload, requirements);
      expect(reconciled).toEqual(
        expect.objectContaining({
          success: true,
          transaction: MOCK_TX_HASH,
          network: "eip155:8453",
          amount: "400000",
          payer: eip3009.authorization.from,
        }),
      );
      expect(await store.get(eip3009.signature)).toBeUndefined();
      expect(mockSigner.writeContract).toHaveBeenCalledTimes(1);
    });

    it("reconciles a pending proxy transaction without rebroadcasting", async () => {
      mockSigner.waitForTransactionReceipt = vi
        .fn()
        .mockRejectedValueOnce(new Error("receipt timeout"))
        .mockResolvedValueOnce({ status: "success" });
      const eip3009 = makeEIP3009Payload();
      const payload = makeEIP3009PaymentPayload(eip3009);
      const requirements = makeEIP3009Requirements({ amount: "400000" });

      const first = await scheme.settle(payload, requirements);
      const retry = await scheme.settle(payload, requirements);

      expect(first).toEqual(
        expect.objectContaining({
          success: false,
          errorReason: ErrSettlementPending,
          transaction: MOCK_TX_HASH,
        }),
      );
      expect(retry).toEqual(
        expect.objectContaining({
          success: true,
          transaction: MOCK_TX_HASH,
          amount: "400000",
        }),
      );
      expect(mockSigner.writeContract).toHaveBeenCalledTimes(1);
    });
  });

  describe("verify", () => {
    it("should return isValid=true for a valid payload", async () => {
      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
      // The strict primitive checks code.length first then either ecrecovers or
      // calls isValidSignature. Default mock returns deployed bytecode, so we
      // expect an isValidSignature ERC-1271 readContract call.
      expect(mockSigner.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "isValidSignature" }),
      );
    });

    it("should reject if scheme is not upto", async () => {
      const payload = makePayload(undefined, { scheme: "exact" });
      const requirements = makeRequirements({ scheme: "exact" as any });

      const result = await scheme.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrUptoInvalidScheme);
    });

    it("should reject if network mismatches", async () => {
      const payload = makePayload(undefined, { network: "eip155:1" });
      const requirements = makeRequirements({ network: "eip155:8453" as any });

      const result = await scheme.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrUptoNetworkMismatch);
    });

    it("should reject if spender is not x402UptoPermit2ProxyAddress", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.spender = "0x0000000000000000000000000000000000000001";
      const payload = makePayload(p2);

      const result = await scheme.verify(payload, makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_spender");
    });

    it("should reject if facilitator in witness does not match signer", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.witness.facilitator = "0x0000000000000000000000000000000000000099";
      const payload = makePayload(p2);

      const result = await scheme.verify(payload, makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrUptoFacilitatorMismatch);
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

    it("should PASS when permitted.amount equals requirements.amount", async () => {
      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(true);
    });

    it("should FAIL when permitted.amount !== requirements.amount (too low)", async () => {
      const requirements = makeRequirements({ amount: "5000000" });

      const result = await scheme.verify(makePayload(), requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrPermit2AmountMismatch);
    });

    it("should FAIL when permitted.amount !== requirements.amount (too high)", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.amount = "2000000";
      const result = await scheme.verify(makePayload(p2), makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe(ErrPermit2AmountMismatch);
    });

    it("should reject if signature is invalid", async () => {
      mockSigner.verifyTypedData = vi.fn().mockResolvedValue(false);
      mockSigner.getCode = vi
        .fn()
        .mockImplementation(mockGetCodeEOAPayer("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"));

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
      expect(result.transaction).toBe(MOCK_TX_HASH);
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
      expect(mockSigner.writeContract).toHaveBeenCalled();
    });

    it("should pass settlement amount to settle call", async () => {
      await scheme.settle(makePayload(), makeRequirements({ amount: "500000" }));

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.functionName).toBe("settle");
      // args: [permit, amount, owner, witness, signature]
      expect(writeCall.args[1]).toBe(BigInt("500000"));
    });

    it("should include facilitator in witness for settle call", async () => {
      await scheme.settle(makePayload(), makeRequirements());

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // args[3] is the witness struct
      expect(writeCall.args[3].facilitator.toLowerCase()).toBe(FACILITATOR_ADDRESS.toLowerCase());
    });

    it("should return success with empty tx for zero settlement amount", async () => {
      const requirements = makeRequirements({ amount: "0" });

      const result = await scheme.settle(makePayload(), requirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("");
      expect(mockSigner.writeContract).not.toHaveBeenCalled();
    });

    it("should succeed when settlement amount < permitted amount (upto core feature)", async () => {
      const result = await scheme.settle(makePayload(), makeRequirements({ amount: "500000" }));

      expect(result.success).toBe(true);
      expect(result.transaction).toBe(MOCK_TX_HASH);
      expect(mockSigner.writeContract).toHaveBeenCalled();

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.functionName).toBe("settle");
      expect(writeCall.args[1]).toBe(BigInt("500000"));
    });

    it("should fail when settlement exceeds permitted amount", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.amount = "1000000";
      const payload = makePayload(p2);
      const requirements = makeRequirements({ amount: "2000000" });

      const result = await scheme.settle(payload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrUptoSettlementExceedsAmount);
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

  describe("settle-time verification convention (spec §Phase 4)", () => {
    // These tests verify the settle-time verification convention documented in
    // specs/schemes/upto/scheme_upto_evm.md §Phase 4 "Settle-Time Verification".
    //
    // The wire shape for a partial settlement has:
    //   paymentRequirements.amount = actual metered amount (e.g. 1858)
    //   permit2Authorization.permitted.amount = authorized ceiling (e.g. 20000)
    //
    // The facilitator MUST verify the signature against permitted.amount (the
    // ceiling), NOT requirements.amount (the metered actual). Enforcing
    // requirements.amount === permitted.amount at settle time breaks all partial
    // settlements. See: https://github.com/x402-foundation/x402/issues/2437

    it("should verify signature against permitted.amount, not requirements.amount", async () => {
      const ceiling = "20000";
      const metered = "1858";

      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.amount = ceiling;
      const payload = makePayload(p2);
      const requirements = makeRequirements({ amount: metered });

      const result = await settleUptoPermit2(mockSigner, payload, requirements, p2);

      expect(result.success).toBe(true);

      // Default mock returns deployed bytecode → ERC-1271 path; readContract
      // is called with isValidSignature to verify the ceiling-amount typed data.
      expect(mockSigner.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "isValidSignature" }),
      );
    });

    it("should transfer the metered amount on-chain, not the ceiling", async () => {
      const ceiling = "20000";
      const metered = "1858";

      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.amount = ceiling;
      const payload = makePayload(p2);
      const requirements = makeRequirements({ amount: metered });

      const result = await settleUptoPermit2(mockSigner, payload, requirements, p2);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(metered);

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.args[1]).toBe(BigInt(metered));
    });

    it("should succeed across a range of partial settlement ratios", async () => {
      const ceiling = "1000000";
      const testAmounts = ["1", "500000", "999999", "1000000"];

      for (const metered of testAmounts) {
        vi.clearAllMocks();
        mockSigner.readContract = rcWithSig(BigInt("999999999999999999"));
        mockSigner.verifyTypedData = vi.fn().mockResolvedValue(true);
        mockSigner.writeContract = vi.fn().mockResolvedValue(MOCK_TX_HASH);
        mockSigner.waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });

        const p2 = makePermit2Payload();
        p2.permit2Authorization.permitted.amount = ceiling;
        const payload = makePayload(p2);
        const requirements = makeRequirements({ amount: metered });

        const result = await settleUptoPermit2(mockSigner, payload, requirements, p2);

        expect(result.success).toBe(true);
        expect(result.amount).toBe(metered);
      }
    });

    it("should reject when metered amount exceeds ceiling", async () => {
      const ceiling = "20000";
      const metered = "20001";

      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.amount = ceiling;
      const payload = makePayload(p2);
      const requirements = makeRequirements({ amount: metered });

      const result = await settleUptoPermit2(mockSigner, payload, requirements, p2);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrUptoSettlementExceedsAmount);
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

    it("should map InvalidNonce revert", async () => {
      mockSigner.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("execution reverted: InvalidNonce()"));

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("permit2_invalid_nonce");
    });

    it("should map AmountExceedsPermitted revert", async () => {
      mockSigner.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("execution reverted: AmountExceedsPermitted()"));

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrUptoAmountExceedsPermitted);
    });

    it("should map UnauthorizedFacilitator revert", async () => {
      mockSigner.writeContract = vi
        .fn()
        .mockRejectedValue(new Error("execution reverted: UnauthorizedFacilitator()"));

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrUptoUnauthorizedFacilitator);
    });
  });

  describe("direct function calls (verifyUptoPermit2 / settleUptoPermit2)", () => {
    it("verifyUptoPermit2 returns isValid=true for valid input", async () => {
      const p2 = makePermit2Payload();
      const result = await verifyUptoPermit2(mockSigner, makePayload(p2), makeRequirements(), p2);

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

    it("settleUptoPermit2 rejects when settlement exceeds permitted", async () => {
      const p2 = makePermit2Payload();
      p2.permit2Authorization.permitted.amount = "500000";
      const result = await settleUptoPermit2(
        mockSigner,
        makePayload(p2),
        makeRequirements({ amount: "1000000" }),
        p2,
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrUptoSettlementExceedsAmount);
    });
  });

  describe("getSigners", () => {
    it("should return facilitator addresses from signer", () => {
      const signers = scheme.getSigners("eip155:8453");
      expect(signers).toEqual([FACILITATOR_ADDRESS]);
    });
  });

  describe("verify edge cases", () => {
    it("should handle verifyTypedData throwing an exception", async () => {
      mockSigner.verifyTypedData = vi.fn().mockRejectedValue(new Error("RPC unavailable"));
      mockSigner.getCode = vi
        .fn()
        .mockImplementation(mockGetCodeEOAPayer("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"));

      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_signature");
    });
  });

  describe("ERC-6492 / smart contract wallet signature fallback", () => {
    it("should reject undeployed EOA with invalid signature", async () => {
      mockSigner.verifyTypedData = vi.fn().mockResolvedValue(false);
      mockSigner.getCode = vi
        .fn()
        .mockImplementation(mockGetCodeEOAPayer("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"));

      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_signature");
    });

    it("should fall through to simulation for deployed smart contract when verifyTypedData returns false", async () => {
      mockSigner.verifyTypedData = vi.fn().mockResolvedValue(false);
      mockSigner.getCode = vi.fn().mockResolvedValue("0x608060405234");

      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(true);
    });

    it("should fall through to simulation for deployed smart contract when verifyTypedData throws", async () => {
      mockSigner.verifyTypedData = vi.fn().mockRejectedValue(new Error("unsupported"));
      mockSigner.getCode = vi.fn().mockResolvedValue("0x608060405234");

      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(true);
    });

    it("should reject undeployed contract when verifyTypedData throws", async () => {
      mockSigner.verifyTypedData = vi.fn().mockRejectedValue(new Error("unsupported"));
      mockSigner.getCode = vi
        .fn()
        .mockImplementation(mockGetCodeEOAPayer("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"));

      const result = await scheme.verify(makePayload(), makeRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_signature");
    });
  });

  describe("settle receipt handling", () => {
    it("should fail when transaction receipt returns reverted status", async () => {
      mockSigner.waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "reverted" });

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
    });

    it("should report settlement_pending with the broadcast tx hash when the receipt wait fails", async () => {
      mockSigner.waitForTransactionReceipt = vi
        .fn()
        .mockRejectedValue(new Error("rpc: timeout waiting for receipt"));

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrSettlementPending);
      expect(result.transaction).toBe(MOCK_TX_HASH);
      // Nothing is known to have settled yet, so no amount is reported.
      expect(result.amount).toBeUndefined();
    });

    it("should fail terminally when the signer reports success without a usable tx hash", async () => {
      mockSigner.writeContract = vi.fn().mockResolvedValue("0xnothash");
      mockSigner.waitForTransactionReceipt = vi.fn();

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrUptoTransactionFailed);
      expect(result.transaction).toBe("");
      expect(mockSigner.waitForTransactionReceipt).not.toHaveBeenCalled();
    });

    it("should report settlement_pending when the receipt wait throws a programmer error", async () => {
      mockSigner.waitForTransactionReceipt = vi
        .fn()
        .mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'status')"));

      const result = await scheme.settle(makePayload(), makeRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrSettlementPending);
      expect(result.transaction).toBe(MOCK_TX_HASH);
    });
  });

  describe("EIP-2612 Gas Sponsoring - Settlement", () => {
    const eip2612Requirements = makeRequirements();

    function makeEip2612Extension() {
      const ts = Math.floor(Date.now() / 1000);
      return {
        eip2612GasSponsoring: {
          info: {
            from: "0x1234567890123456789012345678901234567890",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
            amount:
              "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            nonce: "0",
            deadline: (ts + 300).toString(),
            signature: "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b",
            version: "1",
          },
          schema: {},
        },
      };
    }

    function makePayloadWithExtensions(extensions?: Record<string, unknown>): PaymentPayload {
      const p2 = makePermit2Payload();
      return {
        x402Version: 2,
        accepted: { scheme: "upto", network: "eip155:8453" },
        payload: p2,
        resource: { url: "https://test.com", description: "", mimeType: "" },
        ...(extensions ? { extensions } : {}),
      } as PaymentPayload;
    }

    it("should call settleWithPermit when EIP-2612 extension is present", async () => {
      mockSigner.readContract = rcWithSig(undefined);

      const payload = makePayloadWithExtensions(makeEip2612Extension());
      const result = await scheme.settle(payload, eip2612Requirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe(MOCK_TX_HASH);

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.functionName).toBe("settleWithPermit");
    });

    it("should call settle (not settleWithPermit) when no EIP-2612 extension", async () => {
      mockSigner.readContract = rcWithSig(BigInt("999999999999999999"));

      const payload = makePayloadWithExtensions();
      const result = await scheme.settle(payload, eip2612Requirements);

      expect(result.success).toBe(true);

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.functionName).toBe("settle");
    });

    it("should pass correct EIP-2612 permit struct to settleWithPermit", async () => {
      mockSigner.readContract = rcWithSig(undefined);

      const payload = makePayloadWithExtensions(makeEip2612Extension());
      await scheme.settle(payload, eip2612Requirements);

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.functionName).toBe("settleWithPermit");

      const permit2612Struct = writeCall.args[0];
      expect(permit2612Struct.value).toBeDefined();
      expect(permit2612Struct.deadline).toBeDefined();
      expect(permit2612Struct.r).toBeDefined();
      expect(permit2612Struct.s).toBeDefined();
      expect(permit2612Struct.v).toBeDefined();
      expect(typeof permit2612Struct.v).toBe("number");
    });

    it("should include settlement amount in settleWithPermit args", async () => {
      mockSigner.readContract = rcWithSig(undefined);

      const payload = makePayloadWithExtensions(makeEip2612Extension());
      await scheme.settle(payload, makeRequirements({ amount: "500000" }));

      const writeCall = (mockSigner.writeContract as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(writeCall.functionName).toBe("settleWithPermit");
      // settleWithPermit args: [permit2612Struct, permit, amount, owner, witness, signature]
      expect(writeCall.args[2]).toBe(BigInt("500000"));
    });
  });

  describe("ERC-20 Approval Gas Sponsoring - Verify", () => {
    const PAYER = "0x1234567890123456789012345678901234567890" as `0x${string}`;
    const TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
    const MOCK_SIGNED_TX = "0x02f8ab0102030405060708" as `0x${string}`;

    const APPROVE_CALLDATA =
      `0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3` +
      `ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`;

    const erc20VerifyRequirements: PaymentRequirements = {
      scheme: "upto",
      network: "eip155:8453",
      amount: "1000000",
      asset: TOKEN_ADDRESS,
      payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      maxTimeoutSeconds: 300,
      extra: { assetTransferMethod: "permit2", facilitatorAddress: FACILITATOR_ADDRESS },
    };

    function makeErc20UptoPayload(extensions?: Record<string, unknown>): PaymentPayload {
      const ts = Math.floor(Date.now() / 1000);
      return {
        x402Version: 2,
        payload: {
          signature: "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b",
          permit2Authorization: {
            from: PAYER,
            permitted: {
              token: TOKEN_ADDRESS,
              amount: erc20VerifyRequirements.amount,
            },
            spender: x402UptoPermit2ProxyAddress,
            nonce: "99999",
            deadline: (ts + 300).toString(),
            witness: {
              to: erc20VerifyRequirements.payTo,
              facilitator: FACILITATOR_ADDRESS,
              validAfter: (ts - 600).toString(),
            },
          },
        } as UptoPermit2Payload,
        accepted: { scheme: "upto", network: "eip155:8453" },
        resource: { url: "https://test.com", description: "", mimeType: "" },
        ...(extensions ? { extensions } : {}),
      } as PaymentPayload;
    }

    function makeValidErc20Extension() {
      return {
        erc20ApprovalGasSponsoring: {
          info: {
            from: PAYER,
            asset: TOKEN_ADDRESS,
            spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
            amount:
              "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            signedTransaction: MOCK_SIGNED_TX,
            version: "1",
          },
          schema: {},
        },
      };
    }

    function makeErc20Context() {
      return {
        getExtension: vi.fn().mockImplementation((key: string) => {
          if (key === ERC20_APPROVAL_GAS_SPONSORING_KEY) {
            return { key: ERC20_APPROVAL_GAS_SPONSORING_KEY };
          }
          return undefined;
        }),
      };
    }

    it("should reject when ERC-20 extension has invalid format (bad address)", async () => {
      mockSigner.readContract = rcWithSig(undefined);

      const payload = makeErc20UptoPayload({
        erc20ApprovalGasSponsoring: {
          info: {
            from: "not-an-address",
            asset: TOKEN_ADDRESS,
            spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
            amount: "100",
            signedTransaction: MOCK_SIGNED_TX,
            version: "1",
          },
          schema: {},
        },
      });

      const result = await scheme.verify(payload, erc20VerifyRequirements, makeErc20Context());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_erc20_approval_extension_format");
    });

    it("should reject when ERC-20 extension from doesn't match payer", async () => {
      mockSigner.readContract = rcWithSig(undefined);

      const payload = makeErc20UptoPayload({
        erc20ApprovalGasSponsoring: {
          info: {
            from: "0x0000000000000000000000000000000000000001",
            asset: TOKEN_ADDRESS,
            spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
            amount: "100",
            signedTransaction: MOCK_SIGNED_TX,
            version: "1",
          },
          schema: {},
        },
      });

      const result = await scheme.verify(payload, erc20VerifyRequirements, makeErc20Context());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("erc20_approval_from_mismatch");
    });

    it("should accept when valid ERC-20 extension present and simulation succeeds", async () => {
      mockSigner.readContract = rcWithSig(undefined);

      const { parseTransaction, recoverTransactionAddress } = await import("viem");
      vi.mocked(parseTransaction).mockReturnValue({
        to: TOKEN_ADDRESS,
        data: APPROVE_CALLDATA as `0x${string}`,
      } as any);
      vi.mocked(recoverTransactionAddress).mockResolvedValue(PAYER);

      const mockSimulateTransactions = vi.fn().mockResolvedValue(true);

      const mockContext = {
        getExtension: vi.fn().mockImplementation((key: string) => {
          if (key === ERC20_APPROVAL_GAS_SPONSORING_KEY) {
            return {
              key: ERC20_APPROVAL_GAS_SPONSORING_KEY,
              signer: {
                ...mockSigner,
                sendTransactions: vi.fn(),
                simulateTransactions: mockSimulateTransactions,
              },
            };
          }
          return undefined;
        }),
      };

      const result = await scheme.verify(
        makeErc20UptoPayload(makeValidErc20Extension()),
        erc20VerifyRequirements,
        mockContext,
      );

      expect(result.isValid).toBe(true);
    });
  });

  describe("ERC-20 Approval Gas Sponsoring - Settlement", () => {
    const PAYER = "0x1234567890123456789012345678901234567890" as `0x${string}`;
    const TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
    const MOCK_SIGNED_TX = "0x02f8ab0102030405060708" as `0x${string}`;

    const APPROVE_CALLDATA =
      `0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3` +
      `ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`;

    const erc20SettleRequirements: PaymentRequirements = {
      scheme: "upto",
      network: "eip155:8453",
      amount: "1000000",
      asset: TOKEN_ADDRESS,
      payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      maxTimeoutSeconds: 300,
      extra: { assetTransferMethod: "permit2", facilitatorAddress: FACILITATOR_ADDRESS },
    };

    function makeErc20UptoPayload(extensions?: Record<string, unknown>): PaymentPayload {
      const ts = Math.floor(Date.now() / 1000);
      return {
        x402Version: 2,
        payload: {
          signature: "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b",
          permit2Authorization: {
            from: PAYER,
            permitted: {
              token: TOKEN_ADDRESS,
              amount: erc20SettleRequirements.amount,
            },
            spender: x402UptoPermit2ProxyAddress,
            nonce: "99999",
            deadline: (ts + 300).toString(),
            witness: {
              to: erc20SettleRequirements.payTo,
              facilitator: FACILITATOR_ADDRESS,
              validAfter: (ts - 600).toString(),
            },
          },
        } as UptoPermit2Payload,
        accepted: { scheme: "upto", network: "eip155:8453" },
        resource: { url: "https://test.com", description: "", mimeType: "" },
        ...(extensions ? { extensions } : {}),
      } as PaymentPayload;
    }

    function makeValidErc20Extension() {
      return {
        erc20ApprovalGasSponsoring: {
          info: {
            from: PAYER,
            asset: TOKEN_ADDRESS,
            spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
            amount:
              "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            signedTransaction: MOCK_SIGNED_TX,
            version: "1",
          },
          schema: {},
        },
      };
    }

    function makeErc20SettleContext() {
      const APPROVAL_TX_HASH = ("0x" + "11".repeat(32)) as `0x${string}`;
      const SETTLE_TX_HASH = ("0x" + "22".repeat(32)) as `0x${string}`;
      const mockSendTransactions = vi.fn().mockResolvedValue([APPROVAL_TX_HASH, SETTLE_TX_HASH]);
      const mockExtWaitForReceipt = vi.fn().mockResolvedValue({ status: "success" });

      const mockContext = {
        getExtension: vi.fn().mockImplementation((key: string) => {
          if (key === ERC20_APPROVAL_GAS_SPONSORING_KEY) {
            return {
              key: ERC20_APPROVAL_GAS_SPONSORING_KEY,
              signer: {
                getAddresses: () => [FACILITATOR_ADDRESS],
                readContract: mockSigner.readContract,
                verifyTypedData: mockSigner.verifyTypedData,
                writeContract: vi.fn(),
                sendTransaction: vi.fn(),
                waitForTransactionReceipt: mockExtWaitForReceipt,
                getCode: vi.fn().mockResolvedValue("0x"),
                sendTransactions: mockSendTransactions,
              },
            };
          }
          return undefined;
        }),
      };

      return { mockContext, mockSendTransactions };
    }

    it("should broadcast approval tx via extension signer then settle", async () => {
      const { parseTransaction, recoverTransactionAddress } = await import("viem");
      vi.mocked(parseTransaction).mockReturnValue({
        to: TOKEN_ADDRESS,
        data: APPROVE_CALLDATA as `0x${string}`,
      } as any);
      vi.mocked(recoverTransactionAddress).mockResolvedValue(PAYER);

      mockSigner.readContract = rcWithSig(undefined);

      const { mockContext, mockSendTransactions } = makeErc20SettleContext();

      const result = await scheme.settle(
        makeErc20UptoPayload(makeValidErc20Extension()),
        erc20SettleRequirements,
        mockContext,
      );

      expect(mockSendTransactions).toHaveBeenCalled();
      const transactions = mockSendTransactions.mock.calls[0][0];
      expect(transactions[0]).toBe(MOCK_SIGNED_TX);
      expect(transactions[1]).toHaveProperty("to");
      expect(transactions[1]).toHaveProperty("data");

      expect(mockSigner.writeContract).not.toHaveBeenCalled();

      expect(result.success).toBe(true);
    });

    it("should fail when the extension signer returns an invalid settlement transaction hash", async () => {
      const { parseTransaction, recoverTransactionAddress } = await import("viem");
      vi.mocked(parseTransaction).mockReturnValue({
        to: TOKEN_ADDRESS,
        data: APPROVE_CALLDATA as `0x${string}`,
      } as any);
      vi.mocked(recoverTransactionAddress).mockResolvedValue(PAYER);

      mockSigner.readContract = rcWithSig(undefined);

      const mockExtWaitForReceipt = vi.fn();
      const mockSendTransactions = vi.fn().mockResolvedValue(["0xapproval"]);
      const mockContext = {
        getExtension: vi.fn().mockImplementation((key: string) => {
          if (key === ERC20_APPROVAL_GAS_SPONSORING_KEY) {
            return {
              key: ERC20_APPROVAL_GAS_SPONSORING_KEY,
              signer: {
                getAddresses: () => [FACILITATOR_ADDRESS],
                readContract: mockSigner.readContract,
                verifyTypedData: mockSigner.verifyTypedData,
                writeContract: vi.fn(),
                sendTransaction: vi.fn(),
                waitForTransactionReceipt: mockExtWaitForReceipt,
                getCode: vi.fn().mockResolvedValue("0x"),
                sendTransactions: mockSendTransactions,
              },
            };
          }
          return undefined;
        }),
      };

      const result = await scheme.settle(
        makeErc20UptoPayload(makeValidErc20Extension()),
        erc20SettleRequirements,
        mockContext,
      );

      expect(mockExtWaitForReceipt).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrErc20ApprovalBroadcastFailed);
      expect(result.transaction).toBe("");
    });

    it("should succeed when the extension signer bundles approval + settle into a single hash", async () => {
      // The extension signer owns execution strategy: it may bundle transactions
      // atomically (e.g. Flashbots, smart account batching) and return a single hash
      // for the bundle rather than one hash per input.
      const { parseTransaction, recoverTransactionAddress } = await import("viem");
      vi.mocked(parseTransaction).mockReturnValue({
        to: TOKEN_ADDRESS,
        data: APPROVE_CALLDATA as `0x${string}`,
      } as any);
      vi.mocked(recoverTransactionAddress).mockResolvedValue(PAYER);

      mockSigner.readContract = rcWithSig(undefined);

      const BUNDLE_TX_HASH = ("0x" + "ef".repeat(32)) as `0x${string}`;
      const mockExtWaitForReceipt = vi.fn().mockResolvedValue({ status: "success" });
      const mockSendTransactions = vi.fn().mockResolvedValue([BUNDLE_TX_HASH]);
      const mockContext = {
        getExtension: vi.fn().mockImplementation((key: string) => {
          if (key === ERC20_APPROVAL_GAS_SPONSORING_KEY) {
            return {
              key: ERC20_APPROVAL_GAS_SPONSORING_KEY,
              signer: {
                getAddresses: () => [FACILITATOR_ADDRESS],
                readContract: mockSigner.readContract,
                verifyTypedData: mockSigner.verifyTypedData,
                writeContract: vi.fn(),
                sendTransaction: vi.fn(),
                waitForTransactionReceipt: mockExtWaitForReceipt,
                getCode: vi.fn().mockResolvedValue("0x"),
                sendTransactions: mockSendTransactions,
              },
            };
          }
          return undefined;
        }),
      };

      const result = await scheme.settle(
        makeErc20UptoPayload(makeValidErc20Extension()),
        erc20SettleRequirements,
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.transaction).toBe(BUNDLE_TX_HASH);
    });

    it("should report settlement_pending when the extension signer's receipt wait fails", async () => {
      const { parseTransaction, recoverTransactionAddress } = await import("viem");
      vi.mocked(parseTransaction).mockReturnValue({
        to: TOKEN_ADDRESS,
        data: APPROVE_CALLDATA as `0x${string}`,
      } as any);
      vi.mocked(recoverTransactionAddress).mockResolvedValue(PAYER);

      mockSigner.readContract = rcWithSig(undefined);

      const APPROVAL_TX_HASH = ("0x" + "11".repeat(32)) as `0x${string}`;
      const SETTLE_TX_HASH = ("0x" + "ef".repeat(32)) as `0x${string}`;
      const mockExtWaitForReceipt = vi
        .fn()
        .mockRejectedValue(new Error("rpc: timeout waiting for receipt"));
      const mockSendTransactions = vi.fn().mockResolvedValue([APPROVAL_TX_HASH, SETTLE_TX_HASH]);
      const mockContext = {
        getExtension: vi.fn().mockImplementation((key: string) => {
          if (key === ERC20_APPROVAL_GAS_SPONSORING_KEY) {
            return {
              key: ERC20_APPROVAL_GAS_SPONSORING_KEY,
              signer: {
                getAddresses: () => [FACILITATOR_ADDRESS],
                readContract: mockSigner.readContract,
                verifyTypedData: mockSigner.verifyTypedData,
                writeContract: vi.fn(),
                sendTransaction: vi.fn(),
                waitForTransactionReceipt: mockExtWaitForReceipt,
                getCode: vi.fn().mockResolvedValue("0x"),
                sendTransactions: mockSendTransactions,
              },
            };
          }
          return undefined;
        }),
      };

      const result = await scheme.settle(
        makeErc20UptoPayload(makeValidErc20Extension()),
        erc20SettleRequirements,
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe(ErrSettlementPending);
      expect(result.transaction).toBe(SETTLE_TX_HASH);
    });

    it("should include settlement amount in ERC-20 approval settle response", async () => {
      const { parseTransaction, recoverTransactionAddress } = await import("viem");
      vi.mocked(parseTransaction).mockReturnValue({
        to: TOKEN_ADDRESS,
        data: APPROVE_CALLDATA as `0x${string}`,
      } as any);
      vi.mocked(recoverTransactionAddress).mockResolvedValue(PAYER);

      mockSigner.readContract = rcWithSig(undefined);

      const { mockContext } = makeErc20SettleContext();

      const result = await scheme.settle(
        makeErc20UptoPayload(makeValidErc20Extension()),
        makeRequirements({
          amount: "750000",
          asset: TOKEN_ADDRESS,
          extra: { assetTransferMethod: "permit2", facilitatorAddress: FACILITATOR_ADDRESS },
        }),
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.amount).toBe("750000");
    });
  });
});
