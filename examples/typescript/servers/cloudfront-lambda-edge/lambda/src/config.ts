/**
 * x402 Lambda@Edge Configuration
 *
 * Configure your payment routes and settings here.
 * Lambda@Edge doesn't support environment variables, so all config is bundled.
 */

import type { Network } from '@x402/core';

export interface RouteConfig {
  /** Price in USD (e.g., '$0.001' or '0.001') */
  price: string;
  /** Human-readable description */
  description: string;
  /** Optional: Override default payTo address for this route */
  payTo?: `0x${string}`;
}

export interface X402Config {
  /** x402 facilitator URL */
  facilitatorUrl: string;
  /** Network in CAIP-2 format */
  network: Network;
  /** Default payment recipient address */
  payTo: `0x${string}`;
  /** Route-specific payment requirements */
  routes: Record<string, RouteConfig>;
}

/**
 * Your x402 configuration
 *
 * Networks:
 * - Testnet: 'eip155:84532' (Base Sepolia)
 * - Mainnet: 'eip155:8453' (Base)
 */
export const CONFIG: X402Config = {
  facilitatorUrl: 'https://x402.org/facilitator',
  network: 'eip155:84532',
  payTo: '0xYourPaymentAddressHere',
  routes: {
    // Example routes - customize for your use case
    '/api/*': {
      price: '$0.001',
      description: 'API access',
    },
    '/api/premium/**': {
      price: '$0.01',
      description: 'Premium API access',
    },
    '/content/**': {
      price: '$0.005',
      description: 'Premium content',
    },
  },
};

// USDC asset info per network
const USDC_ASSETS: Record<string, { address: string; decimals: number }> = {
  'eip155:8453': { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  'eip155:84532': { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 },
};

export function getAssetInfo(network: Network) {
  const asset = USDC_ASSETS[network];
  if (!asset) throw new Error(`Unsupported network: ${network}`);
  return asset;
}

/**
 * Match a path against route patterns
 * - '*' matches single path segment
 * - '**' matches multiple segments
 */
export function matchRoute(path: string): RouteConfig | undefined {
  // Exact match first
  if (CONFIG.routes[path]) return CONFIG.routes[path];

  // Pattern matching (more specific patterns first)
  const patterns = Object.keys(CONFIG.routes).sort((a, b) => {
    const aDouble = a.includes('**') ? 1 : 0;
    const bDouble = b.includes('**') ? 1 : 0;
    if (aDouble !== bDouble) return aDouble - bDouble;
    return b.length - a.length;
  });

  for (const pattern of patterns) {
    if (matchPattern(pattern, path)) {
      return CONFIG.routes[pattern];
    }
  }
  return undefined;
}

function matchPattern(pattern: string, path: string): boolean {
  if (!pattern.includes('*')) {
    return path === pattern || path.startsWith(pattern + '/');
  }

  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);

  let pi = 0, pa = 0;

  while (pi < patternParts.length && pa < pathParts.length) {
    const pp = patternParts[pi];

    if (pp === '**') {
      if (pi === patternParts.length - 1) return true;
      const next = patternParts[pi + 1];
      while (pa < pathParts.length && pathParts[pa] !== next) pa++;
      pi++;
    } else if (pp === '*') {
      pi++; pa++;
    } else {
      if (pp !== pathParts[pa]) return false;
      pi++; pa++;
    }
  }

  if (pi === patternParts.length) return pa === pathParts.length;
  return pi === patternParts.length - 1 && patternParts[pi] === '**';
}
