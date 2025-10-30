import { x402Version } from "..";
import { SettleResponse, VerifyResponse } from "../types/facilitator";
import { SchemeNetworkFacilitator } from "../types/mechanisms";
import { PaymentPayload, PaymentRequirements } from "../types/payments";
import { Network } from "../types";
import { findByNetworkAndScheme } from "../utils";

/**
 *
 */
export class x402Facilitator {
  // Mapping: x402Version -> network / pattern -> scheme -> SchemeNetworkFacilitator
  private readonly registeredFacilitatorSchemes: Map<
    number,
    Map<string, Map<string, SchemeNetworkFacilitator>>
  > = new Map();

  // Extensions this facilitator supports (e.g., "bazaar", "sign_in_with_x")
  private readonly extensions: string[] = [];

  /**
   * Registers a scheme facilitator for the current x402 version.
   *
   * @param network - The network to register the facilitator for
   * @param facilitator - The scheme network facilitator to register
   * @returns The x402Facilitator instance for chaining
   */
  registerScheme(network: Network, facilitator: SchemeNetworkFacilitator): x402Facilitator {
    return this._registerScheme(x402Version, network, facilitator);
  }

  /**
   * Registers a scheme facilitator for x402 version 1.
   *
   * @param network - The network to register the facilitator for
   * @param facilitator - The scheme network facilitator to register
   * @returns The x402Facilitator instance for chaining
   */
  registerSchemeV1(network: Network, facilitator: SchemeNetworkFacilitator): x402Facilitator {
    return this._registerScheme(1, network, facilitator);
  }

  /**
   * Registers a protocol extension.
   *
   * @param extension - The extension name to register (e.g., "bazaar", "sign_in_with_x")
   * @returns The x402Facilitator instance for chaining
   */
  registerExtension(extension: string): x402Facilitator {
    // Check if already registered
    if (!this.extensions.includes(extension)) {
      this.extensions.push(extension);
    }
    return this;
  }

  /**
   * Gets the list of registered extensions.
   *
   * @returns Array of extension names
   */
  getExtensions(): string[] {
    return [...this.extensions];
  }

  /**
   * Verifies a payment payload against requirements.
   *
   * @param paymentPayload - The payment payload to verify
   * @param paymentRequirements - The payment requirements to verify against
   * @returns Promise resolving to the verification response
   */
  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const facilitatorSchemesByNetwork = this.registeredFacilitatorSchemes.get(
      paymentPayload.x402Version,
    );
    if (!facilitatorSchemesByNetwork) {
      throw new Error(`No facilitator registered for x402 version: ${paymentPayload.x402Version}`);
    }

    const schemeNetworkFacilitator = findByNetworkAndScheme(
      facilitatorSchemesByNetwork,
      paymentRequirements.scheme,
      paymentRequirements.network,
    );
    if (schemeNetworkFacilitator) {
      return schemeNetworkFacilitator.verify(paymentPayload, paymentRequirements);
    }

    throw new Error(
      `No facilitator registered for scheme: ${paymentRequirements.scheme} and network: ${paymentRequirements.network}`,
    );
  }

  /**
   * Settles a payment based on the payload and requirements.
   *
   * @param paymentPayload - The payment payload to settle
   * @param paymentRequirements - The payment requirements for settlement
   * @returns Promise resolving to the settlement response
   */
  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const facilitatorSchemesByNetwork = this.registeredFacilitatorSchemes.get(
      paymentPayload.x402Version,
    );
    if (!facilitatorSchemesByNetwork) {
      throw new Error(`No facilitator registered for x402 version: ${paymentPayload.x402Version}`);
    }

    const schemeNetworkFacilitator = findByNetworkAndScheme(
      facilitatorSchemesByNetwork,
      paymentRequirements.scheme,
      paymentRequirements.network,
    );
    if (schemeNetworkFacilitator) {
      return schemeNetworkFacilitator.settle(paymentPayload, paymentRequirements);
    }
    throw new Error(
      `No facilitator registered for scheme: ${paymentRequirements.scheme} and network: ${paymentRequirements.network}`,
    );
  }

  /**
   * Internal method to register a scheme facilitator.
   *
   * @param x402Version - The x402 protocol version
   * @param network - The network to register the facilitator for
   * @param facilitator - The scheme network facilitator to register
   * @returns The x402Facilitator instance for chaining
   */
  private _registerScheme(
    x402Version: number,
    network: Network,
    facilitator: SchemeNetworkFacilitator,
  ): x402Facilitator {
    if (!this.registeredFacilitatorSchemes.has(x402Version)) {
      this.registeredFacilitatorSchemes.set(x402Version, new Map());
    }
    const networkFacilitatorSchemes = this.registeredFacilitatorSchemes.get(x402Version)!;
    if (!networkFacilitatorSchemes.has(network)) {
      networkFacilitatorSchemes.set(network, new Map());
    }
    const facilitatorByScheme = networkFacilitatorSchemes.get(network)!;
    if (!facilitatorByScheme.has(facilitator.scheme)) {
      facilitatorByScheme.set(facilitator.scheme, facilitator);
    }
    return this;
  }
}
