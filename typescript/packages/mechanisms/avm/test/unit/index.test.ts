import { describe, it, expect } from 'vitest'
import {
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
  V1_ALGORAND_MAINNET,
  V1_ALGORAND_TESTNET,
  isValidAlgorandAddress,
  isAlgorandNetwork,
  isTestnetNetwork,
  v1ToCaip2,
  caip2ToV1,
  convertToTokenAmount,
  convertFromTokenAmount,
  isExactAvmPayload,
} from '../../src'

describe('@x402/avm', () => {
  describe('constants', () => {
    it('should export correct CAIP-2 network identifiers', () => {
      expect(ALGORAND_MAINNET_CAIP2).toBe('algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=')
      expect(ALGORAND_TESTNET_CAIP2).toBe('algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=')
    })

    it('should export correct V1 network identifiers', () => {
      expect(V1_ALGORAND_MAINNET).toBe('algorand-mainnet')
      expect(V1_ALGORAND_TESTNET).toBe('algorand-testnet')
    })

    it('should export correct USDC ASA IDs', () => {
      expect(USDC_MAINNET_ASA_ID).toBe('31566704')
      expect(USDC_TESTNET_ASA_ID).toBe('10458941')
    })
  })

  describe('isValidAlgorandAddress', () => {
    it('should return true for valid Algorand addresses', () => {
      // Valid Algorand address (58 characters base32)
      const validAddress = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'
      expect(isValidAlgorandAddress(validAddress)).toBe(true)
    })

    it('should return false for invalid Algorand addresses', () => {
      expect(isValidAlgorandAddress('invalid')).toBe(false)
      expect(isValidAlgorandAddress('0x1234')).toBe(false)
      expect(isValidAlgorandAddress('')).toBe(false)
    })
  })

  describe('isAlgorandNetwork', () => {
    it('should return true for CAIP-2 Algorand networks', () => {
      expect(isAlgorandNetwork(ALGORAND_MAINNET_CAIP2)).toBe(true)
      expect(isAlgorandNetwork(ALGORAND_TESTNET_CAIP2)).toBe(true)
      expect(isAlgorandNetwork('algorand:some-hash')).toBe(true)
    })

    it('should return true for V1 Algorand networks', () => {
      expect(isAlgorandNetwork(V1_ALGORAND_MAINNET)).toBe(true)
      expect(isAlgorandNetwork(V1_ALGORAND_TESTNET)).toBe(true)
    })

    it('should return false for non-Algorand networks', () => {
      expect(isAlgorandNetwork('eip155:1')).toBe(false)
      expect(isAlgorandNetwork('solana:mainnet')).toBe(false)
    })
  })

  describe('isTestnetNetwork', () => {
    it('should return true for testnet networks', () => {
      expect(isTestnetNetwork(ALGORAND_TESTNET_CAIP2)).toBe(true)
      expect(isTestnetNetwork(V1_ALGORAND_TESTNET)).toBe(true)
    })

    it('should return false for mainnet networks', () => {
      expect(isTestnetNetwork(ALGORAND_MAINNET_CAIP2)).toBe(false)
      expect(isTestnetNetwork(V1_ALGORAND_MAINNET)).toBe(false)
    })
  })

  describe('network conversion', () => {
    it('should convert V1 to CAIP-2', () => {
      expect(v1ToCaip2(V1_ALGORAND_MAINNET)).toBe(ALGORAND_MAINNET_CAIP2)
      expect(v1ToCaip2(V1_ALGORAND_TESTNET)).toBe(ALGORAND_TESTNET_CAIP2)
    })

    it('should convert CAIP-2 to V1', () => {
      expect(caip2ToV1(ALGORAND_MAINNET_CAIP2)).toBe(V1_ALGORAND_MAINNET)
      expect(caip2ToV1(ALGORAND_TESTNET_CAIP2)).toBe(V1_ALGORAND_TESTNET)
    })

    it('should return original if not a known network', () => {
      expect(v1ToCaip2('unknown')).toBe('unknown')
      expect(caip2ToV1('unknown')).toBe('unknown')
    })
  })

  describe('token amount conversion', () => {
    it('should convert decimal to token amount', () => {
      expect(convertToTokenAmount('1.50', 6)).toBe('1500000')
      expect(convertToTokenAmount('0.10', 6)).toBe('100000')
      expect(convertToTokenAmount('100', 6)).toBe('100000000')
      expect(convertToTokenAmount('0.000001', 6)).toBe('1')
    })

    it('should convert token amount to decimal', () => {
      expect(convertFromTokenAmount('1500000', 6)).toBe('1.5')
      expect(convertFromTokenAmount('100000', 6)).toBe('0.1')
      expect(convertFromTokenAmount('100000000', 6)).toBe('100')
      expect(convertFromTokenAmount('1', 6)).toBe('0.000001')
    })
  })

  describe('isExactAvmPayload', () => {
    it('should return true for valid payloads', () => {
      const validPayload = {
        paymentGroup: ['base64encoded1', 'base64encoded2'],
        paymentIndex: 1,
      }
      expect(isExactAvmPayload(validPayload)).toBe(true)
    })

    it('should return false for invalid payloads', () => {
      expect(isExactAvmPayload(null)).toBe(false)
      expect(isExactAvmPayload(undefined)).toBe(false)
      expect(isExactAvmPayload({})).toBe(false)
      expect(isExactAvmPayload({ paymentGroup: [] })).toBe(false)
      expect(isExactAvmPayload({ paymentIndex: 0 })).toBe(false)
      expect(isExactAvmPayload({ paymentGroup: 'not-array', paymentIndex: 0 })).toBe(false)
      expect(isExactAvmPayload({ paymentGroup: [], paymentIndex: '0' })).toBe(false)
    })
  })
})
