/**
 * Facilitator Authentication Helpers
 * 
 * This file contains authentication helpers for different facilitators.
 * Import and use these in config.ts when configuring your facilitator client.
 * 
 * Lambda@Edge does NOT support environment variables, so credentials must be
 * either bundled in code (demo only) or fetched from AWS Secrets Manager (production).
 */

import { generateJwt } from '@coinbase/cdp-sdk/auth';
import type { FacilitatorConfig } from '@x402/core/server';

// =============================================================================
// CDP (Coinbase Developer Platform) Authentication
// =============================================================================

// CDP Facilitator constants
const CDP_FACILITATOR_HOST = 'api.cdp.coinbase.com';
const CDP_FACILITATOR_BASE_PATH = '/platform/v2/x402';

/**
 * CDP API credentials
 */
export interface CDPCredentials {
  apiKeyId: string;
  apiKeySecret: string;
}

/**
 * Creates CDP authentication headers for the x402 facilitator.
 * 
 * Use this when configuring HTTPFacilitatorClient for the CDP mainnet facilitator.
 * 
 * @param credentials - CDP API credentials (apiKeyId and apiKeySecret)
 * @returns A function that generates auth headers for verify/settle/supported endpoints
 * 
 * @example
 * ```typescript
 * import { createCDPAuthHeaders } from './facilitator-auth';
 * 
 * const facilitatorClient = new HTTPFacilitatorClient({
 *   url: 'https://api.cdp.coinbase.com/platform/v2/x402',
 *   createAuthHeaders: createCDPAuthHeaders({
 *     apiKeyId: 'your-api-key-id',
 *     apiKeySecret: 'your-api-key-secret-pem',
 *   }),
 * });
 * ```
 */
export function createCDPAuthHeaders(
  credentials: CDPCredentials
): FacilitatorConfig['createAuthHeaders'] {
  const { apiKeyId, apiKeySecret } = credentials;

  // SDK metadata for correlation headers (helps CDP with debugging)
  const correlationHeader = [
    'sdk_version=1.0.0',
    'sdk_language=typescript',
    'source=x402-cloudfront-lambda-edge',
  ].join(',');

  return async () => {
    // Generate JWT for each endpoint (CDP requires path-specific JWTs)
    // JWTs expire after 120 seconds by default
    const [verifyJwt, settleJwt, supportedJwt] = await Promise.all([
      generateJwt({
        apiKeyId,
        apiKeySecret,
        requestMethod: 'POST',
        requestHost: CDP_FACILITATOR_HOST,
        requestPath: `${CDP_FACILITATOR_BASE_PATH}/verify`,
        expiresIn: 120, // 2 minutes (default)
      }),
      generateJwt({
        apiKeyId,
        apiKeySecret,
        requestMethod: 'POST',
        requestHost: CDP_FACILITATOR_HOST,
        requestPath: `${CDP_FACILITATOR_BASE_PATH}/settle`,
        expiresIn: 120,
      }),
      generateJwt({
        apiKeyId,
        apiKeySecret,
        requestMethod: 'GET',
        requestHost: CDP_FACILITATOR_HOST,
        requestPath: `${CDP_FACILITATOR_BASE_PATH}/supported`,
        expiresIn: 120,
      }),
    ]);

    return {
      verify: {
        Authorization: `Bearer ${verifyJwt}`,
        'Correlation-Context': correlationHeader,
      },
      settle: {
        Authorization: `Bearer ${settleJwt}`,
        'Correlation-Context': correlationHeader,
      },
      supported: {
        Authorization: `Bearer ${supportedJwt}`,
        'Correlation-Context': correlationHeader,
      },
    };
  };
}

// =============================================================================
// CDP Credentials Retrieval
// =============================================================================
// 
// ⚠️  DEMO MODE: Credentials are configured in config.ts (NOT secure for production!)
// 
// For production, use AWS Secrets Manager. See the commented code below.
// =============================================================================

// =============================================================================
// AWS Secrets Manager (Production)
// =============================================================================
// 
// Uncomment and use this for production deployments.
// 
// Prerequisites:
// 1. Create a secret in AWS Secrets Manager in us-east-1 region
// 2. Store your CDP credentials as JSON:
//    {
//      "apiKeyId": "your-cdp-api-key-id",
//      "apiKeySecret": "your-cdp-api-key-secret-pem"
//    }
// 3. Grant your Lambda execution role permission to access the secret
// 4. Add @aws-sdk/client-secrets-manager to your dependencies
// 
// Note: Lambda@Edge functions replicate to all edge locations (RECs), but
// secrets should be stored in us-east-1. The SDK client must be configured
// to fetch from us-east-1 regardless of where the Lambda@Edge function executes.
// =============================================================================

/*
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const SECRET_NAME = 'x402/cdp-credentials';
const REGION = 'us-east-1'; // Secrets Manager region (Lambda@Edge functions run in RECs but fetch secrets from us-east-1)

// Cache credentials to avoid repeated API calls
let cachedCredentials: CDPCredentials | null = null;

export async function getCDPCredentialsFromSecretsManager(): Promise<CDPCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const client = new SecretsManagerClient({ region: REGION });
  const command = new GetSecretValueCommand({ SecretId: SECRET_NAME });

  try {
    const response = await client.send(command);
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }
    cachedCredentials = JSON.parse(response.SecretString) as CDPCredentials;
    return cachedCredentials;
  } catch (error) {
    console.error('Failed to retrieve CDP credentials from Secrets Manager:', error);
    throw new Error('Failed to retrieve CDP API keys. Check Secrets Manager configuration.');
  }
}
*/
