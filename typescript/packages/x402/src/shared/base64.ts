/**
 * Encodes a string to base64 format
 *
 * @param data - The string to be encoded to base64
 * @returns The base64 encoded string
 */
export function safeBase64Encode(data: string): string {
  if (typeof globalThis !== "undefined" && "btoa" in globalThis) {
    return globalThis.btoa(data);
  }
  return Buffer.from(data).toString("base64");
}

/**
 * Decodes a base64 string back to its original format
 *
 * @param data - The base64 encoded string to be decoded
 * @returns The decoded string in UTF-8 format
 */
export function safeBase64Decode(data: string): string {
  if (typeof globalThis !== "undefined" && "atob" in globalThis) {
    return globalThis.atob(data);
  }
  return Buffer.from(data, "base64").toString("utf-8");
}
