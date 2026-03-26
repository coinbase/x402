import { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import { getAddress, Hex } from "viem";
import { authorizationTypes } from "../../constants";
import { ClientEvmSigner } from "../../signer";
import { ExactEIP3009Payload, ExactERC7710Payload, ERC7710PaymentProvider } from "../../types";
import { createNonce } from "../../utils";

/**
 * Configuration for ExactEvmScheme client.
 *
 * At least one of `signer` or `erc7710Provider` must be provided.
 * If both are provided, ERC-7710 is preferred when facilitators are available.
 */
export interface ExactEvmSchemeClientConfig {
  /**
   * Traditional EVM signer for EIP-3009 payments.
   * Required unless erc7710Provider is provided.
   */
  signer?: ClientEvmSigner;

  /**
   * ERC-7710 payment provider for delegation-based payments.
   * When provided, 7710 payments are preferred over EIP-3009.
   *
   * The provider handles all 7710-specific logic including sub-delegation
   * from a root allowance. Implementations are provided by framework SDKs
   * (e.g., gator-sdk for MetaMask Delegation Framework).
   */
  erc7710Provider?: ERC7710PaymentProvider;
}

/**
 * EVM client implementation for the Exact payment scheme.
 * Supports both EIP-3009 (default) and ERC-7710 delegation-based payments.
 *
 * @example
 * ```typescript
 * // EIP-3009 only (traditional)
 * const scheme = new ExactEvmScheme({ signer: walletClient });
 *
 * // ERC-7710 only (delegation recipient)
 * const scheme = new ExactEvmScheme({ erc7710Provider: provider });
 *
 * // Hybrid (prefers 7710 when available)
 * const scheme = new ExactEvmScheme({ signer: walletClient, erc7710Provider: provider });
 * ```
 */
export class ExactEvmScheme implements SchemeNetworkClient {
  readonly scheme = "exact";
  private readonly signer?: ClientEvmSigner;
  private readonly erc7710Provider?: ERC7710PaymentProvider;

  /**
   * Creates a new ExactEvmScheme instance.
   *
   * @param config - Configuration with signer and/or ERC-7710 provider
   * @throws Error if neither signer nor erc7710Provider is provided
   */
  constructor(config: ExactEvmSchemeClientConfig) {
    if (!config.signer && !config.erc7710Provider) {
      throw new Error(
        "ExactEvmScheme requires either a signer (for EIP-3009) or an ERC7710PaymentProvider",
      );
    }
    this.signer = config.signer;
    this.erc7710Provider = config.erc7710Provider;
  }

  /**
   * Creates a payment payload for the Exact scheme.
   *
   * Payment method selection:
   * 1. If ERC-7710 provider is available AND facilitators are in requirements, use ERC-7710
   * 2. Otherwise, fall back to EIP-3009 if signer is available
   * 3. If 7710 provider throws and signer is available, fall back to EIP-3009
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @returns Promise resolving to a payment payload
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    // Check if facilitators are available for ERC-7710
    const facilitators = paymentRequirements.extra?.facilitators as Hex[] | undefined;

    // Prefer ERC-7710 if provider is available and facilitators are specified
    if (this.erc7710Provider && facilitators && facilitators.length > 0) {
      try {
        return await this.createERC7710Payload(x402Version, paymentRequirements, facilitators);
      } catch (error) {
        // If 7710 fails and we have a signer, fall back to EIP-3009
        if (this.signer) {
          console.warn("ERC-7710 payment failed, falling back to EIP-3009:", error);
          return this.createEIP3009Payload(x402Version, paymentRequirements);
        }
        // No fallback available, rethrow
        throw error;
      }
    }

    // Fall back to EIP-3009
    if (this.signer) {
      return this.createEIP3009Payload(x402Version, paymentRequirements);
    }

    // No payment method available
    throw new Error(
      "Cannot create payment: ERC-7710 requires facilitators in payment requirements, " +
        "and no EIP-3009 signer is configured",
    );
  }

  /**
   * Creates an EIP-3009 payment payload.
   */
  private async createEIP3009Payload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    if (!this.signer) {
      throw new Error("EIP-3009 payment requires a signer");
    }

    const nonce = createNonce();
    const now = Math.floor(Date.now() / 1000);

    const authorization: ExactEIP3009Payload["authorization"] = {
      from: this.signer.address,
      to: getAddress(paymentRequirements.payTo),
      value: paymentRequirements.amount,
      validAfter: (now - 600).toString(), // 10 minutes before
      validBefore: (now + paymentRequirements.maxTimeoutSeconds).toString(),
      nonce,
    };

    // Sign the authorization
    const signature = await this.signAuthorization(authorization, paymentRequirements);

    const payload: ExactEIP3009Payload = {
      authorization,
      signature,
    };

    return {
      x402Version,
      payload,
    };
  }

  /**
   * Creates an ERC-7710 delegation payment payload.
   * Uses the configured provider to create a sub-delegation for the payment.
   */
  private async createERC7710Payload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    facilitators: Hex[],
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    if (!this.erc7710Provider) {
      throw new Error("ERC-7710 payment requires an ERC7710PaymentProvider");
    }

    // Create the payment delegation via the provider
    const delegation = await this.erc7710Provider.createX402PaymentDelegation({
      redeemers: facilitators,
      payTo: getAddress(paymentRequirements.payTo) as Hex,
      asset: getAddress(paymentRequirements.asset) as Hex,
      amount: BigInt(paymentRequirements.amount),
      maxTimeoutSeconds: paymentRequirements.maxTimeoutSeconds,
    });

    // Validate that at least one redeemer was authorized
    if (!delegation.authorizedRedeemers || delegation.authorizedRedeemers.length === 0) {
      throw new Error("ERC-7710 provider did not authorize any redeemers");
    }

    const payload: ExactERC7710Payload = {
      delegationManager: delegation.delegationManager,
      permissionContext: delegation.permissionContext,
      delegator: this.erc7710Provider.delegator,
    };

    return {
      x402Version,
      payload,
    };
  }

  /**
   * Sign the EIP-3009 authorization using EIP-712
   *
   * @param authorization - The authorization to sign
   * @param requirements - The payment requirements
   * @returns Promise resolving to the signature
   */
  private async signAuthorization(
    authorization: ExactEIP3009Payload["authorization"],
    requirements: PaymentRequirements,
  ): Promise<`0x${string}`> {
    if (!this.signer) {
      throw new Error("Cannot sign authorization without a signer");
    }

    const chainId = parseInt(requirements.network.split(":")[1]);

    if (!requirements.extra?.name || !requirements.extra?.version) {
      throw new Error(
        `EIP-712 domain parameters (name, version) are required in payment requirements for asset ${requirements.asset}`,
      );
    }

    const { name, version } = requirements.extra;

    const domain = {
      name,
      version,
      chainId,
      verifyingContract: getAddress(requirements.asset),
    };

    const message = {
      from: getAddress(authorization.from),
      to: getAddress(authorization.to),
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    };

    return await this.signer.signTypedData({
      domain,
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization",
      message,
    });
  }
}
