import { describe, expect, it } from "vitest";
import { PrivateKey } from "@hashgraph/sdk";
import {
  createClientHederaSigner,
  toClientHederaSigner,
  toFacilitatorHederaSigner,
} from "../../src/signer";
import { inspectHederaTransaction } from "../../src/utils";

describe("Hedera signer helpers", () => {
  it("returns the same client signer reference", () => {
    const signer = {
      accountId: "0.0.1001",
      createPartiallySignedTransferTransaction: async () => "dGVzdA==",
    };

    expect(toClientHederaSigner(signer)).toBe(signer);
  });

  it("provides in-memory replay tracking for facilitator adapter", async () => {
    const baseSigner = {
      getAddresses: () => ["0.0.5001"],
      signAndSubmitTransaction: async () => ({ transactionId: "0.0.5001@1700000000.000000000" }),
    };

    const signer = toFacilitatorHederaSigner(baseSigner, { replayWindowMs: 10_000 });
    expect(await signer.hasSeenTransaction?.("tx-1")).toBe(false);
    await signer.markTransactionSeen?.("tx-1");
    expect(await signer.hasSeenTransaction?.("tx-1")).toBe(true);
  });

  it("creates default SDK-backed client signer", async () => {
    const privateKey = PrivateKey.generateED25519();
    const signer = createClientHederaSigner("0.0.1001", privateKey.toString(), {
      network: "hedera:testnet",
    });

    const txBase64 = await signer.createPartiallySignedTransferTransaction({
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.0",
      amount: "1000",
      payTo: "0.0.1002",
      maxTimeoutSeconds: 120,
      extra: {
        feePayer: "0.0.1003",
      },
    });

    expect(typeof txBase64).toBe("string");
    expect(txBase64.length).toBeGreaterThan(0);
  });

  it("creates token transfer transaction for HTS assets", async () => {
    const privateKey = PrivateKey.generateED25519();
    const signer = createClientHederaSigner("0.0.1001", privateKey.toString(), {
      network: "hedera:testnet",
    });

    const txBase64 = await signer.createPartiallySignedTransferTransaction({
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.6001",
      amount: "2500",
      payTo: "0.0.1002",
      maxTimeoutSeconds: 120,
      extra: {
        feePayer: "0.0.1003",
      },
    });
    const inspected = inspectHederaTransaction(txBase64);

    expect(inspected.tokenTransfers["0.0.6001"]).toBeDefined();
    expect(inspected.hbarTransfers.length).toBe(0);
  });

  it("requires feePayer in requirements.extra", async () => {
    const privateKey = PrivateKey.generateED25519();
    const signer = createClientHederaSigner("0.0.1001", privateKey.toString(), {
      network: "hedera:testnet",
    });

    await expect(
      signer.createPartiallySignedTransferTransaction({
        scheme: "exact",
        network: "hedera:testnet",
        asset: "0.0.0",
        amount: "1000",
        payTo: "0.0.1002",
        maxTimeoutSeconds: 120,
        extra: {},
      }),
    ).rejects.toThrow("feePayer is required");
  });

  it("rejects zero/negative transfer amounts", async () => {
    const privateKey = PrivateKey.generateED25519();
    const signer = createClientHederaSigner("0.0.1001", privateKey.toString(), {
      network: "hedera:testnet",
    });

    await expect(
      signer.createPartiallySignedTransferTransaction({
        scheme: "exact",
        network: "hedera:testnet",
        asset: "0.0.0",
        amount: "0",
        payTo: "0.0.1002",
        maxTimeoutSeconds: 120,
        extra: {
          feePayer: "0.0.1003",
        },
      }),
    ).rejects.toThrow("amount must be greater than zero");
  });

  it("rejects invalid payTo account format", async () => {
    const privateKey = PrivateKey.generateED25519();
    const signer = createClientHederaSigner("0.0.1001", privateKey.toString(), {
      network: "hedera:testnet",
    });

    await expect(
      signer.createPartiallySignedTransferTransaction({
        scheme: "exact",
        network: "hedera:testnet",
        asset: "0.0.0",
        amount: "1",
        payTo: "not-an-account",
        maxTimeoutSeconds: 120,
        extra: {
          feePayer: "0.0.1003",
        },
      }),
    ).rejects.toThrow();
  });

  it("supports custom node URL client configuration", async () => {
    const privateKey = PrivateKey.generateED25519();
    const signer = createClientHederaSigner("0.0.1001", privateKey.toString(), {
      network: "hedera:testnet",
      nodeUrl: "127.0.0.1:50211",
    });

    const txBase64 = await signer.createPartiallySignedTransferTransaction({
      scheme: "exact",
      network: "hedera:testnet",
      asset: "0.0.0",
      amount: "1",
      payTo: "0.0.1002",
      maxTimeoutSeconds: 120,
      extra: {
        feePayer: "0.0.1003",
      },
    });

    expect(typeof txBase64).toBe("string");
    expect(txBase64.length).toBeGreaterThan(0);
  });
});
