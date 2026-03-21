import {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
} from "@x402/core/types";
import { ClientEvmSigner } from "../../signer";
import { AssetTransferMethod } from "../../types";
import { PERMIT2_ADDRESS, erc20AllowanceAbi } from "../../constants";
import { getAddress } from "viem";
import { getEvmChainId } from "../../utils";
import { EIP2612_GAS_SPONSORING_KEY, ERC20_APPROVAL_GAS_SPONSORING_KEY } from "../extensions";
import { createEIP3009Payload } from "./eip3009";
import { createPermit2Payload } from "./permit2";
import { signEip2612Permit } from "./eip2612";
import { signErc20ApprovalTransaction } from "./erc20approval";
import { ExactEvmSchemeOptions, resolveExtensionRpcCapabilities } from "./rpc";

/**
 * EVM client implementation for the Exact payment scheme.
 * Supports both EIP-3009 (transferWithAuthorization) and Permit2 flows.
 *
 * Routes to the appropriate authorization method based on
 * `requirements.extra.assetTransferMethod`. Defaults to EIP-3009
 * for backward compatibility with older facilitators.
 *
 * When the server advertises `eip2612GasSponsoring` and the asset transfer
 * method is `permit2`, the scheme automatically signs an EIP-2612 permit
 * if the user lacks Permit2 approval. This requires `readContract` on the signer.
 */
export class ExactEvmScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Creates a new ExactEvmClient instance.
   *
   * @param signer - The EVM signer for client operations.
   *   Base flow only requires `address` + `signTypedData`.
   *   Extension enrichment (EIP-2612 / ERC-20 approval sponsoring) additionally
   *   requires optional capabilities like `readContract` and tx signing helpers.
   * @param options - Optional RPC configuration used to backfill extension capabilities.
   */
  constructor(
    private readonly signer: ClientEvmSigner,
    private readonly options?: ExactEvmSchemeOptions,
  ) {}

  /**
   * Creates a payment payload for the Exact scheme.
   * Routes to EIP-3009 or Permit2 based on requirements.extra.assetTransferMethod.
   *
   * For Permit2 flows, if the server advertises `eip2612GasSponsoring` and the
   * signer supports `readContract`, automatically signs an EIP-2612 permit
   * when Permit2 allowance is insufficient.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @param context - Optional context with server-declared extensions
   * @returns Promise resolving to a payment payload result (with optional extensions)
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const assetTransferMethod =
      (paymentRequirements.extra?.assetTransferMethod as AssetTransferMethod) ?? "eip3009";

    if (assetTransferMethod === "permit2") {
      const result = await createPermit2Payload(this.signer, x402Version, paymentRequirements);

      const eip2612Extensions = await this.trySignEip2612Permit(
        paymentRequirements,
        result,
        context,
      );

      if (eip2612Extensions) {
        return {
          ...result,
          extensions: eip2612Extensions,
        };
      }

      const erc20Extensions = await this.trySignErc20Approval(paymentRequirements, result, context);
      if (erc20Extensions) {
        return {
          ...result,
          extensions: erc20Extensions,
        };
      }

      return result;
    }

    return createEIP3009Payload(this.signer, x402Version, paymentRequirements);
  }

  /**
   * Attempts to sign an EIP-2612 permit for gasless Permit2 approval.
   *
   * Returns extension data if:
   * 1. Server advertises eip2612GasSponsoring
   * 2. Signer has readContract capability
   * 3. Current Permit2 allowance is insufficient
   *
   * Returns undefined if the extension should not be used.
   *
   * @param requirements - The payment requirements from the server
   * @param result - The payment payload result from the scheme
   * @param context - Optional context containing server extensions and metadata
   * @returns Extension data for EIP-2612 gas sponsoring, or undefined if not applicable
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
   * Attempts to sign an ERC-20 approval transaction for gasless Permit2 approval.
   *
   * This is the fallback path when the token does not support EIP-2612. The client
   * signs (but does not broadcast) a raw `approve(Permit2, MaxUint256)` transaction.
   * The facilitator broadcasts it atomically before settling.
   *
   * Returns extension data if:
   * 1. Server advertises erc20ApprovalGasSponsoring
   * 2. Signer has signTransaction + getTransactionCount capabilities
   * 3. Current Permit2 allowance is insufficient
   *
   * Returns undefined if the extension should not be used.
   *
   * @param requirements - The payment requirements from the server
   * @param _result - The payment payload result from the scheme (unused)
   * @param context - Optional context containing server extensions and metadata
   * @returns Extension data for ERC-20 approval gas sponsoring, or undefined if not applicable
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
