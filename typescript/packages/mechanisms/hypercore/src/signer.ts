import type { HypercoreSendAssetAction } from "./types.js";

/**
 * Signer interface for Hypercore client payloads.
 */
export type ClientHypercoreSigner = {
  /**
   * Sign a SendAsset action using EIP-712.
   */
  signSendAsset(action: HypercoreSendAssetAction): Promise<{ r: string; s: string; v: number }>;

  /**
   * Return the signer's address.
   */
  getAddress(): string;
};

/**
 * Signer config for Hypercore facilitators.
 */
export type FacilitatorHypercoreSigner = {
  /**
   * Hyperliquid API URL for settlement.
   */
  apiUrl: string;
};

/**
 * Return the signer with Hypercore client typing.
 *
 * @param signer - Client signer.
 * @returns The same signer.
 */
export function toClientHypercoreSigner(signer: ClientHypercoreSigner): ClientHypercoreSigner {
  return signer;
}

/**
 * Create a facilitator signer config from an API URL.
 *
 * @param apiUrl - Hyperliquid API URL.
 * @returns Facilitator signer config.
 */
export function toFacilitatorHypercoreSigner(apiUrl: string): FacilitatorHypercoreSigner {
  return { apiUrl };
}
