/**
 * Origin Response Lambda@Edge Handler
 * 
 * Settles x402 payment only if origin returned success (status < 400).
 * This ensures customers are not charged for failed API requests.
 */

import type { CloudFrontResponseEvent, CloudFrontResponseResult } from 'aws-lambda';
import { createX402Middleware, MiddlewareResultType, type LambdaEdgeResponse } from './lib';
import { FACILITATOR_URL, NETWORK, ROUTES, getAuthHeaders } from './config';

// Lazy initialization to support async auth
let x402Promise: ReturnType<typeof createX402Middleware> | null = null;

async function getMiddleware() {
  if (!x402Promise) {
    const authHeaders = await getAuthHeaders();
    x402Promise = createX402Middleware({
      facilitatorUrl: FACILITATOR_URL,
      network: NETWORK,
      routes: ROUTES,
      createAuthHeaders: authHeaders,
    });
  }
  return x402Promise;
}

export const handler = async (
  event: CloudFrontResponseEvent
): Promise<CloudFrontResponseResult | LambdaEdgeResponse> => {
  const request = event.Records[0].cf.request;
  const response = event.Records[0].cf.response;

  // --- Your custom logic here (before settlement) ---

  // x402 payment settlement (only if origin succeeded)
  const x402 = await getMiddleware();
  const result = await x402.processOriginResponse(request, response);

  if (result.type === MiddlewareResultType.RESPOND) {
    return result.response; // Settlement failed - 402 error
  }

  // --- Your custom logic here (after settlement) ---
  // Example: Add custom response headers, logging, etc.

  return result.response;
};
