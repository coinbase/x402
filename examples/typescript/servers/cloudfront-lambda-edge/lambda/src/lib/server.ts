import type { RoutesConfig, FacilitatorConfig } from '@x402/core/server';
import { x402ResourceServer, x402HTTPResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

/**
 * Configuration for creating an x402 server
 */
export interface X402ServerConfig {
  /** Facilitator URL (e.g., 'https://x402.org/facilitator') */
  facilitatorUrl: string;
  /** Network ID (e.g., 'eip155:84532' for Base Sepolia) */
  network: string;
  /** Route configuration defining which paths require payment */
  routes: RoutesConfig;
  /** Optional function to create auth headers for the facilitator (required for CDP mainnet) */
  createAuthHeaders?: FacilitatorConfig['createAuthHeaders'];
}

/**
 * Creates and initializes an x402HTTPResourceServer.
 * 
 * @example
 * ```typescript
 * // Testnet (no auth)
 * const server = await createX402Server({
 *   facilitatorUrl: 'https://x402.org/facilitator',
 *   network: 'eip155:84532',
 *   routes: {
 *     '/api/*': {
 *       accepts: { scheme: 'exact', network: 'eip155:84532', payTo: '0x...', price: '$0.01' }
 *     }
 *   }
 * });
 * 
 * // Mainnet with CDP (requires auth)
 * const server = await createX402Server({
 *   facilitatorUrl: 'https://api.cdp.coinbase.com/platform/v2/x402',
 *   network: 'eip155:8453',
 *   routes: { ... },
 *   createAuthHeaders: createCDPAuthHeaders({ apiKeyId, apiKeySecret })
 * });
 * ```
 */
export async function createX402Server(config: X402ServerConfig): Promise<x402HTTPResourceServer> {
  const facilitator = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
    createAuthHeaders: config.createAuthHeaders,
  });
  const resourceServer = new x402ResourceServer(facilitator)
    .register(config.network as `${string}:${string}`, new ExactEvmScheme());

  const httpServer = new x402HTTPResourceServer(resourceServer, config.routes);
  await httpServer.initialize();

  return httpServer;
}
