/* eslint-disable jsdoc/require-jsdoc */
import algosdk from "algosdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPayment,
  createPaymentHeader,
  preparePaymentHeader,
  signPaymentHeader,
} from "./client";
import { AlgorandClient, WalletAccount } from "./types";
import { createLeaseFromPaymentRequirements } from "./utils/leaseUtils";
import { encodePayment } from "./utils/paymentUtils";
import { PaymentRequirements } from "../../../types/verify";

vi.mock("./utils/paymentUtils", () => ({
  encodePayment: vi.fn().mockReturnValue("encoded-avm-payment-header"),
}));

function createMockAlgodClient(lastRound: number): AlgorandClient {
  const statusMock = vi.fn(() => ({
    do: vi.fn().mockResolvedValue({ "last-round": lastRound }),
  }));

  const paramsTemplate = {
    fee: BigInt(1000),
    minFee: BigInt(1000),
    firstRound: BigInt(lastRound),
    lastRound: BigInt(lastRound + 1000),
    genesisHash: new Uint8Array(32),
    genesisID: "testnet-v1.0",
  };

  const getTransactionParamsMock = vi.fn(() => ({
    do: vi.fn().mockResolvedValue({ ...paramsTemplate }),
  }));

  const client = {
    status: statusMock,
    getTransactionParams: getTransactionParamsMock,
  } as unknown as algosdk.Algodv2;

  return {
    client,
    network: "algorand-testnet",
  };
}

function createMockWallet(address: string, client: AlgorandClient): WalletAccount {
  return {
    address,
    client: client.client,
    signTransactions: vi.fn().mockResolvedValue([Uint8Array.from([1, 2, 3])]),
  };
}

describe("AVM client preparePaymentHeader", () => {
  const feePayerAccount = algosdk.generateAccount();
  const baseRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "algorand-testnet",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test Algorand resource",
    mimeType: "application/json",
    payTo: String(algosdk.generateAccount().addr),
    maxTimeoutSeconds: 600,
    asset: "1",
    extra: {
      decimals: 6,
      feePayer: feePayerAccount.addr,
    },
  };

  const senderAccount = algosdk.generateAccount();
  let client: AlgorandClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockAlgodClient(5000);
  });

  it("creates an unsigned payment header with Algorand metadata", async () => {
    const result = await preparePaymentHeader(client, `${senderAccount.addr}`, 1, baseRequirements);

    expect(result.x402Version).toBe(1);
    expect(result.scheme).toBe("exact");
    expect(result.network).toBe("algorand-testnet");
    expect(result.payload.authorization.from).toBe(`${senderAccount.addr}`);
    expect(result.payload.authorization.to).toBe(baseRequirements.payTo);
    expect(result.payload.authorization.value).toBe(baseRequirements.maxAmountRequired);
    expect(result.payload.authorization.validAfter).toBe("5000");
    expect(result.payload.authorization.validBefore).toBe("6000");
    expect(result.payload.authorization.nonce.startsWith("0x")).toBe(true);

    const expectedLease = Buffer.from(
      createLeaseFromPaymentRequirements(baseRequirements),
    ).toString("base64");
    expect(result.algorand?.txnDetails.lease).toBe(expectedLease);
    expect(result.transactionGroup?.userTransaction).toBeDefined();
    expect(result.transactionGroup?.feePayerTransaction).toBeDefined();

    const { userTransaction, feePayerTransaction } = result.transactionGroup!;
    expect(userTransaction.group).toBeDefined();
    expect(feePayerTransaction?.group).toBeDefined();
    expect(Buffer.from(userTransaction.group!)).toEqual(Buffer.from(feePayerTransaction.group!));
    expect(result.algorand?.txnDetails.feePayer).toBe(feePayerAccount.addr);
  });

  it("omits fee payer transaction when metadata does not include one", async () => {
    const requirementsWithoutFeePayer: PaymentRequirements = {
      ...baseRequirements,
      extra: { decimals: 6 },
    };

    const result = await preparePaymentHeader(
      client,
      String(senderAccount.addr),
      1,
      requirementsWithoutFeePayer,
    );

    expect(result.transactionGroup?.feePayerTransaction).toBeUndefined();
    expect(result.algorand?.txnDetails.feePayer).toBeUndefined();
    expect(result.transactionGroup?.userTransaction.fee).toBe(BigInt(1000));
  });
});

