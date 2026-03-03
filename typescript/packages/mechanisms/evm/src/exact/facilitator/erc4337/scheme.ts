import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { BundlerClient } from "./bundler/client";
import type { Erc4337Payload } from "../../../erc4337/types";

/**
 * Configuration for the ERC-4337 facilitator
 */
export interface ExactEvmSchemeNetworkERC4337Config {
  /**
   * Default bundler URL to use if not provided in payload or requirements
   */
  defaultBundlerUrl?: string;

  /**
   * Timeout for receipt polling in milliseconds
   *
   * @default 30000
   */
  receiptPollTimeout?: number;

  /**
   * Interval for receipt polling in milliseconds
   *
   * @default 1000
   */
  receiptPollInterval?: number;
}

/**
 * Enhanced ExactEvmScheme facilitator that supports UserOperation (ERC-4337) payments.
 *
 * This facilitator implements the `SchemeNetworkFacilitator` interface and handles
 * verification and settlement of user operations through a bundler.
 */
export class ExactEvmSchemeNetworkERC4337 implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "eip155:*";
  private readonly config: Required<ExactEvmSchemeNetworkERC4337Config>;

  /**
   * Creates a new ExactEvmSchemeNetworkERC4337 instance.
   *
   * @param config - Optional facilitator configuration
   */
  constructor(config?: ExactEvmSchemeNetworkERC4337Config) {
    this.config = {
      defaultBundlerUrl: config?.defaultBundlerUrl ?? "",
      receiptPollTimeout: config?.receiptPollTimeout ?? 30_000,
      receiptPollInterval: config?.receiptPollInterval ?? 1_000,
    };
  }

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   *
   * @param _ - The network (unused)
   * @returns undefined as no extra data is needed
   */
  getExtra(_: Network): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Get signer addresses used by this facilitator.
   * For user operations, no facilitator signer is needed as the user signs the operation.
   *
   * @param _ - The network (unused)
   * @returns An empty array as no facilitator signer is needed
   */
  getSigners(_: string): string[] {
    return [];
  }

  /**
   * Verifies a payment payload containing a user operation.
   *
   * @param payload - The payment payload containing the user operation
   * @param requirements - The payment requirements to verify against
   * @returns The verification result
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const erc4337Payload = payload.payload as Erc4337Payload;

    if (!erc4337Payload.userOperation) {
      return {
        isValid: false,
        invalidReason: "missing_user_operation",
        payer: undefined,
      };
    }

    const userOp = erc4337Payload.userOperation;
    const payer = userOp.sender;

    // Get bundler URL from payload, requirements, or config
    const bundlerUrl =
      erc4337Payload.bundlerRpcUrl ??
      (requirements.extra?.userOperation as { bundlerUrl?: string } | undefined)?.bundlerUrl ??
      this.config.defaultBundlerUrl;

    if (!bundlerUrl) {
      return {
        isValid: false,
        invalidReason: "missing_bundler_url",
        payer,
      };
    }

    const entryPoint = erc4337Payload.entryPoint;
    if (!entryPoint) {
      return {
        isValid: false,
        invalidReason: "missing_entry_point",
        payer,
      };
    }

    // Verify by estimating gas through bundler
    try {
      const bundler = new BundlerClient(bundlerUrl);
      await bundler.estimateUserOperationGas(userOp, entryPoint);

      return {
        isValid: true,
        invalidReason: undefined,
        payer,
      };
    } catch (error) {
      return {
        isValid: false,
        invalidReason: (error as Error).message,
        payer,
      };
    }
  }

  /**
   * Settles a payment by sending the user operation to the bundler.
   *
   * @param payload - The payment payload containing the user operation
   * @param requirements - The payment requirements
   * @returns The settlement result
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const erc4337Payload = payload.payload as Erc4337Payload;

    // Re-verify before settling
    const verifyResult = await this.verify(payload, requirements);
    if (!verifyResult.isValid) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: verifyResult.invalidReason ?? "invalid",
        payer: verifyResult.payer,
      };
    }

    const userOp = erc4337Payload.userOperation;
    const payer = userOp.sender;

    // Get bundler URL
    const bundlerUrl =
      erc4337Payload.bundlerRpcUrl ??
      (requirements.extra?.userOperation as { bundlerUrl?: string } | undefined)?.bundlerUrl ??
      this.config.defaultBundlerUrl;

    if (!bundlerUrl) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: "missing_bundler_url",
        payer,
      };
    }

    const entryPoint = erc4337Payload.entryPoint;
    if (!entryPoint) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: "missing_entry_point",
        payer,
      };
    }

    try {
      const bundler = new BundlerClient(bundlerUrl);

      // Send user operation
      const userOpHash = await bundler.sendUserOperation(userOp, entryPoint);

      // Poll for receipt
      const deadline = Date.now() + this.config.receiptPollTimeout;
      let receipt = null;

      while (Date.now() < deadline) {
        receipt = await bundler.getUserOperationReceipt(userOpHash);
        if (receipt) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, this.config.receiptPollInterval));
      }

      // Extract transaction hash from receipt
      const txHash = receipt?.receipt?.transactionHash ?? receipt?.transactionHash ?? userOpHash;

      return {
        success: true,
        network: payload.accepted.network,
        transaction: txHash,
        payer,
        errorReason: undefined,
      };
    } catch (error) {
      return {
        success: false,
        network: payload.accepted.network,
        transaction: "",
        errorReason: (error as Error).message,
        payer,
      };
    }
  }
}
