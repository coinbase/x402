import { describe, it, expect } from 'vitest';
import {
  createNegotiationProposal,
  encodeNegotiationPayment,
  decodeNegotiationPayment,
  validateProposal
} from './client';

describe('Negotiated Client Functions', () => {
  describe('createNegotiationProposal', () => {
    it('should create a valid negotiation proposal', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-neg-123',
        proposedAmount: '0.07',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: '0x' + '0'.repeat(130)
      });

      expect(proposal.negotiationId).toBe('test-neg-123');
      expect(proposal.proposedAmount).toBe('0.07');
      expect(proposal.proposer).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8');
    });

    it('should include optional metadata', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-neg-123',
        proposedAmount: '0.07',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: '0x' + '0'.repeat(130),
        volume: 100,
        metadata: { reputation: '0xabc123' }
      });

      expect(proposal.volume).toBe(100);
      expect(proposal.metadata?.reputation).toBe('0xabc123');
    });
  });

  describe('encodeNegotiationPayment', () => {
    it('should encode proposal to base64', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-123',
        proposedAmount: '0.07',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: '0x' + '0'.repeat(130)
      });

      const encoded = encodeNegotiationPayment(proposal, 'base-sepolia');
      expect(encoded).toBeTruthy();
      expect(typeof encoded).toBe('string');
    });
  });

  describe('decodeNegotiationPayment', () => {
    it('should decode payment header', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-123',
        proposedAmount: '0.07',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: '0x' + '0'.repeat(130)
      });

      const encoded = encodeNegotiationPayment(proposal, 'base-sepolia');
      const decoded = decodeNegotiationPayment(encoded);

      expect(decoded.x402Version).toBe(1);
      expect(decoded.scheme).toBe('negotiated');
      expect(decoded.network).toBe('base-sepolia');
      expect(decoded.payload.negotiationId).toBe('test-123');
    });
  });

  describe('validateProposal', () => {
    it('should validate a correct proposal', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-123',
        proposedAmount: '0.07',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: '0x' + '0'.repeat(130)
      });

      const result = validateProposal(proposal);
      expect(result).toBe(true);
    });

    it('should reject proposal without negotiationId', () => {
      const proposal = {
        proposedAmount: '0.07',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: '0x' + '0'.repeat(130)
      } as any;

      const result = validateProposal(proposal);
      expect(result).toContain('negotiationId');
    });

    it('should reject proposal with invalid proposedAmount', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-123',
        proposedAmount: 'invalid',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: '0x' + '0'.repeat(130)
      });

      const result = validateProposal(proposal);
      expect(result).toContain('proposedAmount');
    });

    it('should reject proposal with invalid proposer address', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-123',
        proposedAmount: '0.07',
        proposer: 'invalid-address',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: '0x' + '0'.repeat(130)
      });

      const result = validateProposal(proposal);
      expect(result).toContain('proposer');
    });

    it('should reject expired proposal', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-123',
        proposedAmount: '0.07',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) - 10,
        signature: '0x' + '0'.repeat(130)
      });

      const result = validateProposal(proposal);
      expect(result).toContain('deadline');
    });

    it('should reject proposal with invalid signature', () => {
      const proposal = createNegotiationProposal({
        negotiationId: 'test-123',
        proposedAmount: '0.07',
        proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        signature: 'invalid-sig'
      });

      const result = validateProposal(proposal);
      expect(result).toContain('signature');
    });
  });
});

