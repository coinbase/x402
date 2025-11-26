import { x402Version } from "..";
import { SettleResponse, VerifyResponse } from "../types/facilitator";
import { SchemeNetworkFacilitator } from "../types/mechanisms";
import { PaymentPayload, PaymentRequirements } from "../types/payments";
import { Network } from "../types";
import { findByNetworkAndScheme } from "../utils";

/**
 * Facilitator Hook Context Interfaces
 */

export interface FacilitatorVerifyContext {
  paymentPayload: PaymentPayload;
  requirements: PaymentRequirements;
}

export interface FacilitatorVerifyResultContext extends FacilitatorVerifyContext {
  result: VerifyResponse;
}

export interface FacilitatorVerifyFailureContext extends FacilitatorVerifyContext {
  error: Error;
}

export interface FacilitatorSettleContext {
  paymentPayload: PaymentPayload;
  requirements: PaymentRequirements;
}

export interface FacilitatorSettleResultContext extends FacilitatorSettleContext {
  result: SettleResponse;
}

export interface FacilitatorSettleFailureContext extends FacilitatorSettleContext {
  error: Error;
}

/**
 * Facilitator Hook Type Definitions
 */

export type FacilitatorBeforeVerifyHook = (
  context: FacilitatorVerifyContext,
) => Promise<void | { abort: true; reason: string }>;

export type FacilitatorAfterVerifyHook = (context: FacilitatorVerifyResultContext) => Promise<void>;

export type FacilitatorOnVerifyFailureHook = (
  context: FacilitatorVerifyFailureContext,
) => Promise<void | { recovered: true; result: VerifyResponse }>;

export type FacilitatorBeforeSettleHook = (
  context: FacilitatorSettleContext,
) => Promise<void | { abort: true; reason: string }>;

export type FacilitatorAfterSettleHook = (context: FacilitatorSettleResultContext) => Promise<void>;

export type FacilitatorOnSettleFailureHook = (
  context: FacilitatorSettleFailureContext,
) => Promise<void | { recovered: true; result: SettleResponse }>;

/**
 * Facilitator client for the x402 payment protocol.
 * Manages payment scheme registration, verification, and settlement.
 */
export class x402Facilitator {
  private readonly registeredFacilitatorSchemes: Map<
    number,
    Map<string, Map<string, SchemeNetworkFacilitator>>
  > = new Map();
  private readonly extensions: string[] = [];

  private beforeVerifyHooks: FacilitatorBeforeVerifyHook[] = [];
  private afterVerifyHooks: FacilitatorAfterVerifyHook[] = [];
  private onVerifyFailureHooks: FacilitatorOnVerifyFailureHook[] = [];
  private beforeSettleHooks: FacilitatorBeforeSettleHook[] = [];
  private afterSettleHooks: FacilitatorAfterSettleHook[] = [];
  private onSettleFailureHooks: FacilitatorOnSettleFailureHook[] = [];

  /**
   * Registers a scheme facilitator for the current x402 version.
   *
   * @param network - The network to register the facilitator for
   * @param facilitator - The scheme network facilitator to register
   * @returns The x402Facilitator instance for chaining
   */
  register(network: Network, facilitator: SchemeNetworkFacilitator): x402Facilitator {
    return this._registerScheme(x402Version, network, facilitator);
  }

