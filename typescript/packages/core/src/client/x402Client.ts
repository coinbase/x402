import { x402Version } from "..";
import { SchemeNetworkClient } from "../types/mechanisms";
import { PaymentPayload, PaymentRequirements } from "../types/payments";
import { Network } from "../types";
import { findByNetworkAndScheme, findSchemesByNetwork } from "../utils";

export type SelectPaymentRequirements = (x402Version: number, paymentRequirements: PaymentRequirements[]) => PaymentRequirements;

/**
 *
 */
export class x402Client {
  private readonly paymentRequirementsSelector: SelectPaymentRequirements;
  private readonly registeredClientSchemes: Map<number, Map<string, Map<string, SchemeNetworkClient>>> = new Map();

  /**
   * Creates a new x402Client instance.
   *
   * @param paymentRequirementsSelector - Function to select payment requirements from available options
   */
  constructor(paymentRequirementsSelector?: SelectPaymentRequirements) {
    this.paymentRequirementsSelector = paymentRequirementsSelector || ((x402Version, accepts) => accepts[0]);
  }

  /**
   * Registers a scheme client for the current x402 version.
   *
   * @param network - The network to register the client for
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  registerScheme(network: Network, client: SchemeNetworkClient): x402Client {
    return this._registerScheme(x402Version, network, client);
  }

  /**
   * Registers a scheme client for x402 version 1.
   *
   * @param network - The network to register the client for
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  registerSchemeV1(network: Network, client: SchemeNetworkClient): x402Client {
    return this._registerScheme(1, network, client);
  }

  /**
   * Selects appropriate payment requirements based on registered clients.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - Array of available payment requirements
   * @returns The selected payment requirements
   */
  selectPaymentRequirements(x402Version: number, paymentRequirements: PaymentRequirements[]): PaymentRequirements {
    const clientSchemesByNetwork = this.registeredClientSchemes.get(x402Version);
    if (!clientSchemesByNetwork) {
      throw new Error(`No client registered for x402 version: ${x402Version}`);
    }

    const supportedPaymentRequirements = paymentRequirements.filter(requirement => {
      let clientSchemes = findSchemesByNetwork(clientSchemesByNetwork, requirement.network);
      if (!clientSchemes) {
        return false;
      }

      return clientSchemes.has(requirement.scheme);
    })

    if (supportedPaymentRequirements.length === 0) {
      throw new Error(`No network/scheme registered for x402 version: ${x402Version} which comply with the payment requirements. ${JSON.stringify({
        x402Version,
        paymentRequirements,
        x402Versions: Array.from(this.registeredClientSchemes.keys()),
        networks: Array.from(clientSchemesByNetwork.keys()),
        schemes: Array.from(clientSchemesByNetwork.values()).map(schemes => Array.from(schemes.keys())).flat(),
      })}`);
    }

    return this.paymentRequirementsSelector(x402Version, supportedPaymentRequirements);
  }

  /**
   * Creates a payment payload based on the requirements.
   *
   * @param x402Version - The x402 protocol version
   * @param requirements - The payment requirements
   * @param extensions - Optional extensions to include in the payload (from PaymentRequired)
   * @returns Promise resolving to the payment payload
   */
  async createPaymentPayload(
    x402Version: number,
    requirements: PaymentRequirements,
    extensions?: Record<string, unknown>
  ): Promise<PaymentPayload> {
    const clientSchemesByNetwork = this.registeredClientSchemes.get(x402Version);
    if (!clientSchemesByNetwork) {
      throw new Error(`No client registered for x402 version: ${x402Version}`);
    }

    const schemeNetworkClient = findByNetworkAndScheme(clientSchemesByNetwork, requirements.scheme, requirements.network);
    if (schemeNetworkClient) {
      const payload = await schemeNetworkClient.createPaymentPayload(x402Version, requirements);

      // Copy extensions from PaymentRequired into PaymentPayload
      if (extensions && Object.keys(extensions).length > 0) {
        payload.extensions = extensions;
      }

      return payload;
    }

    throw new Error(`No client registered for scheme: ${requirements.scheme} and network: ${requirements.network}`);
  }

  /**
   * Internal method to register a scheme client.
   *
   * @param x402Version - The x402 protocol version
   * @param network - The network to register the client for
   * @param client - The scheme network client to register
   * @returns The x402Client instance for chaining
   */
  private _registerScheme(x402Version: number, network: Network, client: SchemeNetworkClient): x402Client {
    if (!this.registeredClientSchemes.has(x402Version)) {
      this.registeredClientSchemes.set(x402Version, new Map());
    }
    const clientSchemesByNetwork = this.registeredClientSchemes.get(x402Version)!;
    if (!clientSchemesByNetwork.has(network)) {
      clientSchemesByNetwork.set(network, new Map());
    }

    const clientByScheme = clientSchemesByNetwork.get(network)!;
    if (!clientByScheme.has(client.scheme)) {
      clientByScheme.set(client.scheme, client);
    }

    return this;
  }
}