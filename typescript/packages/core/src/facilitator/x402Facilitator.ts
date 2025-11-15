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
  timestamp: number;
  requestMetadata?: Record<string, unknown>;
}

export interface FacilitatorVerifyResultContext extends FacilitatorVerifyContext {
  result: VerifyResponse;
  duration: number;
}

export interface FacilitatorVerifyFailureContext extends FacilitatorVerifyContext {
  error: Error;
  duration: number;
}

export interface FacilitatorSettleContext {
  paymentPayload: PaymentPayload;
  requirements: PaymentRequirements;
  timestamp: number;
  requestMetadata?: Record<string, unknown>;
}

export interface FacilitatorSettleResultContext extends FacilitatorSettleContext {
  result: SettleResponse;
  duration: number;
}

export interface FacilitatorSettleFailureContext extends FacilitatorSettleContext {
  error: Error;
  duration: number;
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
  private readonly schemeExtras: Map<
    number,
    Map<string, Map<string, Record<string, unknown> | (() => Record<string, unknown>)>>
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
   * @param metadata - Optional metadata to pass to hooks
   * @returns Promise resolving to the verification response
   */
  async verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
    metadata?: Record<string, unknown>,
  ): Promise<VerifyResponse> {
    const startTime = Date.now();
    const context: FacilitatorVerifyContext = {
      paymentPayload,
      requirements: paymentRequirements,
      timestamp: startTime,
      requestMetadata: metadata,
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
      const duration = Date.now() - startTime;

      // Execute afterVerify hooks
      const resultContext: FacilitatorVerifyResultContext = {
        ...context,
        result: verifyResult,
        duration,
      };

      for (const hook of this.afterVerifyHooks) {
        await hook(resultContext);
      }

      return verifyResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const failureContext: FacilitatorVerifyFailureContext = {
        ...context,
        error: error as Error,
        duration,
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
   * @param metadata - Optional metadata to pass to hooks
   * @returns Promise resolving to the settlement response
   */
  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
    metadata?: Record<string, unknown>,
  ): Promise<SettleResponse> {
    const startTime = Date.now();
    const context: FacilitatorSettleContext = {
      paymentPayload,
      requirements: paymentRequirements,
      timestamp: startTime,
      requestMetadata: metadata,
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
      const duration = Date.now() - startTime;

      // Execute afterSettle hooks
      const resultContext: FacilitatorSettleResultContext = {
        ...context,
        result: settleResult,
        duration,
      };

      for (const hook of this.afterSettleHooks) {
        await hook(resultContext);
      }

      return settleResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      const failureContext: FacilitatorSettleFailureContext = {
        ...context,
        error: error as Error,
        duration,
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
