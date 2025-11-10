import { NegotiationProposal } from './types';
import { safeBase64Encode, safeBase64Decode } from '../../../shared/base64';

/**
 * Creates a negotiation proposal payload
 * @param options - The proposal options
 * @returns A negotiation proposal object
 */
export function createNegotiationProposal(options: {
  negotiationId: string;
  proposedAmount: string;
  proposer: string;
  nonce: string;
  deadline: number;
  maxAcceptable?: string;
  volume?: number;
  metadata?: Record<string, any>;
  signature: string;
}): NegotiationProposal {
  return {
    negotiationId: options.negotiationId,
    proposedAmount: options.proposedAmount,
    proposer: options.proposer,
    nonce: options.nonce,
    deadline: options.deadline,
    maxAcceptable: options.maxAcceptable,
    volume: options.volume,
    metadata: options.metadata,
    signature: options.signature,
  };
}

/**
 * Encodes a negotiation proposal into an X-PAYMENT header
 * @param proposal - The negotiation proposal
 * @param network - The network identifier
 * @returns Base64-encoded payment header
 */
export function encodeNegotiationPayment(
  proposal: NegotiationProposal,
  network: string
): string {
  const payload = {
    x402Version: 1,
    scheme: 'negotiated',
    network,
    payload: proposal,
  };

  return safeBase64Encode(JSON.stringify(payload));
}

/**
 * Decodes a negotiation payment header
 * @param header - Base64-encoded X-PAYMENT header
 * @returns Decoded negotiation proposal
 */
export function decodeNegotiationPayment(header: string): {
  x402Version: number;
  scheme: string;
  network: string;
  payload: NegotiationProposal;
} {
  const decoded = safeBase64Decode(header);
  return JSON.parse(decoded);
}

/**
 * Validates a negotiation proposal
 * @param proposal - The proposal to validate
 * @returns true if valid, error message if invalid
 */
export function validateProposal(proposal: NegotiationProposal): true | string {
  if (!proposal.negotiationId) {
    return 'Missing negotiationId';
  }
  
  if (!proposal.proposedAmount || isNaN(parseFloat(proposal.proposedAmount))) {
    return 'Invalid proposedAmount';
  }

  if (!proposal.proposer || !/^0x[0-9a-fA-F]{40}$/.test(proposal.proposer)) {
    return 'Invalid proposer address';
  }

  if (!proposal.signature || !/^0x[0-9a-fA-F]+$/.test(proposal.signature)) {
    return 'Invalid signature';
  }

  if (!proposal.deadline || proposal.deadline < Date.now() / 1000) {
    return 'Proposal deadline has passed';
  }

  return true;
}

