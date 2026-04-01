import {
  type Chain,
  createWalletClient,
  getAddress,
  http,
  publicActions,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deferredEscrowABI } from "../abi";
import { DEFERRED_ESCROW_ADDRESS } from "../constants";

/**
 * Viem wallet client with public actions, suitable for {@link ensureDeferredServiceRegistered}.
 *
 * Mirrors the deferred facilitator example: `privateKeyToAccount`, `createWalletClient`, `.extend(publicActions)`.
 *
 * @param args - Options for the wallet client.
 * @param args.privateKey - Hex-encoded private key for the account that signs transactions.
 * @param args.chain - Viem chain definition (RPC URLs, chain ID, etc.).
 * @param args.transport - Optional RPC transport; defaults to `http()` using the chain’s default RPC when set.
 * @returns A wallet client extended with {@link publicActions} for read/write contract calls.
 */
export function createDeferredEscrowWalletClient<const chain extends Chain>(args: {
  privateKey: `0x${string}`;
  chain: chain;
  /** When omitted, uses `http()` (chain default RPC when configured on the chain, e.g. Base Sepolia). */
  transport?: Transport;
}) {
  const account = privateKeyToAccount(args.privateKey);
  const transport = args.transport ?? http();
  return createWalletClient({
    account,
    chain: args.chain,
    transport,
  }).extend(publicActions);
}

export type EnsureDeferredServiceRegisteredResult =
  | { alreadyRegistered: true }
  | { alreadyRegistered: false; txHash: `0x${string}` };

export type EnsureDeferredServiceRegisteredParams = {
  serviceId: `0x${string}`;
  payTo: `0x${string}`;
  token: `0x${string}`;
  authorizer: `0x${string}`;
  withdrawWindow: bigint;
  /** When omitted, uses {@link DEFERRED_ESCROW_ADDRESS}. */
  escrowAddress?: `0x${string}`;
};

type RegistrationClient = {
  readContract: (args: {
    address: `0x${string}`;
    abi: typeof deferredEscrowABI;
    functionName: "getService";
    args: readonly [`0x${string}`];
  }) => Promise<{
    token: `0x${string}`;
    withdrawWindow: bigint;
    registered: boolean;
    payTo: `0x${string}`;
    unsettled: bigint;
    adminNonce: bigint;
  }>;
  writeContract: (args: {
    address: `0x${string}`;
    abi: typeof deferredEscrowABI;
    functionName: "register";
    args: readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint];
  }) => Promise<`0x${string}`>;
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{ status: string }>;
};

/**
 * Ensures `serviceId` is registered on the DeferredEscrow contract (permissionless `register`).
 * If already registered, returns immediately; otherwise submits `register` and waits for the receipt.
 *
 * @param client - Viem-style client capable of `readContract`, `writeContract`, and `waitForTransactionReceipt`.
 * @param params - Service registration fields (service id, pay-to, token, authorizer, withdraw window, optional escrow).
 * @returns Whether the service was already registered, or the transaction hash after a successful `register`.
 */
export async function ensureDeferredServiceRegistered(
  client: RegistrationClient,
  params: EnsureDeferredServiceRegisteredParams,
): Promise<EnsureDeferredServiceRegisteredResult> {
  const escrow = getAddress(params.escrowAddress ?? DEFERRED_ESCROW_ADDRESS);
  const payTo = getAddress(params.payTo);
  const token = getAddress(params.token);
  const authorizer = getAddress(params.authorizer);

  const service = await client.readContract({
    address: escrow,
    abi: deferredEscrowABI,
    functionName: "getService",
    args: [params.serviceId],
  });

  if (service.registered) {
    return { alreadyRegistered: true };
  }

  const txHash = await client.writeContract({
    address: escrow,
    abi: deferredEscrowABI,
    functionName: "register",
    args: [params.serviceId, payTo, token, authorizer, params.withdrawWindow],
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") {
    throw new Error(`DeferredEscrow register reverted (tx ${txHash})`);
  }

  return { alreadyRegistered: false, txHash };
}
