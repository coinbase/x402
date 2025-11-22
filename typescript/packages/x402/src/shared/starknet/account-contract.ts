/**
 * Custom Account Contract Interface for x402 Support
 *
 * This module provides the interface and utilities for interacting with
 * Starknet account contracts that have x402 payment support.
 *
 * In production, we will deploy a custom account contract with these features:
 * 1. Standard account interface (execute, validate, etc.)
 * 2. x402-specific validation logic
 * 3. Session key support
 * 4. Rate limiting and security features
 */

import { Contract, type Call, type Signature, type Abi } from "starknet";
import type { StarknetConnectedClient } from "./client";
import { createContractInstance } from "./client";

/**
 * x402 Account Contract Interface
 * This extends the standard Starknet account with x402-specific features
 */
export interface X402AccountInterface {
  /** Standard account methods */
  execute(calls: Call[]): Promise<{ transaction_hash: string }>;
  validate(calls: Call[]): Promise<boolean>;
  isValidSignature(hash: string, signature: Signature): Promise<boolean>;

  /** x402-specific methods */
  executeX402Transfer(
    tokenAddress: string,
    recipient: string,
    amount: string,
    nonce: string,
    deadline: string,
    signature: Signature,
  ): Promise<{ transaction_hash: string }>;

  /** Session key management */
  addSessionKey(
    publicKey: string,
    expiresAt: number,
    permissions: SessionKeyPermissions,
  ): Promise<void>;

  revokeSessionKey(publicKey: string): Promise<void>;

  isSessionKeyValid(publicKey: string, operation: string, params: unknown[]): Promise<boolean>;

  /** Security features */
  setRateLimit(
    tokenAddress: string,
    maxAmountPerDay: string,
    maxTransactionsPerDay: number,
  ): Promise<void>;

  pauseX402Transfers(): Promise<void>;
  unpauseX402Transfers(): Promise<void>;
}

/**
 * Session key permissions structure
 */
export interface SessionKeyPermissions {
  /** Maximum amount that can be transferred per transaction */
  maxAmountPerTx: string;
  /** Maximum total amount for the session */
  maxTotalAmount: string;
  /** Allowed recipient addresses (empty = any) */
  allowedRecipients: string[];
  /** Allowed token contracts (empty = any) */
  allowedTokens: string[];
  /** Allowed function selectors */
  allowedFunctions: string[];
}

/**
 * x402 Account Contract ABI
 * This defines the interface for our custom account contract
 */
