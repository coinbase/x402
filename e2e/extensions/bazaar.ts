/**
 * Bazaar Discovery Extension Validation for E2E Tests
 * 
 * This module validates that the bazaar discovery extension is working correctly
 * by checking that facilitators have discovered all expected endpoints from servers.
 */

import { log, verboseLog, errorLog } from '../src/logger';
import type { FacilitatorProxy, DiscoveredServer, TestConfig } from '../src/types';

/**
 * Discovery resources response structure
 */
interface DiscoveryResourcesResponse {
  x402Version: number;
  items: Array<{
    resource: string;
    type: string;
    x402Version: number;
    accepts: any[];
    discoveryInfo?: any;
    lastUpdated: string;
    metadata?: Record<string, unknown>;
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

/**
 * Expected endpoint that should be discovered
 */
interface ExpectedDiscoverableEndpoint {
  serverName: string;
  serverUrl: string;
  endpointPath: string;
  method: string;
  description: string;
}

/**
 * Validation result for a single facilitator
 */
interface FacilitatorDiscoveryResult {
  facilitatorName: string;
  facilitatorUrl: string;
  totalDiscovered: number;
  expectedEndpoints: ExpectedDiscoverableEndpoint[];
  discoveredEndpoints: string[];
  missingEndpoints: ExpectedDiscoverableEndpoint[];
  unexpectedEndpoints: string[];
  success: boolean;
  error?: string;
}

/**
 * Overall discovery validation result
 */
export interface DiscoveryValidationResult {
  totalFacilitators: number;
  facilitatorsChecked: number;
  facilitatorResults: FacilitatorDiscoveryResult[];
  totalExpectedEndpoints: number;
  totalDiscoveredEndpoints: number;
  allEndpointsDiscovered: boolean;
  success: boolean;
}

/**
 * Check if a server supports the bazaar extension
 */
function serverSupportsBazaar(serverConfig: TestConfig): boolean {
  return serverConfig.extensions?.includes('bazaar') ?? false;
}

/**
 * Check if a facilitator supports the bazaar extension
 */
function facilitatorSupportsBazaar(facilitatorConfig: TestConfig): boolean {
  return facilitatorConfig.extensions?.includes('bazaar') ?? false;
}

/**
 * Get discoverable endpoints from a server config
 */
function getDiscoverableEndpoints(
  server: DiscoveredServer,
  serverPort: number
): ExpectedDiscoverableEndpoint[] {
  if (!serverSupportsBazaar(server.config)) {
    return [];
  }

  const serverUrl = `http://localhost:${serverPort}`;
  const discoverableEndpoints: ExpectedDiscoverableEndpoint[] = [];

  // Find all payment-required endpoints (these should have discovery info)
  const paymentEndpoints = server.config.endpoints?.filter(
    endpoint => endpoint.requiresPayment === true
  ) || [];

  for (const endpoint of paymentEndpoints) {
    discoverableEndpoints.push({
      serverName: server.config.name,
      serverUrl,
      endpointPath: endpoint.path,
      method: endpoint.method,
      description: endpoint.description,
    });
  }

  return discoverableEndpoints;
}

/**
 * Fetch discovered resources from a facilitator
 */
async function fetchDiscoveredResources(
  facilitatorProxy: FacilitatorProxy
): Promise<DiscoveryResourcesResponse | null> {
  try {
    const url = `${facilitatorProxy.getUrl()}/discovery/resources?limit=1000`;
    verboseLog(`  📡 Fetching discovered resources from: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      errorLog(`  ❌ Failed to fetch discovery resources: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data as DiscoveryResourcesResponse;
  } catch (error) {
    errorLog(`  ❌ Error fetching discovery resources: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Validate discovery for a single facilitator
 */
async function validateFacilitatorDiscovery(
  facilitatorProxy: FacilitatorProxy,
  facilitatorConfig: TestConfig,
  expectedEndpoints: ExpectedDiscoverableEndpoint[]
): Promise<FacilitatorDiscoveryResult> {
  const facilitatorName = facilitatorConfig.name;
  const facilitatorUrl = facilitatorProxy.getUrl();

  verboseLog(`\n  🔍 Validating discovery for facilitator: ${facilitatorName}`);
  verboseLog(`  📍 URL: ${facilitatorUrl}`);

  // Check if facilitator supports bazaar
  if (!facilitatorSupportsBazaar(facilitatorConfig)) {
    verboseLog(`  ⏭️  Facilitator does not support bazaar extension, skipping`);
    return {
      facilitatorName,
      facilitatorUrl,
      totalDiscovered: 0,
      expectedEndpoints: [],
      discoveredEndpoints: [],
      missingEndpoints: [],
      unexpectedEndpoints: [],
      success: true, // Not a failure if facilitator doesn't support bazaar
    };
  }

  // Fetch discovered resources
  const discoveryResponse = await fetchDiscoveredResources(facilitatorProxy);

  if (!discoveryResponse) {
    return {
      facilitatorName,
      facilitatorUrl,
      totalDiscovered: 0,
      expectedEndpoints,
      discoveredEndpoints: [],
      missingEndpoints: expectedEndpoints,
      unexpectedEndpoints: [],
      success: false,
      error: 'Failed to fetch discovery resources',
    };
  }

  verboseLog(`  📊 Total resources discovered: ${discoveryResponse.items.length}`);

  // Build set of discovered resource URLs for easy comparison
  const discoveredUrls = new Set(
    discoveryResponse.items.map(item => item.resource)
  );

  // Check which expected endpoints were discovered
  const missingEndpoints: ExpectedDiscoverableEndpoint[] = [];
  const discoveredEndpoints: string[] = [];

  for (const expected of expectedEndpoints) {
    const expectedResourceUrl = `${expected.serverUrl}${expected.endpointPath}`;

    if (discoveredUrls.has(expectedResourceUrl)) {
      discoveredEndpoints.push(expectedResourceUrl);
      verboseLog(`  ✅ Discovered: ${expected.method} ${expectedResourceUrl}`);
    } else {
      missingEndpoints.push(expected);
      verboseLog(`  ❌ Missing: ${expected.method} ${expectedResourceUrl}`);
    }
  }

  // Find any unexpected resources (discovered but not expected)
  const expectedUrls = new Set(
    expectedEndpoints.map(e => `${e.serverUrl}${e.endpointPath}`)
  );
  const unexpectedEndpoints = discoveryResponse.items
    .filter(item => !expectedUrls.has(item.resource))
    .map(item => item.resource);

  if (unexpectedEndpoints.length > 0) {
    verboseLog(`  ℹ️  Unexpected endpoints discovered: ${unexpectedEndpoints.length}`);
    unexpectedEndpoints.forEach(url => verboseLog(`     • ${url}`));
  }

  const success = missingEndpoints.length === 0;

  return {
    facilitatorName,
    facilitatorUrl,
    totalDiscovered: discoveryResponse.items.length,
    expectedEndpoints,
    discoveredEndpoints,
    missingEndpoints,
    unexpectedEndpoints,
    success,
  };
}

/**
 * Main discovery validation handler
 * 
 * Validates that all expected endpoints have been discovered by facilitators
 * 
 * @param facilitators - Array of facilitator proxies with their configs
 * @param servers - Array of discovered servers with their configs
 * @param serverPorts - Map of server name to port number
 * @param facilitatorServerMap - Optional map tracking which facilitators processed which servers (for minimized test runs)
 * @returns Validation result
 * 
 * @example
 * ```typescript
 * const result = await handleDiscoveryValidation(
 *   facilitators.map(f => ({ proxy: f.proxy, config: f.config })),
 *   servers,
 *   new Map([['express', 4021], ['hono', 4022]])
 * );
 * 
 * if (!result.success) {
 *   console.error('Discovery validation failed');
 * }
 * ```
 */
export async function handleDiscoveryValidation(
  facilitators: Array<{ proxy: FacilitatorProxy; config: TestConfig }>,
  servers: DiscoveredServer[],
  serverPorts: Map<string, number>,
  facilitatorServerMap?: Map<string, Set<string>>
): Promise<DiscoveryValidationResult> {
  log('\n╔════════════════════════════════════════════════════════╗');
  log('║         Bazaar Discovery Extension Validation          ║');
  log('╚════════════════════════════════════════════════════════╝');

  // Calculate all expected discoverable endpoints
  const allExpectedEndpoints: ExpectedDiscoverableEndpoint[] = [];

  for (const server of servers) {
    const serverPort = serverPorts.get(server.config.name);
    if (!serverPort) {
      verboseLog(`  ⚠️  No port found for server: ${server.config.name}, skipping`);
      continue;
    }

    const serverEndpoints = getDiscoverableEndpoints(server, serverPort);
    allExpectedEndpoints.push(...serverEndpoints);
  }

  log(`\n📋 Expected Discoverable Endpoints: ${allExpectedEndpoints.length}`);
  if (allExpectedEndpoints.length > 0) {
    verboseLog('');
    allExpectedEndpoints.forEach(endpoint => {
      verboseLog(`  • ${endpoint.method} ${endpoint.serverUrl}${endpoint.endpointPath} (${endpoint.serverName})`);
    });
  }

  // Validate each facilitator
  const facilitatorResults: FacilitatorDiscoveryResult[] = [];
  let facilitatorsChecked = 0;
  let totalDiscovered = 0;

  for (const { proxy, config } of facilitators) {
    // Filter expected endpoints to only those from servers this facilitator actually processed
    let facilitatorExpectedEndpoints = allExpectedEndpoints;

    if (facilitatorServerMap) {
      const processedServers = facilitatorServerMap.get(config.name);
      if (processedServers && processedServers.size > 0) {
        facilitatorExpectedEndpoints = allExpectedEndpoints.filter(
          endpoint => processedServers.has(endpoint.serverName)
        );

        verboseLog(`\n  📋 Facilitator ${config.name} processed ${processedServers.size} server(s): ${Array.from(processedServers).join(', ')}`);
        verboseLog(`     Expected to discover ${facilitatorExpectedEndpoints.length} endpoint(s) from those servers`);
      }
    }

    const result = await validateFacilitatorDiscovery(
      proxy,
      config,
      facilitatorExpectedEndpoints
    );

    facilitatorResults.push(result);

    if (facilitatorSupportsBazaar(config)) {
      facilitatorsChecked++;
      totalDiscovered += result.totalDiscovered;
    }
  }

  // Determine overall success
  const allEndpointsDiscovered = facilitatorResults.every(r => r.success);
  const hasExpectedEndpoints = allExpectedEndpoints.length > 0;
  const success = !hasExpectedEndpoints || allEndpointsDiscovered;

  // Print summary
  log('\n═══════════════════════════════════════════════════════');
  log('                 Discovery Summary');
  log('═══════════════════════════════════════════════════════');
  log(`Total Facilitators:          ${facilitators.length}`);
  log(`Facilitators with Bazaar:    ${facilitatorsChecked}`);
  log(`Expected Endpoints:          ${allExpectedEndpoints.length}`);
  log(`Total Discovered Resources:  ${totalDiscovered}`);

  // Print per-facilitator results
  for (const result of facilitatorResults) {
    if (!facilitatorSupportsBazaar(facilitators.find(f => f.config.name === result.facilitatorName)!.config)) {
      continue;
    }

    log(`\n📍 ${result.facilitatorName}:`);
    log(`   Discovered: ${result.discoveredEndpoints.length}/${result.expectedEndpoints.length}`);

    if (result.missingEndpoints.length > 0) {
      errorLog(`   ❌ Missing: ${result.missingEndpoints.length}`);
      result.missingEndpoints.forEach(endpoint => {
        errorLog(`      • ${endpoint.method} ${endpoint.serverUrl}${endpoint.endpointPath}`);
      });
    } else if (result.expectedEndpoints.length > 0) {
      log(`   ✅ All expected endpoints discovered`);
    }

    if (result.unexpectedEndpoints.length > 0) {
      verboseLog(`   ℹ️  Unexpected: ${result.unexpectedEndpoints.length}`);
      result.unexpectedEndpoints.forEach(url => {
        verboseLog(`      • ${url}`);
      });
    }

    if (result.error) {
      errorLog(`   ❌ Error: ${result.error}`);
    }
  }

  log('\n═══════════════════════════════════════════════════════');
  if (success) {
    log('✅ Discovery Validation: PASSED');
  } else {
    errorLog('❌ Discovery Validation: FAILED');
  }
  log('═══════════════════════════════════════════════════════\n');

  return {
    totalFacilitators: facilitators.length,
    facilitatorsChecked,
    facilitatorResults,
    totalExpectedEndpoints: allExpectedEndpoints.length,
    totalDiscoveredEndpoints: totalDiscovered,
    allEndpointsDiscovered,
    success,
  };
}

/**
 * Checks if any servers or facilitators support the bazaar extension
 */
export function shouldRunDiscoveryValidation(
  facilitators: Array<{ config: TestConfig }>,
  servers: DiscoveredServer[]
): boolean {
  const hasServerWithBazaar = servers.some(s => serverSupportsBazaar(s.config));
  const hasFacilitatorWithBazaar = facilitators.some(f => facilitatorSupportsBazaar(f.config));

  return hasServerWithBazaar && hasFacilitatorWithBazaar;
}

