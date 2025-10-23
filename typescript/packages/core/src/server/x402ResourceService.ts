import { SettleResponse, VerifyResponse, SupportedResponse } from "../types/facilitator";
import {
  PaymentPayload,
  PaymentRequirements,
  PaymentRequired
} from "../types/payments";
import { SchemeNetworkService } from "../types/mechanisms";
import { Price, Network } from "../types";
import { deepEqual, findByNetworkAndScheme } from "../utils";
import { FacilitatorClient, HTTPFacilitatorClient } from "../http/httpFacilitatorClient";
import { x402Version } from "..";

/**
 * Configuration for a protected resource
 * Only contains payment-specific configuration, not resource metadata
 */
export interface ResourceConfig {
  scheme: string;
  payTo: string; // Payment recipient address
  price: Price;
  network: Network;
  maxTimeoutSeconds?: number;
}

/**
 * Resource information for PaymentRequired response
 */
export interface ResourceInfo {
  url: string;
  description: string;
  mimeType: string;
}


/**
 * Core x402 protocol server for resource protection
 * Transport-agnostic implementation of the x402 payment protocol
 */
export class x402ResourceService {
  private facilitatorClients: FacilitatorClient[];
  // Mapping: x402Version -> network -> scheme -> SupportedResponse | FacilitatorClient
  private registeredServerSchemes: Map<string, Map<string, SchemeNetworkService>> = new Map();
  private supportedResponsesMap: Map<number, Map<string, Map<string, SupportedResponse>>> = new Map();
  private facilitatorClientsMap: Map<number, Map<string, Map<string, FacilitatorClient>>> = new Map();

  constructor(
    facilitatorClients?: FacilitatorClient | FacilitatorClient[]
  ) {
    // Normalize facilitator clients to array
    if (!facilitatorClients) {
      // No clients provided, create a default HTTP client
      this.facilitatorClients = [new HTTPFacilitatorClient()];
    } else if (Array.isArray(facilitatorClients)) {
      // Array of clients provided
      this.facilitatorClients = facilitatorClients.length > 0
        ? facilitatorClients
        : [new HTTPFacilitatorClient()];
    } else {
      // Single client provided
      this.facilitatorClients = [facilitatorClients];
    }
  }

  /**
   * Register a scheme/network server implementation
   * 
   * @param server - The scheme/network server implementation
   */
  registerScheme(network: Network, server: SchemeNetworkService): x402ResourceService {
    if (!this.registeredServerSchemes.has(network)) {
      this.registeredServerSchemes.set(network, new Map());
    }

    const serverByScheme = this.registeredServerSchemes.get(network)!;
    if (!serverByScheme.has(server.scheme)) {
      serverByScheme.set(server.scheme, server);
    }

    return this;
  }

  /**
   * Initialize by fetching supported kinds from all facilitators
   * Creates mappings for supported responses and facilitator clients
   * Earlier facilitators in the array get precedence
   */
  async initialize(): Promise<void> {
    // Clear existing mappings
    this.supportedResponsesMap.clear();
    this.facilitatorClientsMap.clear();

    // Fetch supported kinds from all facilitator clients
    // Process in order to give precedence to earlier facilitators
    for (const facilitatorClient of this.facilitatorClients) {
      try {
        const supported = await facilitatorClient.getSupported();

        // Process each supported kind
        for (const kind of supported.kinds) {
          // Get or create version map for supported responses
          if (!this.supportedResponsesMap.has(kind.x402Version)) {
            this.supportedResponsesMap.set(kind.x402Version, new Map());
          }
          const responseVersionMap = this.supportedResponsesMap.get(kind.x402Version)!;

          // Get or create version map for facilitator clients
          if (!this.facilitatorClientsMap.has(kind.x402Version)) {
            this.facilitatorClientsMap.set(kind.x402Version, new Map());
          }
          const clientVersionMap = this.facilitatorClientsMap.get(kind.x402Version)!;

          // Get or create network map for responses
          if (!responseVersionMap.has(kind.network)) {
            responseVersionMap.set(kind.network, new Map());
          }
          const responseNetworkMap = responseVersionMap.get(kind.network)!;

          // Get or create network map for clients
          if (!clientVersionMap.has(kind.network)) {
            clientVersionMap.set(kind.network, new Map());
          }
          const clientNetworkMap = clientVersionMap.get(kind.network)!;

          // Only store if not already present (gives precedence to earlier facilitators)
          if (!responseNetworkMap.has(kind.scheme)) {
            responseNetworkMap.set(kind.scheme, supported);
            clientNetworkMap.set(kind.scheme, facilitatorClient);
          }
        }
      } catch (error) {
        // Log error but continue with other facilitators
        console.warn(`Failed to fetch supported kinds from facilitator: ${error}`);
      }
    }
  }

