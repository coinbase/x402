import { NegotiationResponse, PricingContext } from './types';

/**
 * Interface for pricing strategies used in negotiated payment schemes
 */
export interface PricingStrategy {
  /**
   * Evaluates a pricing proposal and returns a negotiation response
   * @param context - The pricing context containing proposal details
   * @returns Promise resolving to a negotiation response
   */
  evaluateProposal(context: PricingContext): Promise<NegotiationResponse>;

  /**
   * Gets the current base price for a resource
   * @param resource - The resource path
   * @returns Promise resolving to the base price as a string
   */
  getCurrentBasePrice(resource: string): Promise<string>;
}

/**
 * Simple range-based pricing strategy
 * Accepts proposals above minimum, rejects very low offers, counter-offers in between
 */
export class RangeBasedStrategy implements PricingStrategy {
  constructor(
    private basePrice: string,
    private minAcceptable: string,
    private maxIterations: number = 3
  ) {}

  async evaluateProposal(context: PricingContext): Promise<NegotiationResponse> {
    const proposed = parseFloat(context.proposal.proposedAmount);
    const min = parseFloat(this.minAcceptable);
    const base = parseFloat(this.basePrice);

    if (proposed >= min) {
      return {
        negotiationId: context.proposal.negotiationId,
        status: 'accepted',
        finalAmount: context.proposal.proposedAmount,
        settlementRequired: true
      };
    }

    if (proposed < min * 0.5) {
      return {
        negotiationId: context.proposal.negotiationId,
        status: 'rejected',
        reason: 'Offer significantly below acceptable range',
      };
    }

    const counter = ((proposed + base) / 2).toFixed(6);
    return {
      negotiationId: context.proposal.negotiationId,
      status: 'counter',
      counterAmount: counter,
      reason: 'Please consider our counter-offer',
      remainingIterations: this.maxIterations - (context.currentIteration || 1),
    };
  }

  async getCurrentBasePrice(_resource: string): Promise<string> {
    return this.basePrice;
  }
}

/**
 * Volume-based pricing strategy
 * Offers discounts based on purchase volume
 */
export class VolumeBasedStrategy implements PricingStrategy {
  constructor(
    private basePrice: string,
    private minAcceptable: string,
    private volumeDiscounts: Map<number, number> = new Map([
      [10, 0.95], // 5% discount for 10+
      [50, 0.90], // 10% discount for 50+
      [100, 0.85], // 15% discount for 100+
    ])
  ) {}

  async evaluateProposal(context: PricingContext): Promise<NegotiationResponse> {
    const proposed = parseFloat(context.proposal.proposedAmount);
    const base = parseFloat(this.basePrice);
    const volume = context.proposal.volume || 1;

    // Calculate volume-adjusted price
    let multiplier = 1.0;
    for (const [threshold, discount] of Array.from(this.volumeDiscounts.entries()).sort((a, b) => b[0] - a[0])) {
      if (volume >= threshold) {
        multiplier = discount;
        break;
      }
    }

    const volumeAdjustedPrice = base * multiplier;
    const min = parseFloat(this.minAcceptable);

    if (proposed >= volumeAdjustedPrice) {
      return {
        negotiationId: context.proposal.negotiationId,
        status: 'accepted',
        finalAmount: context.proposal.proposedAmount,
        settlementRequired: true
      };
    }

    if (proposed < min) {
      return {
        negotiationId: context.proposal.negotiationId,
        status: 'counter',
        counterAmount: volumeAdjustedPrice.toFixed(6),
        reason: `Volume discount applied: ${((1 - multiplier) * 100).toFixed(0)}% off`,
        remainingIterations: 2,
      };
    }

    return {
      negotiationId: context.proposal.negotiationId,
      status: 'rejected',
      reason: 'Offer below minimum acceptable price',
    };
  }

  async getCurrentBasePrice(_resource: string): Promise<string> {
    return this.basePrice;
  }
}

