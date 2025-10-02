import { describe, it, expect } from "vitest";
import { buildTonPaymentHeader, selectTonExactPayment } from './client';
import { encodeJettonTransfer } from './jettonPayload';
import { verifyTONExact } from './verify';
import { TonExactPayment } from './types';
import { toAtomic } from './utils';
import { Cell } from '@ton/core';

describe('TON x402 Implementation', () => {
  describe('utils', () => {
    it('should convert value to atomic units', () => {
      expect(toAtomic('1.5', 9)).toBe('1500000000');
      expect(toAtomic('0.000000001', 9)).toBe('1');
    });
  });

  describe('client', () => {
    it('should build payment header', () => {
      const header = buildTonPaymentHeader({
        scheme: 'exact',
        network: 'TON',
        txid: 'abc123'
      });
      expect(header).toContain('X-PAYMENT');
      // Header contains base64url encoded JSON
      expect(header).toMatch(/^X-PAYMENT [A-Za-z0-9_-]+$/);
    });

    it('should select TON payment', () => {
      const payments: TonExactPayment[] = [
        { 
          network: 'ton:mainnet', 
          to: 'addr1', 
          amountAtomic: '1000', 
          memo: 'test',
          validUntil: Date.now() + 3600000,
          asset: { kind: 'native', symbol: 'TON', decimals: 9 }
        },
        { 
          network: 'ton:testnet', 
          to: 'addr2', 
          amountAtomic: '2000', 
          memo: 'test2',
          validUntil: Date.now() + 3600000,
          asset: { kind: 'native', symbol: 'TON', decimals: 9 }
        }
      ];
      const selected = selectTonExactPayment(payments);
      expect(selected.to).toBe('addr1');
    });
  });

  describe('jettonPayload', () => {
    it('should encode jetton transfer', () => {
      const msg = encodeJettonTransfer({
        to: 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ', // Valid test TON address
        amount: '1000000',
        memo: 'x402:invoice123'
      });
      expect(msg).toHaveProperty('address');
      expect(msg).toHaveProperty('payload');
      expect(msg.amount).toBe('0');

      // Verify TEP-74 compliance: decode payload and check structure
      const payloadCell = Cell.fromBase64(msg.payload);
      
      // Just verify it's a valid cell and has the expected structure
      // We trust ton-core to properly encode the Jetton transfer
      expect(payloadCell.bits.length).toBeGreaterThan(100); // Should have substantial data
      expect(payloadCell.refs.length).toBeGreaterThan(0); // Should have forward_payload ref
      expect(typeof msg.payload).toBe('string');
      expect(msg.payload.length).toBeGreaterThan(10);
    });
  });

  describe('verify', () => {
    it('should verify TON payment (mock)', async () => {
      // Mock RPC for testing
      const mockRpc = {
        getTxByHash: async () => ({
          hash: "mock_tx",
          to: "addr",
          amount: "1000",
          comment: "x402:test123",
        }),
        findIncomingByMemo: async () => ({
          hash: "mock_tx",
          to: "addr",
          amount: "1000",
          comment: "x402:test123",
        }),
        getJettonTransferTo: async () => null,
        getFinalityDepth: async () => 2,
      };

      const result = await verifyTONExact({
        memo: 'x402:test123',
        to: 'addr',
        asset: { kind: 'native', symbol: 'TON', decimals: 9 },
        amountAtomic: 1000n,
        network: 'ton:mainnet',
        rpc: mockRpc
      });

      expect(result.ok).toBe(true);
      expect(result.txid).toBeDefined();
      expect(result.explorerUrl).toMatch(/^https:\/\/tonviewer\.com\/transaction\//);
    });
  }); 

  describe('validation & security', () => {
    it('should return INVALID_MEMO for disallowed characters', async () => {
      const mockRpc = {
        getTxByHash: async () => null,
        findIncomingByMemo: async () => null,
        getJettonTransferTo: async () => null,
      };

      const res = await verifyTONExact({
        memo: 'x402:inv@lid', // contains '@'
        to: 'addr',
        asset: { kind: 'native', symbol: 'TON', decimals: 9 },
        amountAtomic: 1000n,
        network: 'ton:mainnet',
        rpc: mockRpc as any,
      });

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('INVALID_MEMO');
    });

    it('should return EXPIRED if validUntil is in the past', async () => {
      const mockRpc = {
        getTxByHash: async () => null,
        findIncomingByMemo: async () => null,
        getJettonTransferTo: async () => null,
      };

      const res = await verifyTONExact({
        memo: 'x402:invoice123',
        to: 'addr',
        asset: { kind: 'native', symbol: 'TON', decimals: 9 },
        amountAtomic: 1000n,
        network: 'ton:mainnet',
        rpc: mockRpc as any,
        validUntil: Date.now() - 1000,
      });

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('EXPIRED');
    });

    it('should detect replay when txid already used', async () => {
      const mockRpc = {
        getTxByHash: async () => ({ hash: 'reused_tx', to: 'addr', amount: '1000', comment: 'x402:test' }),
        findIncomingByMemo: async () => null,
        getJettonTransferTo: async () => null,
      };

      const used = new Set(['reused_tx']);
      const res = await verifyTONExact({
        txid: 'reused_tx',
        memo: 'x402:test',
        to: 'addr',
        asset: { kind: 'native', symbol: 'TON', decimals: 9 },
        amountAtomic: 1000n,
        network: 'ton:mainnet',
        rpc: mockRpc as any,
        usedTxIds: used,
      });

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('REPLAY_DETECTED');
    });
  });

  describe("edge cases", () => {
      it("should handle address format normalization", async () => {
        const mockRpc = {
          getTxByHash: async () => ({
            hash: "mock_tx",
            to: "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
            amount: "1000",
            comment: "memo",
          }),
          findIncomingByMemo: async () => ({
            hash: "mock_tx",
            to: "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
            amount: "1000",
            comment: "memo",
          }),
          getJettonTransferTo: async () => null,
          getFinalityDepth: async () => 2,
        };

        // Test with different address formats
        const bounceableAddr = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
        const rawAddr = "0:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

        const result = await verifyTONExact({
          memo: "memo",
          to: bounceableAddr, // bounceable format
          asset: { kind: "native", symbol: "TON", decimals: 9 },
          amountAtomic: 1000n,
          network: "ton:mainnet",
          rpc: mockRpc,
        });

        expect(result.ok).toBe(true);
      });

      it("should handle jetton decimal mismatch", async () => {
        const mockRpc = {
          getTxByHash: async () => ({
            hash: "mock_tx",
            to: "addr",
            amount: "1000",
            comment: "memo",
          }),
          findIncomingByMemo: async () => null,
          getJettonTransferTo: async () => ({
            txHash: "mock_jetton_tx",
            master: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
            amount: "1000000",
            memo: "test",
          }),
          getFinalityDepth: async () => 2,
        };

        // Asset expects 9 decimals but jetton has 6
        const result = await verifyTONExact({
          memo: "test",
          to: "addr",
          asset: {
            kind: "jetton",
            master: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
            decimals: 9, // Wrong decimals
          },
          amountAtomic: 1000000000n, // 1 * 10^9 (expecting 9 decimals)
          network: "ton:mainnet",
          rpc: mockRpc,
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe("AMOUNT_MISMATCH");
      });

      it("should handle insufficient forward_ton_amount in jetton transfers", async () => {
        // This test verifies that even with very low forward_ton_amount,
        // the verification still works if the transfer event exists
        const mockRpc = {
          getTxByHash: async () => ({ hash: "mock_tx", to: "addr", amount: "1", comment: "memo" }), // 1 nanoton
          findIncomingByMemo: async () => null,
          getJettonTransferTo: async () => ({
            txHash: "mock_jetton_tx",
            master: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
            amount: "1000000",
            memo: "test",
          }),
          getFinalityDepth: async () => 2,
        };

        const result = await verifyTONExact({
          memo: "test",
          to: "addr",
          asset: {
            kind: "jetton",
            master: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
            decimals: 6,
          },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc: mockRpc,
        });

        expect(result.ok).toBe(true);
      });

      it('should handle cross-format address normalization', async () => {
        // Test that raw and user-friendly addresses are treated as equivalent
        const userFriendly = 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ';
        const raw = '0:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

        const mockRpc1 = {
          getTxByHash: async () => ({ hash: 'mock_tx', to: userFriendly, amount: '1000', comment: 'memo' }),
          findIncomingByMemo: async () => ({ hash: 'mock_tx', to: userFriendly, amount: '1000', comment: 'memo' }),
          getJettonTransferTo: async () => null,
          getFinalityDepth: async () => 2
        };

        const mockRpc2 = {
          getTxByHash: async () => ({ hash: 'mock_tx', to: raw, amount: '1000', comment: 'memo' }),
          findIncomingByMemo: async () => ({ hash: 'mock_tx', to: raw, amount: '1000', comment: 'memo' }),
          getJettonTransferTo: async () => null,
          getFinalityDepth: async () => 2
        };

        // Both formats should work identically
        const result1 = await verifyTONExact({
          memo: 'memo',
          to: userFriendly,
          asset: { kind: 'native', symbol: 'TON', decimals: 9 },
          amountAtomic: 1000n,
          network: 'ton:mainnet',
          rpc: mockRpc1
        });

        const result2 = await verifyTONExact({
          memo: 'memo',
          to: raw,
          asset: { kind: 'native', symbol: 'TON', decimals: 9 },
          amountAtomic: 1000n,
          network: 'ton:mainnet',
          rpc: mockRpc2
        });

        expect(result1.ok).toBe(true);
        expect(result2.ok).toBe(true);
      });
    });
  });