export const X402_ACCOUNT_ABI: Abi = [
  // Standard Account Interface
  {
    name: "execute",
    type: "function",
    inputs: [{ name: "calls", type: "felt*" }],
    outputs: [{ name: "response", type: "felt*" }],
    state_mutability: "external",
  },
  {
    name: "validate",
    type: "function",
    inputs: [{ name: "calls", type: "felt*" }],
    outputs: [{ name: "valid", type: "felt" }],
    state_mutability: "view",
  },
  {
    name: "isValidSignature",
    type: "function",
    inputs: [
      { name: "hash", type: "felt252" },
      { name: "signature", type: "felt*" },
    ],
    outputs: [{ name: "magic", type: "felt" }],
    state_mutability: "view",
  },

  // x402-specific functions
  {
    name: "executeX402Transfer",
    type: "function",
    inputs: [
      { name: "token_address", type: "felt" },
      { name: "recipient", type: "felt" },
      { name: "amount", type: "u256" },
      { name: "nonce", type: "felt" },
      { name: "deadline", type: "felt" },
      { name: "signature", type: "felt*" },
    ],
    outputs: [{ name: "tx_hash", type: "felt" }],
    state_mutability: "external",
  },

  // Session key management
  {
    name: "addSessionKey",
    type: "function",
    inputs: [
      { name: "public_key", type: "felt" },
      { name: "expires_at", type: "felt" },
      { name: "max_amount_per_tx", type: "u256" },
      { name: "max_total_amount", type: "u256" },
      { name: "allowed_recipients", type: "felt*" },
      { name: "allowed_tokens", type: "felt*" },
      { name: "allowed_functions", type: "felt*" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "revokeSessionKey",
    type: "function",
    inputs: [{ name: "public_key", type: "felt" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "isSessionKeyValid",
    type: "function",
    inputs: [
      { name: "public_key", type: "felt" },
      { name: "operation", type: "felt" },
      { name: "params", type: "felt*" },
    ],
    outputs: [{ name: "valid", type: "felt" }],
    state_mutability: "view",
  },

  // Security features
  {
    name: "setRateLimit",
    type: "function",
    inputs: [
      { name: "token_address", type: "felt" },
      { name: "max_amount_per_day", type: "u256" },
      { name: "max_transactions_per_day", type: "felt" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "pauseX402Transfers",
    type: "function",
    inputs: [],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "unpauseX402Transfers",
    type: "function",
    inputs: [],
    outputs: [],
    state_mutability: "external",
  },

  // Events
  {
    name: "X402TransferExecuted",
    type: "event",
    keys: [
      { name: "token", type: "felt" },
      { name: "from", type: "felt" },
      { name: "to", type: "felt" },
    ],
    data: [
      { name: "amount", type: "u256" },
      { name: "nonce", type: "felt" },
      { name: "timestamp", type: "felt" },
    ],
  },
  {
    name: "SessionKeyAdded",
    type: "event",
    keys: [{ name: "public_key", type: "felt" }],
    data: [
      { name: "expires_at", type: "felt" },
      { name: "permissions_hash", type: "felt" },
    ],
  },
  {
    name: "SessionKeyRevoked",
    type: "event",
    keys: [{ name: "public_key", type: "felt" }],
    data: [{ name: "timestamp", type: "felt" }],
  },
  {
    name: "RateLimitUpdated",
    type: "event",
    keys: [{ name: "token", type: "felt" }],
    data: [
      { name: "max_amount_per_day", type: "u256" },
      { name: "max_transactions_per_day", type: "felt" },
    ],
  },
];

/**
 * Creates an x402 account contract instance
 *
 * @param client - The Starknet client instance
 * @param accountAddress - The account contract address
 * @returns Contract instance configured for x402 operations
 */
export function createX402AccountContract(
  client: StarknetConnectedClient,
  accountAddress: string,
): Contract {
  return createContractInstance(client, accountAddress, X402_ACCOUNT_ABI as unknown[]);
}

/**
 * Checks if an account contract supports x402
 *
 * @param client - The Starknet client instance
 * @param accountAddress - The account address to check
 * @returns True if the account supports x402 features
 */
export async function supportsX402(
  client: StarknetConnectedClient,
  accountAddress: string,
): Promise<boolean> {
  try {
    const contract = createX402AccountContract(client, accountAddress);

    // Try to call a view function specific to x402
    // This will fail if the account doesn't implement x402
    await contract.isSessionKeyValid("0x0", "0x0", []);

    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to encode session key permissions for contract calls
 *
 * @param permissions - The session key permissions to encode
 * @returns Array of encoded permission values
 */
export function encodeSessionKeyPermissions(permissions: SessionKeyPermissions): string[] {
  return [
    permissions.maxAmountPerTx,
    permissions.maxTotalAmount,
    permissions.allowedRecipients.length.toString(),
    ...permissions.allowedRecipients,
    permissions.allowedTokens.length.toString(),
    ...permissions.allowedTokens,
    permissions.allowedFunctions.length.toString(),
    ...permissions.allowedFunctions,
  ];
}

/**
 * Production-ready account factory for x402 accounts
 * This would deploy new account contracts with x402 support
 */
export class X402AccountFactory {
  /**
   * Creates an instance of the x402 account factory
   *
   * @param client - The Starknet client instance
   * @param factoryAddress - The factory contract address
   */
  constructor(
    private client: StarknetConnectedClient,
    private factoryAddress: string,
  ) {}

  /**
   * Deploys a new x402 account contract
   *
   * @param publicKey - The public key for the new account
   * @param _ - Optional salt for deterministic deployment (unused)
   * @returns Object containing the deployed address and transaction hash
   */
  async deployAccount(
    publicKey: string,
    _ = "0",
  ): Promise<{
    address: string;
    txHash: string;
  }> {
    // In production, this would call the factory contract
    // to deploy a new account with x402 support
    throw new Error("Account deployment not yet implemented");
  }

  /**
   * Calculates the address of an account before deployment
   *
   * @param _publicKey - The public key for the new account
   * @param _ - Optional salt for deterministic deployment (unused)
   * @returns The calculated account address
   */
  async calculateAccountAddress(_publicKey: string, _ = "0"): Promise<string> {
    // This would calculate the counterfactual address
    throw new Error("Address calculation not yet implemented");
  }
}

/**
 * Rate limiter for x402 transfers
 * This tracks and enforces rate limits at the application level
 */
export class X402RateLimiter {
  private transferCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private transferAmounts: Map<string, { amount: bigint; resetTime: number }> = new Map();

  /**
   * Checks if a transfer is within rate limits
   *
   * @param account - The account address to check
   * @param token - The token contract address
   * @param amount - The transfer amount
   * @param maxAmountPerDay - Maximum amount allowed per day
   * @param maxTransactionsPerDay - Maximum transactions allowed per day
   * @returns Object indicating if allowed and reason if not
   */
  async checkRateLimit(
    account: string,
    token: string,
    amount: string,
    maxAmountPerDay: string,
    maxTransactionsPerDay: number,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const now = Date.now();
    const key = `${account}:${token}`;
    const resetTime = now + 24 * 60 * 60 * 1000; // 24 hours

    // Check transaction count
    const countData = this.transferCounts.get(key) || { count: 0, resetTime };
    if (countData.resetTime < now) {
      countData.count = 0;
      countData.resetTime = resetTime;
    }

    if (countData.count >= maxTransactionsPerDay) {
      return {
        allowed: false,
        reason: `Daily transaction limit reached (${maxTransactionsPerDay})`,
      };
    }

    // Check amount limit
    const amountData = this.transferAmounts.get(key) || { amount: 0n, resetTime };
    if (amountData.resetTime < now) {
      amountData.amount = 0n;
      amountData.resetTime = resetTime;
    }

    const newTotalAmount = amountData.amount + BigInt(amount);
    if (newTotalAmount > BigInt(maxAmountPerDay)) {
      return {
        allowed: false,
        reason: `Daily amount limit exceeded (${maxAmountPerDay})`,
      };
    }

    // Update counters
    countData.count++;
    amountData.amount = newTotalAmount;
    this.transferCounts.set(key, countData);
    this.transferAmounts.set(key, amountData);

    return { allowed: true };
  }

  /**
   * Cleans up expired rate limit data
   */
  cleanupExpired(): void {
    const now = Date.now();

    for (const [key, data] of this.transferCounts.entries()) {
      if (data.resetTime < now) {
        this.transferCounts.delete(key);
      }
    }

    for (const [key, data] of this.transferAmounts.entries()) {
      if (data.resetTime < now) {
        this.transferAmounts.delete(key);
      }
    }
  }
}
