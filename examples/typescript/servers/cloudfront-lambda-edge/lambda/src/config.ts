/**
 * x402 Configuration
 * 
 * Customize these values for your deployment.
 * Lambda@Edge doesn't support environment variables, so config is bundled.
 */

import type { RoutesConfig, FacilitatorConfig } from '@x402/core/server';
import { createCDPAuthHeaders } from './facilitator-auth';

// =============================================================================
// FACILITATOR CONFIGURATION
// =============================================================================

/**
 * Facilitator type
 * 
 * - 'x402.org': Free testnet facilitator (no auth required)
 * - 'cdp': Coinbase Developer Platform (requires API keys)
 * - 'custom': Custom facilitator (configure URL and auth as needed)
 */
export type FacilitatorType = 'x402.org' | 'cdp' | 'custom';

/**
 * Current facilitator type
 */
export const FACILITATOR_TYPE: FacilitatorType = 'x402.org';

/**
 * Facilitator URL
 * 
 * Examples:
 * - x402.org testnet: 'https://x402.org/facilitator'
 * - CDP mainnet: 'https://api.cdp.coinbase.com/platform/v2/x402'
 * - Custom: Your facilitator URL
 */
export const FACILITATOR_URL = 'https://x402.org/facilitator';

/**
 * Network for payments
 * 
 * Examples:
 * - Base Sepolia (testnet): 'eip155:84532'
 * - Base (mainnet): 'eip155:8453'
 * - Solana Devnet: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
 * - Solana Mainnet: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
 */
export const NETWORK = 'eip155:84532';

/**
 * Your wallet address to receive payments
 */
export const PAY_TO = '0xYourPaymentAddressHere';

// =============================================================================
// CDP CREDENTIALS (only required for CDP facilitator)
// =============================================================================

/**
 * CDP API Key ID
 * 
 * Get your keys at: https://cdp.coinbase.com
 * Only required when FACILITATOR_TYPE is 'cdp'
 */
export const CDP_API_KEY_ID = 'your-cdp-api-key-id';

/**
 * CDP API Key Secret (PEM format)
 * 
 * Only required when FACILITATOR_TYPE is 'cdp'
 * The secret should be in EC PEM format from CDP portal
 */
export const CDP_API_KEY_SECRET = 'your-cdp-api-key-secret-pem-here';

// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * Creates authentication headers for the facilitator.
 * 
 * Returns undefined for facilitators that don't require auth (like x402.org testnet).
 * 
 * For production, uncomment the Secrets Manager code in facilitator-auth.ts
 * and use getCDPCredentialsFromSecretsManager() instead.
 */
export async function getAuthHeaders(): Promise<FacilitatorConfig['createAuthHeaders'] | undefined> {
  switch (FACILITATOR_TYPE) {
    case 'cdp': {
      // Validate credentials are configured
      if (CDP_API_KEY_ID === 'your-cdp-api-key-id') {
        throw new Error(
          'CDP API keys not configured. Update CDP_API_KEY_ID and CDP_API_KEY_SECRET in config.ts\n' +
          'Get your keys at: https://cdp.coinbase.com'
        );
      }

      // Demo mode: use bundled credentials from config
      const credentials = { apiKeyId: CDP_API_KEY_ID, apiKeySecret: CDP_API_KEY_SECRET };

      // Production mode: uncomment to use AWS Secrets Manager
      // import { getCDPCredentialsFromSecretsManager } from './facilitator-auth';
      // const credentials = await getCDPCredentialsFromSecretsManager();

      return createCDPAuthHeaders(credentials);
    }

    case 'x402.org':
      // x402.org testnet doesn't require authentication
      return undefined;

    case 'custom':
      // For custom facilitators, implement your auth logic here
      // Example: return yourCustomAuthHeadersFunction();
      return undefined;

    default:
      throw new Error(`Unknown facilitator type: ${FACILITATOR_TYPE}`);
  }
}

// =============================================================================
// ROUTE CONFIGURATION
// =============================================================================

export const ROUTES: RoutesConfig = {
  '/api/*': {
    accepts: {
      scheme: 'exact',
      network: NETWORK,
      payTo: PAY_TO,
      price: '$0.001',
    },
    description: 'API access',
  },
  '/api/premium/**': {
    accepts: {
      scheme: 'exact',
      network: NETWORK,
      payTo: PAY_TO,
      price: '$0.01',
    },
    description: 'Premium API access',
  },
  '/content/**': {
    accepts: {
      scheme: 'exact',
      network: NETWORK,
      payTo: PAY_TO,
      price: '$0.005',
    },
    description: 'Premium content',
  },
};
