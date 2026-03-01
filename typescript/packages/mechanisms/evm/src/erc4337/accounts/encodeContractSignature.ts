import { type Hex, concat, pad, toHex } from "viem";

/**
 * Encodes a signature in Safe's contract signature format (v=0).
 *
 * Safe's `checkNSignatures` expects this layout for contract owners:
 *
 * Static part (65 bytes):
 * - r (32 bytes): owner address padded to 32 bytes
 * - s (32 bytes): offset to dynamic data (relative to start of signatures)
 * - v (1 byte):   0x00 (indicates contract signature)
 *
 * Dynamic part (at the offset):
 * - length (32 bytes): length of the signature data
 * - data (variable):   the actual signature bytes
 *
 * For a single signer, the static part is 65 bytes, so the dynamic data
 * starts at offset 65.
 *
 * @param ownerAddress - The contract owner address
 * @param signatureData - The raw signature bytes to encode
 * @returns The encoded contract signature in Safe's expected format
 */
export function encodeContractSignature(ownerAddress: Hex, signatureData: Hex): Hex {
  // Static part: r = address padded to 32 bytes
  const r = pad(ownerAddress, { size: 32 });

  // For a single signature, dynamic data starts right after the 65-byte static part
  const dynamicOffset = 65;
  const s = pad(toHex(dynamicOffset), { size: 32 });

  // v = 0x00 for contract signature
  const v = "0x00" as Hex;

  // Dynamic part: length-prefixed signature data
  const signatureBytes = (signatureData.length - 2) / 2;
  const length = pad(toHex(signatureBytes), { size: 32 });

  return concat([r, s, v, length, signatureData]);
}