  /**
   * Get facilitator client for a specific version, network, and scheme
   * 
   * @param x402Version - The x402 version
   * @param network - The network identifier
   * @param scheme - The payment scheme
   * @returns The facilitator client or undefined if not found
   */
  private getFacilitatorClient(
    x402Version: number,
    network: Network,
    scheme: string
  ): FacilitatorClient | undefined {
    const versionMap = this.facilitatorClientsMap.get(x402Version);
    if (!versionMap) return undefined;

    // Use findByNetworkAndScheme for pattern matching
    return findByNetworkAndScheme(versionMap, scheme, network);
  }

  /**
   * Get supported kind for a specific version, network, and scheme
   * 
   * @param x402Version - The x402 version
   * @param network - The network identifier
   * @param scheme - The payment scheme
   * @returns The supported kind or undefined if not found
   */
  getSupportedKind(
    x402Version: number,
    network: Network,
    scheme: string
  ): SupportedResponse['kinds'][0] | undefined {
    const versionMap = this.supportedResponsesMap.get(x402Version);
    if (!versionMap) return undefined;

    const supportedResponse = findByNetworkAndScheme(versionMap, scheme, network);
    if (!supportedResponse) return undefined;

    // Find the specific kind from the response
    return supportedResponse.kinds.find(
      kind => kind.x402Version === x402Version &&
        kind.network === network &&
        kind.scheme === scheme
    );
  }

  /**
   * Get facilitator extensions for a specific version, network, and scheme
   * 
   * @param x402Version - The x402 version
   * @param network - The network identifier
   * @param scheme - The payment scheme
   * @returns The facilitator extensions or empty array if not found
   */
  getFacilitatorExtensions(
    x402Version: number,
    network: Network,
    scheme: string
  ): string[] {
    const versionMap = this.supportedResponsesMap.get(x402Version);
    if (!versionMap) return [];

    const supportedResponse = findByNetworkAndScheme(versionMap, scheme, network);
    return supportedResponse?.extensions || [];
  }

  /**
   * Build payment requirements for a protected resource
   * 
   * @param resourceConfig - Configuration for the protected resource
   * @returns Array of payment requirements
   */
  async buildPaymentRequirements(
    resourceConfig: ResourceConfig
  ): Promise<PaymentRequirements[]> {
    const requirements: PaymentRequirements[] = [];

    // Find the matching server implementation
    const scheme = resourceConfig.scheme;
    const SchemeNetworkService = findByNetworkAndScheme(
      this.registeredServerSchemes,
      scheme,
      resourceConfig.network
    );

    if (!SchemeNetworkService) {
      // Fallback to placeholder implementation if no server registered
      // TODO: Remove this fallback once implementations are registered
      console.warn(
        `No server implementation registered for scheme: ${scheme}, network: ${resourceConfig.network}`
      );
      return requirements;
    }

    // Find the matching supported kind from facilitator
    const supportedKind = this.getSupportedKind(
      x402Version,
      resourceConfig.network,
      SchemeNetworkService.scheme
    );

    if (!supportedKind) {
      throw new Error(
        `Facilitator does not support ${SchemeNetworkService.scheme} on ${resourceConfig.network}. ` +
        `Make sure to call initialize() to fetch supported kinds from facilitators.`
      );
    }

    // Get facilitator extensions for this combination
    const facilitatorExtensions = this.getFacilitatorExtensions(
      x402Version,
      resourceConfig.network,
      SchemeNetworkService.scheme
    );

    // Parse the price using the scheme's price parser
    const parsedPrice = SchemeNetworkService.parsePrice(resourceConfig.price, resourceConfig.network);

    // Build base payment requirements from resource config
    const baseRequirements: PaymentRequirements = {
      scheme: SchemeNetworkService.scheme,
      network: resourceConfig.network,
      amount: parsedPrice.amount,
      asset: parsedPrice.asset,
      payTo: resourceConfig.payTo,
      maxTimeoutSeconds: resourceConfig.maxTimeoutSeconds || 300, // Default 5 minutes
      extra: {
        ...parsedPrice.extra
      }
    };

    // Delegate to the implementation for scheme-specific enhancements
    const requirement = await SchemeNetworkService.enhancePaymentRequirements(
      baseRequirements,
      supportedKind,
      facilitatorExtensions
    );

    requirements.push(requirement);
    return requirements;
  }

  /**
   * Create a payment required response
   * 
   * @param error - Error message
   * @param requirements - Payment requirements
   * @param resourceInfo - Resource information
   * @param extensions - Optional extensions
   * @returns Payment required response object
   */
  createPaymentRequiredResponse(
    requirements: PaymentRequirements[],
    resourceInfo: ResourceInfo,
    error?: string,
    extensions?: Record<string, any>
  ): PaymentRequired {
    // V2 response with resource at top level
    const response: PaymentRequired = {
      x402Version: 2,
      error,
      resource: resourceInfo,
      accepts: requirements as PaymentRequirements[],
    };

    // Add extensions if provided
    if (extensions && Object.keys(extensions).length > 0) {
      response.extensions = extensions;
    }

    return response;
  }

