import {
  PaymentRequirements,
  SchemeNetworkClient,
  PaymentPayloadResult,
  PaymentPayloadContext,
} from "@x402/core/types";
import { EIP2612_GAS_SPONSORING } from "@x402/extensions";
import { ClientEvmSigner } from "../../signer";
import { AssetTransferMethod } from "../../types";
import { PERMIT2_ADDRESS } from "../../constants";
import { getAddress } from "viem";
import { createEIP3009Payload } from "./eip3009";
import { createPermit2Payload } from "./permit2";
import { signEip2612Permit } from "./eip2612";

/** ERC20 allowance ABI for checking Permit2 approval */
const erc20AllowanceAbi = [
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

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
   *   Must support `readContract` for EIP-2612 gas sponsoring.
   *   Use `createWalletClient(...).extend(publicActions)` or `toClientEvmSigner(account, publicClient)`.
   */
  constructor(private readonly signer: ClientEvmSigner) {}

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

      // Check if EIP-2612 gas sponsoring is advertised and we can handle it
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
    // Check if server advertises eip2612GasSponsoring
    if (!context?.extensions?.[EIP2612_GAS_SPONSORING]) {
      return undefined;
    }

    // Check that required token metadata is available
    const tokenName = requirements.extra?.name as string | undefined;
    const tokenVersion = requirements.extra?.version as string | undefined;
    if (!tokenName || !tokenVersion) {
      return undefined;
    }

    const chainId = parseInt(requirements.network.split(":")[1]);
    const tokenAddress = getAddress(requirements.asset) as `0x${string}`;

    // Check if user already has sufficient Permit2 allowance
    try {
      const allowance = (await this.signer.readContract({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [this.signer.address, PERMIT2_ADDRESS],
      })) as bigint;

      if (allowance >= BigInt(requirements.amount)) {
        return undefined; // Already approved, no need for EIP-2612
      }
    } catch {
      // If we can't check allowance, proceed with EIP-2612 signing
    }

    // Use the same deadline as the Permit2 authorization
    const permit2Auth = result.payload?.permit2Authorization as Record<string, unknown> | undefined;
    const deadline =
      (permit2Auth?.deadline as string) ??
      Math.floor(Date.now() / 1000 + requirements.maxTimeoutSeconds).toString();

    // Sign the EIP-2612 permit
    const info = await signEip2612Permit(
      this.signer,
      tokenAddress,
      tokenName,
      tokenVersion,
      chainId,
      deadline,
    );

    return {
      [EIP2612_GAS_SPONSORING]: { info },
    };
  }
}
