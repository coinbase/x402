import type { TonExactPayment } from "./types";

export type BuildPaymentHeaderParams = {
  scheme: "exact";
  network: "TON";
  txid?: string; // optional if facilitator matches by memo
};

/**
 * Builds the X-PAYMENT header payload for TON rail.
 *
 * @param p - Parameters used to compose the header.
 * @returns Encoded header string (prefixed with "X-PAYMENT ").
 */
export function buildTonPaymentHeader(p: BuildPaymentHeaderParams) {
  // Mirror shape of existing X-PAYMENT header encoders in the repo
  const payload = {
    scheme: p.scheme,
    network: p.network,
    txid: p.txid,
  };
  const base64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `X-PAYMENT ${base64}`;
}

/**
 * Selects the first valid TON exact payment option from the provided array.
 *
 * @param options - Array of TON exact payment options.
 * @returns The first valid TON exact payment option.
 */
export function selectTonExactPayment(options: TonExactPayment[]): TonExactPayment {
  // naive selector – pick first valid option
  if (!options?.length) throw new Error("No TON payment options");
  return options[0];
}
