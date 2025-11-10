export interface NegotiationProposal {
  negotiationId: string;
  proposedAmount: string;
  maxAcceptable?: string;
  volume?: number;
  metadata?: {
    reputation?: string;
    previousCustomer?: boolean;
    [key: string]: any;
  };
  signature: string;
  proposer: string;
  nonce: string;
  deadline: number;
}

export type NegotiationStatus = 'accepted' | 'counter' | 'rejected';

export interface NegotiationResponse {
  negotiationId: string;
  status: NegotiationStatus;
  finalAmount?: string;
  counterAmount?: string;
  reason?: string;
  remainingIterations?: number;
  expiresAt?: string;
  settlementRequired?: boolean;
}

export interface NegotiatedPaymentRequirements {
  scheme: 'negotiated';
  network: string;
  baseAmount: string;
  minAcceptable: string;
  maxIterations: number;
  strategyHints?: {
    volumeDiscounts?: boolean;
    reputationAware?: boolean;
    demandBased?: boolean;
  };
  negotiationTimeout: number;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
}

export interface PricingContext {
  proposal: NegotiationProposal;
  clientAddress: string;
  resource: string;
  currentIteration?: number;
}

