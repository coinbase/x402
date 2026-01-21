import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import {
  ExactEIP3009Payload,
  ExactEvmPayloadV2,
  ExactPermit2Payload,
  isPermit2Payload,
} from "../../types";
import { verifyEIP3009, settleEIP3009 } from "./eip3009";
import { verifyPermit2, settlePermit2 } from "./permit2";

export interface ExactEvmSchemeConfig {
  /**
   * If enabled, the facilitator will deploy ERC-4337 smart wallets
   * via EIP-6492 when encountering undeployed contract signatures.
   *
   * @default false
   */
  deployERC4337WithEIP6492?: boolean;
}

/**
 * EVM facilitator implementation for the Exact payment scheme.
 * Supports both EIP-3009 (transferWithAuthorization) and Permit2 flows.
 *
 * Routes to the appropriate verification and settlement method based on
 * the payload type (EIP-3009 or Permit2).
 */
export class ExactEvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "eip155:*";
  private readonly config: Required<ExactEvmSchemeConfig>;

  /**
   * Creates a new ExactEvmFacilitator instance.
   *
   * @param signer - The EVM signer for facilitator operations
   * @param config - Optional configuration for the facilitator
   */
  constructor(
    private readonly signer: FacilitatorEvmSigner,
    config?: ExactEvmSchemeConfig,
  ) {
    this.config = {
      deployERC4337WithEIP6492: config?.deployERC4337WithEIP6492 ?? false,
    };
  }

  /**
   * Get mechanism-specific extra data for the supported kinds endpoint.
   * For EVM, no extra data is needed.
   *
   * @param _ - The network identifier (unused for EVM)
   * @returns undefined (EVM has no extra data)
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Get signer addresses used by this facilitator.
   * Returns all addresses this facilitator can use for signing/settling transactions.
   *
   * @param _ - The network identifier (unused for EVM, addresses are network-agnostic)
   * @returns Array of facilitator wallet addresses
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verifies a payment payload.
   * Routes to EIP-3009 or Permit2 verification based on payload type.
   *
   * @param payload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Promise resolving to verification response
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const rawPayload = payload.payload as ExactEvmPayloadV2;

    if (isPermit2Payload(rawPayload)) {
      return verifyPermit2(this.signer, payload, requirements, rawPayload);
    }

    return verifyEIP3009(this.signer, payload, requirements, rawPayload as ExactEIP3009Payload);
  }

  /**
   * Settles a payment by executing the transfer.
   * Routes to EIP-3009 or Permit2 settlement based on payload type.
   *
   * @param payload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Promise resolving to settlement response
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const rawPayload = payload.payload as ExactEvmPayloadV2;

    if (isPermit2Payload(rawPayload)) {
      return settlePermit2(
        this.signer,
        payload,
        requirements,
        rawPayload as ExactPermit2Payload,
        () => verifyPermit2(this.signer, payload, requirements, rawPayload),
      );
    }

    const eip3009Payload = rawPayload as ExactEIP3009Payload;
    return settleEIP3009(
      this.signer,
      { deployERC4337WithEIP6492: this.config.deployERC4337WithEIP6492 },
      payload,
      requirements,
      eip3009Payload,
      () => verifyEIP3009(this.signer, payload, requirements, eip3009Payload),
    );
  }
}
