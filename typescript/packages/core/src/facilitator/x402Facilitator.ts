import { x402Version } from "..";
import { SettleResponse, VerifyResponse, SupportedResponse } from "../types/facilitator";
import { SchemeNetworkFacilitator } from "../types/mechanisms";
import { PaymentPayload, PaymentRequirements } from "../types/payments";
import { Network } from "../types";
import { findByNetworkAndScheme } from "../utils";

export class x402Facilitator {
  // Mapping: x402Version -> network / pattern -> scheme -> SchemeNetworkFacilitator
  private readonly registeredFacilitatorSchemes: Map<number, Map<string, Map<string, SchemeNetworkFacilitator>>> = new Map();

  registerScheme(network: Network, facilitator: SchemeNetworkFacilitator): x402Facilitator {
    return this._registerScheme(x402Version, network, facilitator);
  }

  registerSchemeV1(network: Network, facilitator: SchemeNetworkFacilitator): x402Facilitator {
    return this._registerScheme(1, network, facilitator);
  }

  verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    const facilitatorSchemesByNetwork = this.registeredFacilitatorSchemes.get(paymentPayload.x402Version);
    if (!facilitatorSchemesByNetwork) {
      throw new Error(`No facilitator registered for x402 version: ${paymentPayload.x402Version}`);
    }

    const schemeNetworkFacilitator = findByNetworkAndScheme(facilitatorSchemesByNetwork, paymentRequirements.scheme, paymentRequirements.network);
    if (schemeNetworkFacilitator) {
      return schemeNetworkFacilitator.verify(paymentPayload, paymentRequirements);
    }

    throw new Error(`No facilitator registered for scheme: ${paymentRequirements.scheme} and network: ${paymentRequirements.network}`);
  }

  settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    const facilitatorSchemesByNetwork = this.registeredFacilitatorSchemes.get(paymentPayload.x402Version);
    if (!facilitatorSchemesByNetwork) {
      throw new Error(`No facilitator registered for x402 version: ${paymentPayload.x402Version}`);
    }

    const schemeNetworkFacilitator = findByNetworkAndScheme(facilitatorSchemesByNetwork, paymentRequirements.scheme, paymentRequirements.network);
    if (schemeNetworkFacilitator) {
      return schemeNetworkFacilitator.settle(paymentPayload, paymentRequirements);
    }
    throw new Error(`No facilitator registered for scheme: ${paymentRequirements.scheme} and network: ${paymentRequirements.network}`);
  }

  private _registerScheme(x402Version: number, network: Network, facilitator: SchemeNetworkFacilitator): x402Facilitator {
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
