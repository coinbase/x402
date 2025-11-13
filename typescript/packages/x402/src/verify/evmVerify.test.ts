import { describe, it, expect } from "vitest";
import type { PublicClient } from "viem";
import { type Address, type Hex } from "viem";
import { verifyNativeExactByTxHash, verifyErc20ExactByTxHash } from "./evmVerify";

// Local lightweight types to avoid 'any' in test doubles
type TxLike = { to: Address | null; from: Address; value: bigint; input: Hex };
type LogLike = { address: Address; topics: Hex[]; data: Hex; transactionHash: Hex };
type ReceiptLike = { status: "success" | "reverted"; blockNumber: bigint; logs: LogLike[] };

/**
 * Create a mocked viem PublicClient for native transfers (BNB/ETH) that
 * returns consistent transaction/receipt data for a given tx hash.
 *
 * @param opts - Options to shape the mocked response
 * @param opts.to - Expected recipient address (or null)
 * @param opts.from - Sender address
 * @param opts.value - Native amount in wei
 * @param opts.txHash - Transaction hash to respond to
 * @param opts.blockNumber - Block number where tx was mined
 * @param opts.head - Current head block number used for finality checks
 * @param opts.status - Receipt status, default "success"
 * @param opts.input - Tx input data, default "0x"
 * @returns Mocked PublicClient instance
 */
function makeNativeOkClient(opts: {
  to: Address;
  from: Address;
  value: bigint;
  txHash: Hex;
  blockNumber: bigint;
  head: bigint;
  status?: "success" | "reverted";
  input?: Hex;
}): PublicClient {
  const { to, from, value, txHash, blockNumber, head, status = "success", input = "0x" } = opts;
  return {
    getTransaction: async ({ hash }: { hash: Hex }) => {
      if (hash !== txHash) throw new Error("TX_NOT_FOUND");
      const tx: TxLike = {
        to,
        from,
        value,
        input,
      };
      return tx as unknown as TxLike;
    },
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      if (hash !== txHash) throw new Error("RECEIPT_NOT_FOUND");
      const receipt: ReceiptLike = {
        status,
        blockNumber,
        logs: [],
      };
      return receipt as unknown as ReceiptLike;
    },
    getBlockNumber: async () => head,
  } as unknown as PublicClient;
}

/**
 * Create a minimal ERC-20 Transfer log for tests.
 *
 * @param root0 - Input object
 * @param root0.token - ERC-20 token contract address
 * @param root0.from - Sender address
 * @param root0.to - Recipient address
 * @param root0.value - Transfer amount (atomic units)
 * @param root0.txHash - Transaction hash
 * @returns Minimal log-like object
 */
function erc20TransferLog({
  token,
  from,
  to,
  value,
  txHash,
}: {
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
  txHash: Hex;
}) {
  // keccak256("Transfer(address,address,uint256)") topic
  const sig = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;
  const pad = (v: string) => ("0x" + v.toLowerCase().replace(/^0x/, "").padStart(64, "0")) as Hex;
  const log: LogLike = {
    address: token,
    topics: [sig, pad(from), pad(to)],
    data: ("0x" + value.toString(16).padStart(64, "0")) as Hex,
    transactionHash: txHash,
  };
  return log;
}

/**
 * Create a mocked viem PublicClient that returns one matching ERC-20
 * Transfer log with exact amount and block finality.
 *
 * @param opts - Options shaping the mocked client
 * @param opts.token - ERC-20 token contract address
 * @param opts.to - Recipient address
 * @param opts.from - Sender address
 * @param opts.amount - Transfer amount (atomic)
 * @param opts.txHash - Transaction hash to respond to
 * @param opts.blockNumber - Mined block number
 * @param opts.head - Current head block number
 * @returns Mocked PublicClient instance
 */
