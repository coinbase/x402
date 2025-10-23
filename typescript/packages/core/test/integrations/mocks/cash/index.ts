import { x402Facilitator } from "../../../../src/facilitator";
import { FacilitatorClient } from "../../../../src/server";
import { SettleResponse, SupportedResponse, VerifyResponse } from "../../../../src/types/facilitator";
import { SchemeNetworkClient, SchemeNetworkFacilitator, SchemeNetworkService } from "../../../../src/types/mechanisms";
import { PaymentPayload, PaymentRequirements } from "../../../../src/types/payments";
import { Price, AssetAmount, Network } from "../../../../src/types";

export class CashSchemeNetworkClient implements SchemeNetworkClient {
  readonly scheme = "cash";

  constructor(private readonly payer: string) { }

  createPaymentPayload(x402Version: number, requirements: PaymentRequirements): Promise<PaymentPayload> {
    return Promise.resolve({
      x402Version: 2,
      scheme: requirements.scheme,
      network: requirements.network,
      payload: {
        signature: `~${this.payer}`,
        validUntil: (Date.now() + requirements.maxTimeoutSeconds).toString(),
        name: this.payer
      },
      accepted: requirements,
    });
  }
}

export class CashSchemeNetworkFacilitator implements SchemeNetworkFacilitator {
  readonly scheme = "cash";

  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    if (payload.payload.signature !== `~${payload.payload.name}`) {
      return Promise.resolve({
        isValid: false,
        invalidReason: "invalid_signature",
        payer: undefined,
      });
    }

    if (payload.payload.validUntil < Date.now().toString()) {
      return Promise.resolve({
        isValid: false,
        invalidReason: "expired_signature",
        payer: undefined,
      });
    }

    return Promise.resolve({
      isValid: true,
      invalidReason: undefined,
      payer: payload.payload.signature,
    });
  }

  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const verifyResponse = await this.verify(payload, requirements);
    if (!verifyResponse.isValid) {
      return {
        success: false,
        errorReason: verifyResponse.invalidReason,
        payer: verifyResponse.payer,
        transaction: "",
        network: requirements.network,
      };
    }

    return {
      success: true,
      errorReason: undefined,
      transaction: `${payload.payload.name} transferred ${requirements.amount} ${requirements.asset} to ${requirements.payTo}`,
      network: requirements.network,
      payer: payload.payload.signature,
    };
  }
}

export function buildCashPaymentRequirements(payTo: string, asset: string, amount: string): PaymentRequirements {
  return {
    scheme: "cash",
    network: "x402:cash",
    asset: asset,
    amount: amount,
    payTo: payTo,
    maxTimeoutSeconds: 1000,
    extra: {},
  };
}

export class CashSchemeNetworkService implements SchemeNetworkService {
  readonly scheme = "cash";

  parsePrice(price: Price, network: Network): AssetAmount {
    // Handle pre-parsed price object
    if (typeof price === 'object' && price !== null && 'amount' in price) {
      return {
        amount: price.amount,
        asset: price.asset || "USD",
        extra: {}
      };
    }

    // Parse string prices like "$10" or "10 USD"
    if (typeof price === 'string') {
      const cleanPrice = price.replace(/^\$/, '').replace(/\s+USD$/i, '').trim();
      return {
        amount: cleanPrice,
        asset: "USD",
        extra: {}
      };
    }

    // Handle number input
    if (typeof price === 'number') {
      return {
        amount: price.toString(),
        asset: "USD",
        extra: {}
      };
    }

    throw new Error(`Invalid price format: ${price}`);
  }

  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, any>;
    },
    facilitatorExtensions: string[]
  ): Promise<PaymentRequirements> {
    // Cash scheme doesn't need any special enhancements
    return paymentRequirements;
  }
}

export class CashFacilitatorClient implements FacilitatorClient {
  readonly scheme = "cash";
  readonly network = "x402:cash";
  readonly x402Version = 2;

  constructor(private readonly facilitator: x402Facilitator) {
  }

  verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  getSupported(): Promise<SupportedResponse> {
    return Promise.resolve({
      kinds: [{
        x402Version: this.x402Version,
        scheme: this.scheme,
        network: this.network,
        extra: {},
      }],
      extensions: [],
    });
  }
}