import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createWallet,
  deleteWallet,
  signMessage as owsSignMessage,
} from "@open-wallet-standard/core";
import { owsToClientSvmSigner } from "./svm";

const VAULT_PATH = "/tmp/ows-x402-svm-test";
const WALLET_NAME = "svm-test-wallet";

let solanaAddress: string;

beforeAll(() => {
  const wallet = createWallet(WALLET_NAME, undefined, 12, VAULT_PATH);
  const solAccount = wallet.accounts.find(a => a.chainId.startsWith("solana:"));
  solanaAddress = solAccount!.address;
});

afterAll(() => {
  try {
    deleteWallet(WALLET_NAME, VAULT_PATH);
  } catch {
    // ignore cleanup errors
  }
});

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

describe("owsToClientSvmSigner", () => {
  it("resolves the correct Solana address from the wallet", () => {
    const signer = owsToClientSvmSigner(WALLET_NAME, { vaultPath: VAULT_PATH });
    expect(signer.address).toBe(solanaAddress);
  });

  it("signs transaction message bytes and attaches the signature", async () => {
    const signer = owsToClientSvmSigner(WALLET_NAME, { vaultPath: VAULT_PATH });

    // Simulate a Solana transaction with dummy message bytes
    const messageBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const tx = {
      messageBytes,
      signatures: {} as Record<string, Uint8Array>,
    };

    const [signed] = await signer.signTransactions([tx]);

    // Signature should be present at the signer's address key
    expect(signed.signatures[signer.address]).toBeDefined();

    // Ed25519 signature = 64 bytes
    const sigBytes = signed.signatures[signer.address];
    expect(sigBytes.length).toBe(64);

    // Original messageBytes should be preserved
    expect(signed.messageBytes).toBe(messageBytes);
  });

  it("produces the same signature as calling OWS SDK directly", async () => {
    const signer = owsToClientSvmSigner(WALLET_NAME, { vaultPath: VAULT_PATH });

    const messageBytes = new Uint8Array([10, 20, 30, 40, 50]);
    const tx = {
      messageBytes,
      signatures: {} as Record<string, Uint8Array>,
    };

    const [signed] = await signer.signTransactions([tx]);
    const adapterSig = bytesToHex(signed.signatures[signer.address]);

    // Call OWS SDK directly
    const directResult = owsSignMessage(
      WALLET_NAME,
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      bytesToHex(messageBytes),
      undefined,
      "hex",
      undefined,
      VAULT_PATH,
    );

    expect(adapterSig).toBe(directResult.signature);
  });

  it("signs multiple transactions in a single call", async () => {
    const signer = owsToClientSvmSigner(WALLET_NAME, { vaultPath: VAULT_PATH });

    const txs = [
      { messageBytes: new Uint8Array([1, 2, 3]), signatures: {} as Record<string, Uint8Array> },
      { messageBytes: new Uint8Array([4, 5, 6]), signatures: {} as Record<string, Uint8Array> },
      { messageBytes: new Uint8Array([7, 8, 9]), signatures: {} as Record<string, Uint8Array> },
    ];

    const signed = await signer.signTransactions(txs);

    expect(signed).toHaveLength(3);
    for (const tx of signed) {
      expect(tx.signatures[signer.address]).toBeDefined();
      expect(tx.signatures[signer.address].length).toBe(64);
    }

    // Each tx should have a different signature (different message bytes)
    const sigs = signed.map(tx => bytesToHex(tx.signatures[signer.address]));
    expect(new Set(sigs).size).toBe(3);
  });

  it("preserves existing signatures from other signers", async () => {
    const signer = owsToClientSvmSigner(WALLET_NAME, { vaultPath: VAULT_PATH });

    const existingSig = new Uint8Array(64).fill(0xab);
    const tx = {
      messageBytes: new Uint8Array([1, 2, 3]),
      signatures: { "SomeOtherSigner1111111111111111111111111111111": existingSig } as Record<string, Uint8Array>,
    };

    const [signed] = await signer.signTransactions([tx]);

    // Our signature should be added
    expect(signed.signatures[signer.address]).toBeDefined();
    // Existing signature should be preserved
    expect(signed.signatures["SomeOtherSigner1111111111111111111111111111111"]).toBe(existingSig);
  });

  it("throws when wallet does not exist", () => {
    expect(() =>
      owsToClientSvmSigner("nonexistent-wallet", { vaultPath: VAULT_PATH }),
    ).toThrow();
  });
});
