import type { TonExactPayment } from './types';

export type BuildPaymentHeaderParams = {
  scheme: 'exact';
  network: 'TON';
  txid?: string; // optional if facilitator matches by memo
};

export function buildTonPaymentHeader(p: BuildPaymentHeaderParams) {
  // Mirror shape of existing X-PAYMENT header encoders in the repo
  const payload = {
    scheme: p.scheme,
    network: p.network,
    txid: p.txid,
  };
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `X-PAYMENT ${base64}` ;
}

export function selectTonExactPayment(options: TonExactPayment[]): TonExactPayment {
  // naive selector – pick first valid option
  if (!options?.length) throw new Error('No TON payment options');
  return options[0];
}
