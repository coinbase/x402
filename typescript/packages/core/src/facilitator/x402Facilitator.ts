import { x402Version } from "..";
import { SettleResponse, VerifyResponse } from "../types/facilitator";
import { SchemeNetworkFacilitator } from "../types/mechanisms";
import { PaymentPayload, PaymentRequirements } from "../types/payments";
import { Network } from "../types";
import { findByNetworkAndScheme } from "../utils";

/**
 * Facilitator client for the x402 payment protocol.
 * Manages payment scheme registration, verification, and settlement.
 */
export class x402Facilitator {
  private readonly registeredFacilitatorSchemes: Map<
    number,
    Map<string, Map<string, SchemeNetworkFacilitator>>
  > = new Map();
  private readonly schemeExtras: Map<
    number,
    Map<string, Map<string, Record<string, unknown> | (() => Record<string, unknown>)>>
  > = new Map();
  private readonly extensions: string[] = [];

  /**
   * Registers a scheme facilitator for the current x402 version.
   *
   * @param network - The network to register the facilitator for
   * @param facilitator - The scheme network facilitator to register
   * @param extra - Optional extra data (object or function) to include in /supported response
   * @returns The x402Facilitator instance for chaining
   */
  registerScheme(
    network: Network,
    facilitator: SchemeNetworkFacilitator,
    extra?: Record<string, unknown> | (() => Record<string, unknown>),
  ): x402Facilitator {
    return this._registerScheme(x402Version, network, facilitator, extra);
  }

  /**
   * Registers a scheme facilitator for x402 version 1.
   *
   * @param network - The network to register the facilitator for
   * @param facilitator - The scheme network facilitator to register
   * @param extra - Optional extra data (object or function) to include in /supported response
   * @returns The x402Facilitator instance for chaining
   */
  registerSchemeV1(
    network: Network,
    facilitator: SchemeNetworkFacilitator,
    extra?: Record<string, unknown> | (() => Record<string, unknown>),
  ): x402Facilitator {
    return this._registerScheme(1, network, facilitator, extra);
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
   * Builds /supported response with concrete networks.
   * Expands registered patterns (e.g., "eip155:*") into specific networks (e.g., "eip155:84532").
   *
   * @param networks - Array of concrete network identifiers to include in response
   * @returns Supported response with kinds and extensions
   */
  buildSupported(networks: Network[]): {
    kinds: Array<{
      x402Version: number;
      scheme: string;
      network: string;
      extra?: Record<string, unknown>;
    }>;
    extensions?: string[];
  } {
    const kinds: Array<{
      x402Version: number;
      scheme: string;
      network: string;
      extra?: Record<string, unknown>;
    }> = [];

    for (const concreteNetwork of networks) {
      for (const [version, networkMap] of this.registeredFacilitatorSchemes) {
        for (const [registeredPattern, schemeMap] of networkMap) {
          const patternRegex = new RegExp("^" + registeredPattern.replace("*", ".*") + "$");
          if (!patternRegex.test(concreteNetwork)) {
            continue;
          }

          for (const [scheme] of schemeMap) {
            const extraMap = this.schemeExtras.get(version)?.get(registeredPattern)?.get(scheme);
            const extra = typeof extraMap === "function" ? extraMap() : extraMap;

            kinds.push({
              x402Version: version,
              scheme,
              network: concreteNetwork,
              ...(extra && { extra }),
            });
          }
        }
      }
    }

    return {
      kinds,
      extensions: this.extensions.length > 0 ? this.extensions : undefined,
    };
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
   * @param extra - Optional extra data (object or function) to include in /supported response
   * @returns The x402Facilitator instance for chaining
   */
  private _registerScheme(
    x402Version: number,
    network: Network,
    facilitator: SchemeNetworkFacilitator,
    extra?: Record<string, unknown> | (() => Record<string, unknown>),
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

    if (extra) {
      if (!this.schemeExtras.has(x402Version)) {
        this.schemeExtras.set(x402Version, new Map());
      }
      const networkExtras = this.schemeExtras.get(x402Version)!;
      if (!networkExtras.has(network)) {
        networkExtras.set(network, new Map());
      }
      const schemeExtras = networkExtras.get(network)!;
      schemeExtras.set(facilitator.scheme, extra);
    }

    return this;
  }
}
