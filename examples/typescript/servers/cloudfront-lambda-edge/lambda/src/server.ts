import type { RoutesConfig } from '@x402/core/server';
import { x402ResourceServer, x402HTTPResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

/**
 * x402 Configuration
 * 
 * Lambda@Edge doesn't support environment variables, so config is bundled.
 * Customize these values for your deployment.
 */
const FACILITATOR_URL = 'https://x402.org/facilitator';
const PAY_TO = '0xYourPaymentAddressHere';
const NETWORK = 'eip155:84532'; // Base Sepolia testnet. Use 'eip155:8453' for mainnet.

/**
 * Route Configuration
 */
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

// Server instance (initialized lazily on first request)
let httpServer: x402HTTPResourceServer | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get or create the x402 HTTP server instance
 */
export async function getServer(): Promise<x402HTTPResourceServer> {
  if (!httpServer) {
    const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
    const resourceServer = new x402ResourceServer(facilitator)
      .register(NETWORK, new ExactEvmScheme());
    httpServer = new x402HTTPResourceServer(resourceServer, ROUTES);
    initPromise = httpServer.initialize();
  }
  await initPromise;
  return httpServer;
}
