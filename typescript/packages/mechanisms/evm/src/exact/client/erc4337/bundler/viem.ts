import type { Chain, PublicClient, Transport } from "viem";
import { http } from "viem";
import type { SmartAccount } from "viem/account-abstraction";
import { createBundlerClient as createViemBundlerClient } from "viem/account-abstraction";
import type {
  BundlerClient,
  BundlerClientConfig,
  GasEstimate,
  PreparedUserOperation,
  UserOperationCall,
} from "./client";
import type { UserOperation07Json } from "../../../../erc4337/types";

/**
 * Configuration for creating a viem-based bundler client
 */
export interface ViemBundlerClientConfig extends BundlerClientConfig {
  /**
   * Viem public client for blockchain interactions
   */
  publicClient: PublicClient<Transport, Chain>;

  /**
   * Smart account for user operation preparation (must be a SmartAccount, not a regular Account)
   */
  account: SmartAccount;

  /**
   * Chain configuration
   */
  chain: Chain;

  /**
   * Bundler RPC URL
   */
  bundlerUrl: string;
}

/**
 * Viem-based implementation of BundlerClient.
 * Uses viem's account-abstraction utilities for user operation handling.
 */
export class ViemBundlerClient implements BundlerClient {
  private readonly bundlerClient: ReturnType<typeof createViemBundlerClient>;
  private readonly account: SmartAccount;
  private readonly entryPoint: `0x${string}`;

  /**
   * Creates a new ViemBundlerClient instance.
   *
   * @param config - Configuration for the bundler client
   */
  constructor(config: ViemBundlerClientConfig) {
    this.account = config.account;
    this.entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" as `0x${string}`; // EntryPoint v0.7

    // Create viem bundler client with bundler-specific transport
    this.bundlerClient = createViemBundlerClient({
      client: config.publicClient,
      chain: config.chain,
      account: config.account,
      transport: http(config.bundlerUrl),
    });
  }

  /**
   * Prepares an unsigned user operation for the given calls.
   *
   * @param calls - Array of calls to execute in the user operation
   * @param _entryPoint - The entry point address (unused, viem uses the configured entry point)
   * @returns Promise resolving to a prepared (unsigned) user operation
   */
  async prepareUserOperation(
    calls: UserOperationCall[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _entryPoint: `0x${string}`,
  ): Promise<PreparedUserOperation> {
    const prepared = await this.bundlerClient.prepareUserOperation({
      account: this.account,
      calls: calls.map(call => ({
        to: call.to,
        value: call.value,
        data: call.data,
      })),
    });

    // viem v2 EntryPoint v0.7 returns separate fields (not v0.6 paymasterAndData)
    const p = prepared as Record<string, unknown>;

    return {
      sender: prepared.sender,
      nonce: prepared.nonce,
      callData: prepared.callData,
      callGasLimit: prepared.callGasLimit,
      verificationGasLimit: prepared.verificationGasLimit,
      preVerificationGas: prepared.preVerificationGas,
      maxFeePerGas: prepared.maxFeePerGas,
      maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
      // v0.7 factory fields (for account deployment)
      ...(p.factory ? { factory: p.factory as `0x${string}` } : {}),
      ...(p.factoryData ? { factoryData: p.factoryData as `0x${string}` } : {}),
      // v0.7 paymaster fields (separate, not paymasterAndData)
      ...(p.paymaster ? { paymaster: p.paymaster as `0x${string}` } : {}),
      ...(p.paymasterData ? { paymasterData: p.paymasterData as `0x${string}` } : {}),
      ...(p.paymasterVerificationGasLimit != null
        ? { paymasterVerificationGasLimit: p.paymasterVerificationGasLimit as bigint }
        : {}),
      ...(p.paymasterPostOpGasLimit != null
        ? { paymasterPostOpGasLimit: p.paymasterPostOpGasLimit as bigint }
        : {}),
      signature: prepared.signature,
    } as PreparedUserOperation;
  }

  /**
   * Estimates gas for a user operation.
   * Note: This is typically done as part of prepareUserOperation,
   * but is available as a separate method for flexibility.
   *
   * @param _userOp - The user operation to estimate gas for (unused)
   * @param _entryPoint - The entry point address (unused)
   * @returns Never returns; always throws
   */
  async estimateGas(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userOp: UserOperation07Json,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _entryPoint: `0x${string}`,
  ): Promise<GasEstimate> {
    throw new Error(
      "estimateGas should be called through prepareUserOperation, which includes gas estimation",
    );
  }

  /**
   * Sends a user operation to the bundler.
   *
   * @param userOp - The signed user operation to send
   * @param _entryPoint - The entry point address (unused, viem uses the configured entry point)
   * @returns Promise resolving to the user operation hash
   */
  async sendUserOperation(
    userOp: UserOperation07Json,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _entryPoint: `0x${string}`,
  ): Promise<string> {
    // Convert JSON user operation to format expected by viem
    const hash = await this.bundlerClient.sendUserOperation({
      account: this.account,
      sender: userOp.sender as `0x${string}`,
      nonce: BigInt(userOp.nonce),
      callData: userOp.callData as `0x${string}`,
      callGasLimit: BigInt(userOp.callGasLimit),
      verificationGasLimit: BigInt(userOp.verificationGasLimit),
      preVerificationGas: BigInt(userOp.preVerificationGas),
      maxFeePerGas: BigInt(userOp.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
      // Combine paymaster and paymasterData into paymasterAndData
      paymasterAndData:
        userOp.paymaster && userOp.paymasterData
          ? ((userOp.paymaster + userOp.paymasterData.slice(2)) as `0x${string}`)
          : userOp.paymaster
            ? (userOp.paymaster as `0x${string}`)
            : ("0x" as `0x${string}`),
      signature: userOp.signature as `0x${string}`,
    });

    return hash;
  }
}
