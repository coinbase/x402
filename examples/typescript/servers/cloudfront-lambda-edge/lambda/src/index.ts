import type { CloudFrontRequestEvent, CloudFrontRequestResult } from 'aws-lambda';
import { matchRoute } from './config';
import { createPaymentRequirements, verifyPayment, settlePayment } from './payment';
import { createPaymentRequiredResponse, createPaymentInvalidResponse, LambdaEdgeResponse } from './responses';

/**
 * Lambda@Edge Origin Request handler for x402 payment verification
 */
export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequestResult | LambdaEdgeResponse> => {
  const request = event.Records[0].cf.request;
  const path = request.uri;

  console.log('x402 check:', path);

  // Check if route requires payment
  const route = matchRoute(path);
  if (!route) {
    return request; // No payment required, pass through
  }

  // Build resource URL - prefer Host header (custom domain), fallback to CloudFront domain
  const host = request.headers['host']?.[0]?.value 
    || event.Records[0].cf.config.distributionDomainName;
  const protocol = request.headers['cloudfront-forwarded-proto']?.[0]?.value || 'https';
  const resourceUrl = `${protocol}://${host}${path}`;
  const requirements = createPaymentRequirements(resourceUrl, route);

  // Check for payment header
  const paymentHeader = request.headers['payment-signature']?.[0]?.value;

  if (!paymentHeader) {
    console.log('No payment, returning 402');
    return createPaymentRequiredResponse(requirements, 'Payment required', resourceUrl);
  }

  // Verify payment
  console.log('Verifying payment...');
  const verification = await verifyPayment(paymentHeader, requirements);

  if (!verification.isValid) {
    console.log('Payment invalid:', verification.error);
    return createPaymentInvalidResponse(requirements, verification.error || 'Invalid payment', resourceUrl, verification.payer);
  }

  // Settle payment
  console.log('Settling payment...');
  const settlement = await settlePayment(paymentHeader, requirements);

  if (settlement.responseHeader) {
    request.headers['payment-response'] = [{ key: 'PAYMENT-RESPONSE', value: settlement.responseHeader }];
  }

  console.log('Payment verified, forwarding to origin');
  return request;
};
