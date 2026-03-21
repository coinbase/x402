/**
 * Kaspa-specific utilities for address encoding and TX serialization.
 *
 * These are pure functions with no kaspa-wasm dependency.
 */

/**
 * Bech32 character set (BIP173).
 */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/**
 * Convert between bit widths (BIP173 convertbits).
 *
 * @param data - Array of values to convert
 * @param fromBits - Source bit width
 * @param toBits - Target bit width
 * @param pad - Whether to pad the output
 * @returns Converted values, or null if padding is invalid
 */
function convertBits(
  data: number[],
  fromBits: number,
  toBits: number,
  pad: boolean,
): number[] | null {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    ret.push((acc << (toBits - bits)) & maxv);
  } else if (!pad && (bits >= fromBits || (acc << (toBits - bits)) & maxv)) {
    return null;
  }
  return ret;
}

/**
 * Decode a Kaspa bech32 address payload to raw bytes.
 *
 * @param payload - The bech32 payload string (from Address.payload, without prefix)
 * @returns version byte + raw public key bytes
 */
export function decodeBech32Payload(payload: string): { version: number; data: Uint8Array } {
  const data5: number[] = [];
  for (const c of payload) {
    const idx = CHARSET.indexOf(c);
    if (idx === -1) throw new Error(`Invalid bech32 character: ${c}`);
    data5.push(idx);
  }

  // Kaspa uses 8-character checksum
  const withoutChecksum = data5.slice(0, data5.length - 8);
  const bytes = convertBits(withoutChecksum, 5, 8, false);
  if (!bytes) throw new Error("Invalid bech32 padding");

  return {
    version: bytes[0],
    data: new Uint8Array(bytes.slice(1)),
  };
}

/**
 * Convert a Kaspa address string to a ScriptPublicKey.
 *
 * For PubKey addresses (version 0): script = OP_DATA_32 + pubkey + OP_CHECKSIG
 * For ScriptHash addresses (version 8): script = OP_BLAKE2B + OP_DATA_32 + hash + OP_EQUAL
 *
 * @param address - Full Kaspa address (e.g., "kaspa:qr0lr4ml...")
 * @returns ScriptPublicKey as { version, script }
 */
export function addressToScriptPublicKey(address: string): { version: number; script: string } {
  // Strip prefix (kaspa: or kaspatest: or kaspadev: or kaspasim:)
  const colonIdx = address.indexOf(":");
  if (colonIdx === -1) throw new Error(`Invalid Kaspa address: missing prefix`);
  const payload = address.slice(colonIdx + 1);

  const { version, data } = decodeBech32Payload(payload);
  const hex = Array.from(data)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  if (version === 0) {
    // P2PK: OP_DATA_32 (0x20) + xOnlyPubKey (32 bytes) + OP_CHECKSIG (0xac)
    return { version: 0, script: "20" + hex + "ac" };
  } else if (version === 1) {
    // P2PK ECDSA: OP_DATA_33 (0x21) + compressedPubKey (33 bytes) + OP_CODESEPARATOR (0xab) + OP_CHECKSIGECDSA (0xaa)
    return { version: 0, script: "21" + hex + "abaa" };
  } else if (version === 8) {
    // P2SH: OP_BLAKE2B (0xaa) + OP_DATA_32 (0x20) + scriptHash (32 bytes) + OP_EQUAL (0x87)
    return { version: 0, script: "aa20" + hex + "87" };
  }

  throw new Error(`Unsupported address version: ${version}`);
}

/**
 * JSON replacer that converts BigInt to Number.
 * Used for kaspa-wasm Transaction.toJSON() serialization.
 *
 * WARNING: Loses precision for values > Number.MAX_SAFE_INTEGER (2^53 - 1).
 * For Kaspa sompi, this supports up to ~90 million KAS (9e15 sompi).
 *
 * @param _key - JSON key (unused, required by JSON.stringify replacer signature)
 * @param value - JSON value to potentially convert
 * @returns The original value, or Number conversion if BigInt
 */
export function bigIntToNumberReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? Number(value) : value;
}

/**
 * Serialized transaction format for x402 payload.
 * This is the JSON representation of kaspa-wasm Transaction.toJSON()
 * with BigInts converted to numbers.
 */
export type SerializedTransaction = {
  id: string;
  version: number;
  inputs: {
    previousOutpoint: { transactionId: string; index: number };
    signatureScript: string;
    sequence: number;
    sigOpCount: number;
  }[];
  outputs: {
    value: number;
    scriptPublicKey: { version: number; script: string };
    /** Covenant binding (present for token outputs). */
    covenant?: { authorizingInput: number; covenantId: string };
  }[];
  lock_time: number;
  gas: number;
  subnetworkId: string;
  payload: string;
};
