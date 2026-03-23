import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createWallet,
  deleteWallet,
  signTypedData as owsSignTypedData,
} from "@open-wallet-standard/core";
import { owsToClientEvmSigner } from "./evm";

const VAULT_PATH = "/tmp/ows-x402-evm-test";
const WALLET_NAME = "evm-test-wallet";

let walletAddress: string;

beforeAll(() => {
  const wallet = createWallet(WALLET_NAME, undefined, 12, VAULT_PATH);
  const evmAccount = wallet.accounts.find(a => a.chainId.startsWith("eip155:"));
  walletAddress = evmAccount!.address;
});

afterAll(() => {
  try {
    deleteWallet(WALLET_NAME, VAULT_PATH);
  } catch {
    // ignore cleanup errors
  }
});

describe("owsToClientEvmSigner", () => {
  it("resolves the correct EVM address from the wallet", () => {
    const signer = owsToClientEvmSigner(WALLET_NAME, { vaultPath: VAULT_PATH });
    expect(signer.address).toBe(walletAddress);
    expect(signer.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("signs EIP-712 typed data and returns a valid hex signature", async () => {
    const signer = owsToClientEvmSigner(WALLET_NAME, {
      chain: "eip155:1",
      vaultPath: VAULT_PATH,
    });

    const signature = await signer.signTypedData({
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: "84532",
        verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: signer.address,
        to: "0x209693Bc600a970C15e3076ae0F1441956630a05",
        value: "10000",
        validAfter: "0",
        validBefore: "1740672154",
        nonce: "0xf374661300000000000000000000000000000000000000000000000000000001",
      },
    });

    // 0x + 130 hex chars = 65-byte ECDSA signature (r + s + v)
    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  it("produces deterministic signatures for the same input", async () => {
    const signer = owsToClientEvmSigner(WALLET_NAME, {
      chain: "eip155:1",
      vaultPath: VAULT_PATH,
    });

    const msg = {
      domain: { name: "Test", version: "1", chainId: "1", verifyingContract: "0x0000000000000000000000000000000000000001" },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        Mail: [{ name: "contents", type: "string" }],
      },
      primaryType: "Mail",
      message: { contents: "Hello" },
    };

    const sig1 = await signer.signTypedData(msg);
    const sig2 = await signer.signTypedData(msg);
    expect(sig1).toBe(sig2);
  });

  it("produces the same signature as calling OWS SDK directly", async () => {
    const signer = owsToClientEvmSigner(WALLET_NAME, {
      chain: "eip155:1",
      vaultPath: VAULT_PATH,
    });

    const typedData = {
      domain: { name: "Test", version: "1", chainId: "1", verifyingContract: "0x0000000000000000000000000000000000000001" },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        Mail: [{ name: "contents", type: "string" }],
      },
      primaryType: "Mail",
      message: { contents: "Hello" },
    };

    const adapterSig = await signer.signTypedData(typedData);

    // Call OWS SDK directly for comparison
    const directResult = owsSignTypedData(
      WALLET_NAME,
      "eip155:1",
      JSON.stringify(typedData),
      undefined,
      undefined,
      VAULT_PATH,
    );
    const directSig = `0x${directResult.signature}`;

    expect(adapterSig).toBe(directSig);
  });

  it("throws when wallet does not exist", () => {
    expect(() =>
      owsToClientEvmSigner("nonexistent-wallet", { vaultPath: VAULT_PATH }),
    ).toThrow();
  });

  it("falls back to any eip155: account when exact chain not found", () => {
    // The wallet has eip155:1, but we ask for eip155:8453.
    // Should fallback to the eip155:1 account.
    const signer = owsToClientEvmSigner(WALLET_NAME, {
      chain: "eip155:8453",
      vaultPath: VAULT_PATH,
    });
    expect(signer.address).toBe(walletAddress);
  });
});