  /**
   * Verify a payment against requirements
   * 
   * @param paymentPayload - The payment payload to verify
   * @param requirements - The payment requirements
   * @returns Verification response
   */
  async verifyPayment(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    // Find the facilitator that supports this payment type
    const facilitatorClient = this.getFacilitatorClient(
      paymentPayload.x402Version,
      requirements.network,
      requirements.scheme
    );

    if (!facilitatorClient) {
      // Fallback: try all facilitators if no specific support found
      let lastError: Error | undefined;

      for (const client of this.facilitatorClients) {
        try {
          return await client.verify(
            paymentPayload,
            requirements
          );
        } catch (error) {
          lastError = error as Error;
        }
      }

      throw lastError || new Error(
        `No facilitator supports ${requirements.scheme} on ${requirements.network} for v${paymentPayload.x402Version}`
      );
    }

    // Use the specific facilitator that supports this payment
    try {
      return await facilitatorClient.verify(
        paymentPayload,
        requirements
      );
    } catch (error) {
      throw new Error(
        `Facilitator failed to verify ${requirements.scheme} on ${requirements.network}: ${error}`
      );
    }
  }

  /**
   * Settle a verified payment
   * 
   * @param paymentPayload - The payment payload to settle
   * @param requirements - The payment requirements
   * @returns Settlement response
   */
  async settlePayment(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    // Find the facilitator that supports this payment type
    const facilitatorClient = this.getFacilitatorClient(
      paymentPayload.x402Version,
      requirements.network,
      requirements.scheme
    );

    if (!facilitatorClient) {
      // Fallback: try all facilitators if no specific support found
      let lastError: Error | undefined;

      for (const client of this.facilitatorClients) {
        try {
          return await client.settle(
            paymentPayload,
            requirements
          );
        } catch (error) {
          lastError = error as Error;
        }
      }

      throw lastError || new Error(
        `No facilitator supports ${requirements.scheme} on ${requirements.network} for v${paymentPayload.x402Version}`
      );
    }

    // Use the specific facilitator that supports this payment
    try {
      return await facilitatorClient.settle(
        paymentPayload,
        requirements
      );
    } catch (error) {
      throw new Error(
        `Facilitator failed to settle ${requirements.scheme} on ${requirements.network}: ${error}`
      );
    }
  }

  /**
   * Find matching payment requirements for a payment
   * 
   * @param availableRequirements - Array of available payment requirements
   * @param paymentPayload - The payment payload
   * @returns Matching payment requirements or undefined
   */
  findMatchingRequirements(
    availableRequirements: PaymentRequirements[],
    paymentPayload: PaymentPayload
  ): PaymentRequirements | undefined {
    switch (paymentPayload.x402Version) {
      case 2:
        // For v2, match by accepted requirements
        return availableRequirements.find(paymentRequirements =>
          deepEqual(paymentRequirements, paymentPayload.accepted)
        );
      case 1:
        // For v1, match by scheme and network
        return availableRequirements.find(req =>
          req.scheme === paymentPayload.scheme &&
          req.network === paymentPayload.network
        );
      default:
        throw new Error(`Unsupported x402 version: ${(paymentPayload as PaymentPayload).x402Version}`);
    }
  }


  /**
   * Process a payment request
   * 
   * @param paymentPayload - Optional payment payload if provided
   * @param resourceConfig - Configuration for the protected resource
   * @param resourceInfo - Information about the resource being accessed
   * @param extensions - Optional extensions to include in the response
   * @returns Processing result
   */
  async processPaymentRequest(
    paymentPayload: PaymentPayload | null,
    resourceConfig: ResourceConfig,
    resourceInfo: ResourceInfo,
    extensions?: Record<string, any>
  ): Promise<{
    success: boolean;
    requiresPayment?: PaymentRequired;
    verificationResult?: VerifyResponse;
    settlementResult?: SettleResponse;
    error?: string;
  }> {
    const requirements = await this.buildPaymentRequirements(resourceConfig);

    if (!paymentPayload) {
      return {
        success: false,
        requiresPayment: this.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          "Payment required",
          extensions
        )
      };
    }

    // Find matching requirements
    const matchingRequirements = this.findMatchingRequirements(requirements, paymentPayload);
    if (!matchingRequirements) {
      return {
        success: false,
        requiresPayment: this.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          "No matching payment requirements found",
          extensions
        )
      };
    }

    // Verify payment
    const verificationResult = await this.verifyPayment(paymentPayload, matchingRequirements);
    if (!verificationResult.isValid) {
      return {
        success: false,
        error: verificationResult.invalidReason,
        verificationResult
      };
    }

    // Payment verified, ready for settlement
    return {
      success: true,
      verificationResult
    };
  }
}

export default x402ResourceService;