function makeErc20OkClient(opts: {
  token: Address;
  to: Address;
  from: Address;
  amount: bigint;
  txHash: Hex;
  blockNumber: bigint;
  head: bigint;
}): PublicClient {
  const log = erc20TransferLog({
    token: opts.token,
    from: opts.from,
    to: opts.to,
    value: opts.amount,
    txHash: opts.txHash,
  });
  return {
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      if (hash !== opts.txHash) throw new Error("RECEIPT_NOT_FOUND");
      const receipt: ReceiptLike = {
        status: "success",
        blockNumber: opts.blockNumber,
        logs: [log],
      };
      return receipt as unknown as ReceiptLike;
    },
    getBlockNumber: async () => opts.head,
  } as unknown as PublicClient;
}

describe("verifyNativeExactByTxHash", () => {
  it("succeeds for exact recipient, value, empty input and sufficient finality", async () => {
    const client = makeNativeOkClient({
      to: "0x1111111111111111111111111111111111111111",
      from: "0x2222222222222222222222222222222222222222",
      value: 10_000_000_000_000_000n, // 0.01
      txHash: "0xaaa" as Hex,
      blockNumber: 100n,
      head: 120n,
    });
    const res = await verifyNativeExactByTxHash([client], "0xaaa" as Hex, {
      to: "0x1111111111111111111111111111111111111111",
      amountWei: 10_000_000_000_000_000n,
      requireEmptyInput: true,
      finalityConfirmations: 12,
    });
    expect(res.isValid).toBe(true);
  });

  it("fails with WRONG_RECIPIENT when 'to' mismatches", async () => {
    const client = makeNativeOkClient({
      to: "0x1111111111111111111111111111111111111111",
      from: "0x2222222222222222222222222222222222222222",
      value: 1n,
      txHash: "0xbbb" as Hex,
      blockNumber: 100n,
      head: 120n,
    });
    const res = await verifyNativeExactByTxHash([client], "0xbbb" as Hex, {
      to: "0x9999999999999999999999999999999999999999",
      amountWei: 1n,
      requireEmptyInput: true,
      finalityConfirmations: 12,
    });
    expect(res.isValid).toBe(false);
    expect(res.reason).toBe("WRONG_RECIPIENT");
  });
});

describe("verifyErc20ExactByTxHash", () => {
  it("succeeds for a single matching Transfer with exact amount and sufficient finality", async () => {
    const token = "0x3333333333333333333333333333333333333333" as Address;
    const to = "0x4444444444444444444444444444444444444444" as Address;
    const from = "0x5555555555555555555555555555555555555555" as Address;
    const amount = 1_000_000n;
    const txHash = "0xccc" as Hex;
    const client = makeErc20OkClient({
      token,
      to,
      from,
      amount,
      txHash,
      blockNumber: 200n,
      head: 220n,
    });

    const res = await verifyErc20ExactByTxHash([client], txHash, {
      token,
      to,
      amountAtomic: amount,
      finalityConfirmations: 12,
    });
    expect(res.isValid).toBe(true);
  });

  it("fails when no matching Transfer event found", async () => {
    const token = "0x3333333333333333333333333333333333333333" as Address;
    const to = "0x4444444444444444444444444444444444444444" as Address;
    const amount = 1_000_000n;
    const txHash = "0xddd" as Hex;
    // client with empty logs
    const client = {
      getTransactionReceipt: async ({ hash }: { hash: Hex }) => {
        if (hash !== txHash) throw new Error("RECEIPT_NOT_FOUND");
        const receipt: ReceiptLike = { status: "success", blockNumber: 300n, logs: [] };
        return receipt as unknown as ReceiptLike;
      },
      getBlockNumber: async () => 320n,
    } as unknown as PublicClient;

    const res = await verifyErc20ExactByTxHash([client], txHash, {
      token,
      to,
      amountAtomic: amount,
      finalityConfirmations: 12,
    });
    expect(res.isValid).toBe(false);
    expect(res.reason).toBe("ERC20_EVENT_NOT_FOUND");
  });
});
