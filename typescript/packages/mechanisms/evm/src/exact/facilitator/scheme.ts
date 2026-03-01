import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactEvmPayloadV2, ExactEIP3009Payload, isPermit2Payload } from "../../types";
import { isErc4337Payload } from "../../erc4337/types";
import { verifyEIP3009, settleEIP3009 } from "./eip3009";
import { verifyPermit2, settlePermit2 } from "./permit2";
import { ExactEvmSchemeNetworkERC4337 } from "./erc4337/scheme";
import type { ExactEvmSchemeNetworkERC4337Config } from "./erc4337/scheme";

export interface ExactEvmSchemeConfig {
  /**
   * If enabled, the facilitator will deploy ERC-4337 smart wallets
   * via EIP-6492 when encountering undeployed contract signatures.
   *
   * @default false
   */
  deployERC4337WithEIP6492?: boolean;

  /**
   * Configuration for ERC-4337 UserOperation handling.
   * When provided, ERC-4337 payloads will be routed to the ERC-4337 facilitator.
   */
  erc4337Config?: ExactEvmSchemeNetworkERC4337Config;
}

/**
 * EVM facilitator implementation for the Exact payment scheme.
 * Thin router that delegates to EIP-3009 or Permit2 based on payload type.
 * All extension handling (EIP-2612, ERC-20 approval gas sponsoring) is owned
 * by the Permit2 functions via FacilitatorContext.
 */
export class ExactEvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "eip155:*";
  private readonly config: Required<Omit<ExactEvmSchemeConfig, "erc4337Config">>;
  private readonly erc4337Facilitator?: ExactEvmSchemeNetworkERC4337;

  /**
   * Creates a new ExactEvmScheme facilitator instance.
   *
   * @param signer - The EVM signer for facilitator operations
   * @param config - Optional configuration
   */
  constructor(
    private readonly signer: FacilitatorEvmSigner,
    config?: ExactEvmSchemeConfig,
  ) {
    this.config = {
      deployERC4337WithEIP6492: config?.deployERC4337WithEIP6492 ?? false,
    };
    if (config?.erc4337Config) {
      this.erc4337Facilitator = new ExactEvmSchemeNetworkERC4337(config.erc4337Config);
    }
  }

  /**
   * Returns undefined — EVM has no mechanism-specific extra data.
   *
   * @param _ - The network identifier (unused)
   * @returns undefined
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Returns facilitator wallet addresses for the supported response.
   *
   * @param _ - The network identifier (unused, addresses are network-agnostic)
   * @returns Array of facilitator wallet addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verifies a payment payload. Routes to Permit2 or EIP-3009 based on payload type.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @param context - Optional facilitator context for extension capabilities
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    const rawPayload = payload.payload;

    // Route ERC-4337 payloads to the ERC-4337 facilitator
    if (isErc4337Payload(rawPayload) && this.erc4337Facilitator) {
      return this.erc4337Facilitator.verify(payload, requirements);
    }

    const evmPayload = rawPayload as ExactEvmPayloadV2;

    if (isPermit2Payload(evmPayload)) {
      return verifyPermit2(this.signer, payload, requirements, evmPayload, context);
    }

    const eip3009Payload: ExactEIP3009Payload = evmPayload;
    return verifyEIP3009(this.signer, payload, requirements, eip3009Payload);
  }

  /**
   * Settles a payment. Routes to Permit2 or EIP-3009 based on payload type.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @param context - Optional facilitator context for extension capabilities
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    context?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const rawPayload = payload.payload;

    // Route ERC-4337 payloads to the ERC-4337 facilitator
    if (isErc4337Payload(rawPayload) && this.erc4337Facilitator) {
      return this.erc4337Facilitator.settle(payload, requirements);
    }

    const evmPayload = rawPayload as ExactEvmPayloadV2;

    if (isPermit2Payload(evmPayload)) {
      return settlePermit2(this.signer, payload, requirements, evmPayload, context);
    }

    const eip3009Payload: ExactEIP3009Payload = evmPayload;
    return settleEIP3009(this.signer, payload, requirements, eip3009Payload, this.config);
  }
}
