import type { PaymentRequirements } from '@x402/core';

const X402_VERSION = 2;

export interface LambdaEdgeResponse {
  status: string;
  statusDescription?: string;
  body?: string;
  headers?: Record<string, Array<{ key: string; value: string }>>;
}

/**
 * Create 402 Payment Required response
 */
export function createPaymentRequiredResponse(
  paymentRequirements: PaymentRequirements,
  error: string,
  resourceUrl: string
): LambdaEdgeResponse {
  const body = JSON.stringify({
    x402Version: X402_VERSION,
    error,
    resource: { url: resourceUrl, mimeType: 'application/json' },
    accepts: [paymentRequirements],
  });

  return {
    status: '402',
    statusDescription: 'Payment Required',
    headers: {
      'content-type': [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
      'payment-required': [{ key: 'PAYMENT-REQUIRED', value: Buffer.from(body).toString('base64') }],
    },
    body,
  };
}

/**
 * Create 402 response for invalid payment
 */
export function createPaymentInvalidResponse(
  paymentRequirements: PaymentRequirements,
  error: string,
  resourceUrl: string,
  payer?: string
): LambdaEdgeResponse {
  const body = JSON.stringify({
    x402Version: X402_VERSION,
    error,
    resource: { url: resourceUrl, mimeType: 'application/json' },
    accepts: [paymentRequirements],
    payer,
  });

  return {
    status: '402',
    statusDescription: 'Payment Required',
    headers: {
      'content-type': [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
    },
    body,
  };
}
