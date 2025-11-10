import { describe, it, expect } from 'vitest';
import { RangeBasedStrategy, VolumeBasedStrategy } from './strategy';

describe('Pricing Strategies', () => {
  describe('RangeBasedStrategy', () => {
    it('should accept proposals within range', async () => {
      const strategy = new RangeBasedStrategy('0.10', '0.05', 3);
      
      const context = {
        proposal: {
          negotiationId: 'test-123',
          proposedAmount: '0.06',
          proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
          nonce: Date.now().toString(),
          deadline: Math.floor(Date.now() / 1000) + 30,
          signature: '0x' + '0'.repeat(130)
        },
        clientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        resource: '/api/data'
      };

      const response = await strategy.evaluateProposal(context);
      expect(response.status).toBe('accepted');
      expect(response.finalAmount).toBe('0.06');
      expect(response.settlementRequired).toBe(true);
    });

    it('should counter-offer for mid-range proposals', async () => {
      const strategy = new RangeBasedStrategy('0.10', '0.05', 3);
      
      const context = {
        proposal: {
          negotiationId: 'test-123',
          proposedAmount: '0.03',
          proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
          nonce: Date.now().toString(),
          deadline: Math.floor(Date.now() / 1000) + 30,
          signature: '0x' + '0'.repeat(130)
        },
        clientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        resource: '/api/data'
      };

      const response = await strategy.evaluateProposal(context);
      expect(response.status).toBe('counter');
      expect(response.counterAmount).toBeDefined();
      expect(parseFloat(response.counterAmount!)).toBeGreaterThan(0.03);
    });

    it('should reject very low proposals', async () => {
      const strategy = new RangeBasedStrategy('0.10', '0.05', 3);
      
      const context = {
        proposal: {
          negotiationId: 'test-123',
          proposedAmount: '0.01',
          proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
          nonce: Date.now().toString(),
          deadline: Math.floor(Date.now() / 1000) + 30,
          signature: '0x' + '0'.repeat(130)
        },
        clientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        resource: '/api/data'
      };

      const response = await strategy.evaluateProposal(context);
      expect(response.status).toBe('rejected');
      expect(response.reason).toBeDefined();
    });

    it('should return base price', async () => {
      const strategy = new RangeBasedStrategy('0.10', '0.05', 3);
      const price = await strategy.getCurrentBasePrice('/api/data');
      expect(price).toBe('0.10');
    });
  });

  describe('VolumeBasedStrategy', () => {
    it('should accept proposals at volume-adjusted price', async () => {
      const strategy = new VolumeBasedStrategy(
        '0.10',
        '0.05',
        new Map([[10, 0.95], [50, 0.90], [100, 0.85]])
      );
      
      const context = {
        proposal: {
          negotiationId: 'test-123',
          proposedAmount: '0.085',
          volume: 100,
          proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
          nonce: Date.now().toString(),
          deadline: Math.floor(Date.now() / 1000) + 30,
          signature: '0x' + '0'.repeat(130)
        },
        clientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        resource: '/api/data'
      };

      const response = await strategy.evaluateProposal(context);
      expect(response.status).toBe('accepted');
    });

    it('should apply volume discounts in counter-offers', async () => {
      const strategy = new VolumeBasedStrategy(
        '0.10',
        '0.05',
        new Map([[10, 0.95], [50, 0.90], [100, 0.85]])
      );
      
      const context = {
        proposal: {
          negotiationId: 'test-123',
          proposedAmount: '0.07',
          volume: 50,
          proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
          nonce: Date.now().toString(),
          deadline: Math.floor(Date.now() / 1000) + 30,
          signature: '0x' + '0'.repeat(130)
        },
        clientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        resource: '/api/data'
      };

      const response = await strategy.evaluateProposal(context);
      expect(response.status).toBe('counter');
      expect(response.reason).toContain('discount');
      // 10% discount: 0.10 * 0.90 = 0.09
      expect(parseFloat(response.counterAmount!)).toBeCloseTo(0.09, 2);
    });

    it('should not apply discount for low volumes', async () => {
      const strategy = new VolumeBasedStrategy(
        '0.10',
        '0.05',
        new Map([[10, 0.95], [50, 0.90], [100, 0.85]])
      );
      
      const context = {
        proposal: {
          negotiationId: 'test-123',
          proposedAmount: '0.10',
          volume: 5,
          proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
          nonce: Date.now().toString(),
          deadline: Math.floor(Date.now() / 1000) + 30,
          signature: '0x' + '0'.repeat(130)
        },
        clientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        resource: '/api/data'
      };

      const response = await strategy.evaluateProposal(context);
      expect(response.status).toBe('accepted');
    });

    it('should reject proposals below minimum', async () => {
      const strategy = new VolumeBasedStrategy('0.10', '0.05');
      
      const context = {
        proposal: {
          negotiationId: 'test-123',
          proposedAmount: '0.04',
          volume: 100,
          proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
          nonce: Date.now().toString(),
          deadline: Math.floor(Date.now() / 1000) + 30,
          signature: '0x' + '0'.repeat(130)
        },
        clientAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        resource: '/api/data'
      };

      const response = await strategy.evaluateProposal(context);
      expect(response.status).toBe('rejected');
    });
  });
});