describe("AVM client signPaymentHeader", () => {
  const paymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "algorand-testnet",
    maxAmountRequired: "500000",
    resource: "https://example.com/resource",
    description: "Sign header test",
    mimeType: "application/json",
    payTo: String(algosdk.generateAccount().addr),
    maxTimeoutSeconds: 600,
    asset: "1",
    extra: {
      feePayer: algosdk.generateAccount().addr,
    },
  };

  const senderAccount = algosdk.generateAccount();
  let client: AlgorandClient;
  let wallet: WalletAccount;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockAlgodClient(7000);
    wallet = createMockWallet(String(senderAccount.addr), client);
  });

  it("signs the user transaction and returns a payment payload", async () => {
    const unsignedHeader = await preparePaymentHeader(
      client,
      String(senderAccount.addr),
      1,
      paymentRequirements,
    );

    const signed = await signPaymentHeader(wallet, paymentRequirements, unsignedHeader);

    expect(wallet.signTransactions).toHaveBeenCalledWith([expect.any(Uint8Array)]);
    expect(signed.payload.transaction).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect("transactionGroup" in signed).toBe(false);
  });

  it("propagates signing errors", async () => {
    const unsignedHeader = await preparePaymentHeader(
      client,
      `${senderAccount.addr}`,
      1,
      paymentRequirements,
    );

    const signingError = new Error("Sign failed");
    vi.mocked(wallet.signTransactions).mockRejectedValue(signingError);

    await expect(signPaymentHeader(wallet, paymentRequirements, unsignedHeader)).rejects.toThrow(
      "Sign failed",
    );
  });
});

describe("AVM client createPaymentHeader", () => {
  const paymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "algorand-testnet",
    maxAmountRequired: "250000",
    resource: "https://example.com/resource",
    description: "Create payment header test",
    mimeType: "application/json",
    payTo: String(algosdk.generateAccount().addr),
    maxTimeoutSeconds: 600,
    asset: "1",
    extra: {
      feePayer: algosdk.generateAccount().addr,
    },
  };

  const senderAccount = algosdk.generateAccount();
  let client: AlgorandClient;
  let wallet: WalletAccount;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockAlgodClient(9000);
    wallet = createMockWallet(`${senderAccount.addr}`, client);
  });

  it("creates, signs and encodes a payment header", async () => {
    const encoded = await createPaymentHeader(client, wallet, 1, paymentRequirements);

    expect(encoded).toBe("encoded-avm-payment-header");
    expect(vi.mocked(encodePayment)).toHaveBeenCalledWith(
      expect.objectContaining({
        x402Version: 1,
        scheme: "exact",
        network: "algorand-testnet",
        payload: expect.objectContaining({ transaction: expect.any(String) }),
      }),
    );
  });

  it("propagates signing failures", async () => {
    vi.mocked(wallet.signTransactions).mockRejectedValue(new Error("signing error"));

    await expect(createPaymentHeader(client, wallet, 1, paymentRequirements)).rejects.toThrow(
      "signing error",
    );
  });

  it("propagates encoding failures", async () => {
    vi.mocked(wallet.signTransactions).mockResolvedValue([Uint8Array.from([4, 5, 6])]);
    vi.mocked(encodePayment).mockImplementation(() => {
      throw new Error("encode failure");
    });

    await expect(createPaymentHeader(client, wallet, 1, paymentRequirements)).rejects.toThrow(
      "encode failure",
    );
  });

  it("creates a full payment payload when requested", async () => {
    vi.mocked(wallet.signTransactions).mockResolvedValue([Uint8Array.from([7, 8, 9])]);
    const payment = await createPayment(client, wallet, 1, paymentRequirements);

    expect(payment.payload.transaction).toBe(Buffer.from([7, 8, 9]).toString("base64"));
    expect(payment.scheme).toBe("exact");
    expect(payment.network).toBe("algorand-testnet");
  });
});
