import type { PaymentRequirements, PaymentPayload, Network } from '@x402/core';
import { CONFIG, getAssetInfo, RouteConfig } from './config';

/**
 * Simple HTTP client for x402 facilitator
 */
class FacilitatorClient {
  constructor(private url: string) {}

  async verify(payload: PaymentPayload, requirements: PaymentRequirements) {
    const res = await fetch(`${this.url}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
    });
    return res.json() as Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
  }

  async settle(payload: PaymentPayload, requirements: PaymentRequirements) {
    const res = await fetch(`${this.url}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }),
    });
    return res.json();
  }
}

const facilitator = new FacilitatorClient(CONFIG.facilitatorUrl);

/**
 * Convert price string to atomic units
 */
function toAtomicAmount(price: string, decimals: number): string {
  const value = price.startsWith('$') ? price.slice(1) : price;
  const [int, dec = ''] = value.split('.');
  const padded = dec.padEnd(decimals, '0').slice(0, decimals);
  return (int + padded).replace(/^0+/, '') || '0';
}

/**
 * Create payment requirements for a route
 */
export function createPaymentRequirements(
  resource: string,
  route: RouteConfig
): PaymentRequirements {
  const asset = getAssetInfo(CONFIG.network);
  const payTo = route.payTo || CONFIG.payTo;

  return {
    scheme: 'exact',
    network: CONFIG.network,
    amount: toAtomicAmount(route.price, asset.decimals),
    payTo,
    maxTimeoutSeconds: 60,
    asset: asset.address,
    extra: { name: 'USDC', version: '2' },
  };
}

/**
 * Decode payment from base64 header
 */
function decodePayment(header: string): PaymentPayload {
  return JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
}

/**
 * Verify payment with facilitator
 */
export async function verifyPayment(
  paymentHeader: string,
  requirements: PaymentRequirements
): Promise<{ isValid: boolean; error?: string; payer?: string }> {
  try {
    const payload = decodePayment(paymentHeader);
    const result = await facilitator.verify(payload, requirements);

    if (!result.isValid) {
      return { isValid: false, error: result.invalidReason, payer: result.payer };
    }
    return { isValid: true, payer: result.payer };
  } catch (e) {
    return { isValid: false, error: e instanceof Error ? e.message : 'Verification failed' };
  }
}

/**
 * Settle payment with facilitator
 */
export async function settlePayment(
  paymentHeader: string,
  requirements: PaymentRequirements
): Promise<{ responseHeader?: string; error?: string }> {
  try {
    const payload = decodePayment(paymentHeader);
    const result = await facilitator.settle(payload, requirements);
    return { responseHeader: Buffer.from(JSON.stringify(result)).toString('base64') };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Settlement failed' };
  }
}
