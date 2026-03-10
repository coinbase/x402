import {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
} from "@x402/core/types";
import { ClientEvmSigner } from "../../signer";
import { PERMIT2_ADDRESS, erc20AllowanceAbi } from "../../constants";
import { getAddress } from "viem";
import { getEvmChainId } from "../../utils";
import { EIP2612_GAS_SPONSORING_KEY, ERC20_APPROVAL_GAS_SPONSORING_KEY } from "../extensions";
import { createUptoPermit2Payload } from "./permit2";
import { signEip2612Permit } from "../../exact/client/eip2612";
import { signErc20ApprovalTransaction } from "../../exact/client/erc20approval";
import { UptoEvmSchemeOptions, resolveExtensionRpcCapabilities } from "./rpc";

/**
 * EVM client implementation for the Upto payment scheme.
 * Handles Permit2-based payment payload creation and gas-sponsoring extensions.
 */
export class UptoEvmScheme implements SchemeNetworkClient {
  readonly scheme = "upto";

  /**
   * Creates a new UptoEvmScheme instance.
   *
   * @param signer - The EVM signer for client operations
   * @param options - Optional RPC configuration
   */
  constructor(
    private readonly signer: ClientEvmSigner,
    private readonly options?: UptoEvmSchemeOptions,
  ) {}

  /**
   * Creates a payment payload for the Upto scheme using Permit2.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @param context - Optional context with server-declared extensions
   * @returns Promise resolving to a payment payload result
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const result = await createUptoPermit2Payload(this.signer, x402Version, paymentRequirements);

    const eip2612Extensions = await this.trySignEip2612Permit(paymentRequirements, result, context);
    if (eip2612Extensions) {
      return { ...result, extensions: eip2612Extensions };
    }

    const erc20Extensions = await this.trySignErc20Approval(paymentRequirements, result, context);
    if (erc20Extensions) {
      return { ...result, extensions: erc20Extensions };
    }

    return result;
  }

  /**
   * Attempts to sign an EIP-2612 permit for gas sponsoring if supported.
   *
   * @param requirements - The payment requirements
   * @param result - The payment payload result to enrich
   * @param context - Optional context with server-declared extensions
   * @returns Promise resolving to extension data or undefined if not applicable
   */
  private async trySignEip2612Permit(
    requirements: PaymentRequirements,
    result: PaymentPayloadResult,
    context?: PaymentPayloadContext,
  ): Promise<Record<string, unknown> | undefined> {
    const capabilities = resolveExtensionRpcCapabilities(
      requirements.network,
      this.signer,
      this.options,
    );

    if (!capabilities.readContract) {
      return undefined;
    }

    if (!context?.extensions?.[EIP2612_GAS_SPONSORING_KEY]) {
      return undefined;
    }

    const tokenName = requirements.extra?.name as string | undefined;
    const tokenVersion = requirements.extra?.version as string | undefined;
    if (!tokenName || !tokenVersion) {
      return undefined;
    }

    const chainId = getEvmChainId(requirements.network);
    const tokenAddress = getAddress(requirements.asset) as `0x${string}`;

    try {
      const allowance = (await capabilities.readContract({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [this.signer.address, PERMIT2_ADDRESS],
      })) as bigint;

      if (allowance >= BigInt(requirements.amount)) {
        return undefined;
      }
    } catch {
      // Allowance check failed, proceed with signing
    }

    const permit2Auth = result.payload?.permit2Authorization as Record<string, unknown> | undefined;
    const deadline =
      (permit2Auth?.deadline as string) ??
      Math.floor(Date.now() / 1000 + requirements.maxTimeoutSeconds).toString();

    const info = await signEip2612Permit(
      {
        address: this.signer.address,
        signTypedData: msg => this.signer.signTypedData(msg),
        readContract: capabilities.readContract,
      },
      tokenAddress,
      tokenName,
      tokenVersion,
      chainId,
      deadline,
      requirements.amount,
    );

    return {
      [EIP2612_GAS_SPONSORING_KEY]: { info },
    };
  }

  /**
   * Attempts to sign an ERC-20 approval transaction for gas sponsoring if supported.
   *
   * @param requirements - The payment requirements
   * @param _result - The payment payload result (unused)
   * @param context - Optional context with server-declared extensions
   * @returns Promise resolving to extension data or undefined if not applicable
   */
  private async trySignErc20Approval(
    requirements: PaymentRequirements,
    _result: PaymentPayloadResult,
    context?: PaymentPayloadContext,
  ): Promise<Record<string, unknown> | undefined> {
    const capabilities = resolveExtensionRpcCapabilities(
      requirements.network,
      this.signer,
      this.options,
    );

    if (!capabilities.readContract) {
      return undefined;
    }

    if (!context?.extensions?.[ERC20_APPROVAL_GAS_SPONSORING_KEY]) {
      return undefined;
    }

    if (!capabilities.signTransaction || !capabilities.getTransactionCount) {
      return undefined;
    }

    const chainId = getEvmChainId(requirements.network);
    const tokenAddress = getAddress(requirements.asset) as `0x${string}`;

    try {
      const allowance = (await capabilities.readContract({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [this.signer.address, PERMIT2_ADDRESS],
      })) as bigint;

      if (allowance >= BigInt(requirements.amount)) {
        return undefined;
      }
    } catch {
      // Allowance check failed, proceed with signing
    }

    const info = await signErc20ApprovalTransaction(
      {
        address: this.signer.address,
        signTransaction: capabilities.signTransaction,
        getTransactionCount: capabilities.getTransactionCount,
        estimateFeesPerGas: capabilities.estimateFeesPerGas,
      },
      tokenAddress,
      chainId,
    );

    return {
      [ERC20_APPROVAL_GAS_SPONSORING_KEY]: { info },
    };
  }
}
