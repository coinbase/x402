/**
 * Token compatibility checker for EIP-2612 (Permit) and EIP-3009 (TransferWithAuthorization) support
 */

import { TokenCompatClient } from "./client";

export { TokenCompatClient } from "./client";
export * from "./types";

/**
 * Create a default TokenCompatClient instance
 */
export function createTokenCompatClient(
  options?: import("./types").TokenCompatOptions
): TokenCompatClient {
  return new TokenCompatClient(options);
}
