import { keccak_256 } from '@noble/hashes/sha3'

/**
 * Keccak256 hash function for Ethereum address derivation
 */
export function keccak256(data: Uint8Array): string {
  const hash = keccak_256(data)
  return Buffer.from(hash).toString('hex')
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  return new Uint8Array(Buffer.from(cleanHex, 'hex'))
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Buffer.from(bytes).toString('hex')
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Validate private key format
 */
export function isValidPrivateKey(privateKey: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(privateKey)
}