  /**
   * Registers a scheme facilitator for x402 version 1.
   *
   * @param network - The network to register the facilitator for
   * @param facilitator - The scheme network facilitator to register
   * @returns The x402Facilitator instance for chaining
   */
  registerV1(network: Network, facilitator: SchemeNetworkFacilitator): x402Facilitator {
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
   * Register a hook to execute before facilitator payment verification.
   * Can abort verification by returning { abort: true, reason: string }
   *
   * @param hook - The hook function to register
   * @returns The x402Facilitator instance for chaining
   */
  onBeforeVerify(hook: FacilitatorBeforeVerifyHook): x402Facilitator {
    this.beforeVerifyHooks.push(hook);
    return this;
  }

  /**
   * Register a hook to execute after successful facilitator payment verification.
   *
   * @param hook - The hook function to register
   * @returns The x402Facilitator instance for chaining
   */
  onAfterVerify(hook: FacilitatorAfterVerifyHook): x402Facilitator {
    this.afterVerifyHooks.push(hook);
    return this;
  }

  /**
   * Register a hook to execute when facilitator payment verification fails.
   * Can recover from failure by returning { recovered: true, result: VerifyResponse }
   *
   * @param hook - The hook function to register
   * @returns The x402Facilitator instance for chaining
   */
  onVerifyFailure(hook: FacilitatorOnVerifyFailureHook): x402Facilitator {
    this.onVerifyFailureHooks.push(hook);
    return this;
  }

  /**
   * Register a hook to execute before facilitator payment settlement.
   * Can abort settlement by returning { abort: true, reason: string }
   *
   * @param hook - The hook function to register
   * @returns The x402Facilitator instance for chaining
   */
  onBeforeSettle(hook: FacilitatorBeforeSettleHook): x402Facilitator {
    this.beforeSettleHooks.push(hook);
    return this;
  }

  /**
   * Register a hook to execute after successful facilitator payment settlement.
   *
   * @param hook - The hook function to register
   * @returns The x402Facilitator instance for chaining
   */
  onAfterSettle(hook: FacilitatorAfterSettleHook): x402Facilitator {
    this.afterSettleHooks.push(hook);
    return this;
  }

  /**
   * Register a hook to execute when facilitator payment settlement fails.
   * Can recover from failure by returning { recovered: true, result: SettleResponse }
   *
   * @param hook - The hook function to register
   * @returns The x402Facilitator instance for chaining
   */
  onSettleFailure(hook: FacilitatorOnSettleFailureHook): x402Facilitator {
    this.onSettleFailureHooks.push(hook);
    return this;
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

          for (const [scheme, facilitator] of schemeMap) {
            const extra = facilitator.getExtra(concreteNetwork);

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
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const context: FacilitatorVerifyContext = {
      paymentPayload,
      requirements: paymentRequirements,
    };

    // Execute beforeVerify hooks
    for (const hook of this.beforeVerifyHooks) {
      const result = await hook(context);
      if (result && "abort" in result && result.abort) {
        return {
          isValid: false,
          invalidReason: result.reason,
        };
      }
    }

    try {
      const facilitatorSchemesByNetwork = this.registeredFacilitatorSchemes.get(
        paymentPayload.x402Version,
      );
      if (!facilitatorSchemesByNetwork) {
        throw new Error(
          `No facilitator registered for x402 version: ${paymentPayload.x402Version}`,
        );
      }

      const schemeNetworkFacilitator = findByNetworkAndScheme(
        facilitatorSchemesByNetwork,
        paymentRequirements.scheme,
        paymentRequirements.network,
      );
      if (!schemeNetworkFacilitator) {
        throw new Error(
          `No facilitator registered for scheme: ${paymentRequirements.scheme} and network: ${paymentRequirements.network}`,
        );
      }

      const verifyResult = await schemeNetworkFacilitator.verify(
        paymentPayload,
        paymentRequirements,
      );

      // Execute afterVerify hooks
      const resultContext: FacilitatorVerifyResultContext = {
        ...context,
        result: verifyResult,
      };

      for (const hook of this.afterVerifyHooks) {
        await hook(resultContext);
      }

      return verifyResult;
    } catch (error) {
      const failureContext: FacilitatorVerifyFailureContext = {
        ...context,
        error: error as Error,
      };

      // Execute onVerifyFailure hooks
      for (const hook of this.onVerifyFailureHooks) {
        const result = await hook(failureContext);
        if (result && "recovered" in result && result.recovered) {
          return result.result;
        }
      }

      throw error;
    }
  }

  /**
   * Settles a payment based on the payload and requirements.
   *
   * @param paymentPayload - The payment payload to settle
   * @param paymentRequirements - The payment requirements for settlement
   * @returns Promise resolving to the settlement response
   */
  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const context: FacilitatorSettleContext = {
      paymentPayload,
      requirements: paymentRequirements,
    };

    // Execute beforeSettle hooks
    for (const hook of this.beforeSettleHooks) {
      const result = await hook(context);
      if (result && "abort" in result && result.abort) {
        throw new Error(`Settlement aborted: ${result.reason}`);
      }
    }

    try {
      const facilitatorSchemesByNetwork = this.registeredFacilitatorSchemes.get(
        paymentPayload.x402Version,
      );
      if (!facilitatorSchemesByNetwork) {
        throw new Error(
          `No facilitator registered for x402 version: ${paymentPayload.x402Version}`,
        );
      }

      const schemeNetworkFacilitator = findByNetworkAndScheme(
        facilitatorSchemesByNetwork,
        paymentRequirements.scheme,
        paymentRequirements.network,
      );
      if (!schemeNetworkFacilitator) {
        throw new Error(
          `No facilitator registered for scheme: ${paymentRequirements.scheme} and network: ${paymentRequirements.network}`,
        );
      }

      const settleResult = await schemeNetworkFacilitator.settle(
        paymentPayload,
        paymentRequirements,
      );

      // Execute afterSettle hooks
      const resultContext: FacilitatorSettleResultContext = {
        ...context,
        result: settleResult,
      };

      for (const hook of this.afterSettleHooks) {
        await hook(resultContext);
      }

      return settleResult;
    } catch (error) {
      const failureContext: FacilitatorSettleFailureContext = {
        ...context,
        error: error as Error,
      };

      // Execute onSettleFailure hooks
      for (const hook of this.onSettleFailureHooks) {
        const result = await hook(failureContext);
        if (result && "recovered" in result && result.recovered) {
          return result.result;
        }
      }

      throw error;
    }
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
