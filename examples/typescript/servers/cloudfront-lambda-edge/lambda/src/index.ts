import type { CloudFrontRequestEvent, CloudFrontRequestResult } from 'aws-lambda';
import { CloudFrontHTTPAdapter } from './adapter';
import { getServer } from './server';
import { toLambdaResponse, LambdaEdgeResponse } from './responses';

/**
 * Lambda@Edge Origin Request handler for x402 payment verification
 */
export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequestResult | LambdaEdgeResponse> => {
  const request = event.Records[0].cf.request;
  const distributionDomain = event.Records[0].cf.config.distributionDomainName;

  console.log('x402 check:', request.uri);

  try {
    const server = await getServer();
    const adapter = new CloudFrontHTTPAdapter(request, distributionDomain);

    const context = {
      adapter,
      path: adapter.getPath(),
      method: adapter.getMethod(),
      paymentHeader: adapter.getHeader('payment-signature'),
    };

    const result = await server.processHTTPRequest(context);

    switch (result.type) {
      case 'no-payment-required':
        return request;

      case 'payment-error':
        console.log('Payment required or invalid');
        return toLambdaResponse(
          result.response.status,
          result.response.headers,
          result.response.body
        );

      case 'payment-verified':
        console.log('Payment verified, settling...');
        const settlement = await server.processSettlement(
          result.paymentPayload,
          result.paymentRequirements
        );

        if (settlement.success) {
          for (const [key, value] of Object.entries(settlement.headers)) {
            request.headers[key.toLowerCase()] = [{ key, value: String(value) }];
          }
          console.log('Payment settled, forwarding to origin');
          return request;
        } else {
          console.log('Settlement failed:', settlement.errorReason);
          return toLambdaResponse(402, { 'Content-Type': 'application/json' }, {
            error: settlement.errorReason,
          });
        }
    }
  } catch (error) {
    console.error('x402 error:', error);
    return toLambdaResponse(500, { 'Content-Type': 'application/json' }, {
      error: 'Internal server error',
    });
  }
};
