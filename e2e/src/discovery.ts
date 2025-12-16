import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { GenericServerProxy } from './servers/generic-server';
import { GenericClientProxy } from './clients/generic-client';
import { GenericFacilitatorProxy } from './facilitators/generic-facilitator';
import { log, verboseLog, errorLog } from './logger';
import {
  TestConfig,
  DiscoveredServer,
  DiscoveredClient,
  DiscoveredFacilitator,
  TestScenario,
  ProtocolFamily
} from './types';

// Will be populated with discovered facilitators
let facilitatorNetworkCombos: Array<{
  useCdpFacilitator: boolean;
  network: string;
  protocolFamily: ProtocolFamily;
  x402Version: number;
  facilitatorName?: string;
}> = [];

export class TestDiscovery {
  private baseDir: string;
  private includeLegacy: boolean;

  constructor(baseDir: string = '.', includeLegacy: boolean = false) {
    this.baseDir = baseDir;
    this.includeLegacy = includeLegacy;
  }

  getFacilitatorNetworkCombos(): typeof facilitatorNetworkCombos {
    return facilitatorNetworkCombos;
  }

  /**
   * Get default networks for a protocol family
   */
  getDefaultNetworksForProtocolFamily(protocolFamily: ProtocolFamily): string[] {
    switch (protocolFamily) {
      case 'evm':
        return ['base-sepolia'];
      case 'svm':
        return ['solana-devnet'];
      default:
        return [];
    }
  }

  /**
   * Get facilitator network combos for a specific protocol family
   */
  getFacilitatorNetworkCombosForProtocol(protocolFamily: ProtocolFamily): typeof facilitatorNetworkCombos {
    return facilitatorNetworkCombos.filter(combo => combo.protocolFamily === protocolFamily);
  }

  /**
   * Discover all servers in the servers directory
   */
  discoverServers(): DiscoveredServer[] {
    const servers: DiscoveredServer[] = [];

    // Discover servers from main servers directory
    const serversDir = join(this.baseDir, 'servers');
    if (existsSync(serversDir)) {
      this.discoverServersInDirectory(serversDir, servers);
    }

    // Discover servers from legacy directory if flag is set
    if (this.includeLegacy) {
      const legacyServersDir = join(this.baseDir, 'legacy', 'servers');
      if (existsSync(legacyServersDir)) {
        this.discoverServersInDirectory(legacyServersDir, servers, 'legacy-');
      }
    }

    return servers;
  }

  /**
   * Helper method to discover servers in a specific directory
   */
  private discoverServersInDirectory(serversDir: string, servers: DiscoveredServer[], namePrefix: string = ''): void {
    let serverDirs = readdirSync(serversDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const serverName of serverDirs) {
      const serverDir = join(serversDir, serverName);
      const configPath = join(serverDir, 'test.config.json');

      if (existsSync(configPath)) {
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          const config: TestConfig = JSON.parse(configContent);

          if (config.type === 'server') {
            servers.push({
              name: namePrefix + serverName,
              directory: serverDir,
              config,
              proxy: new GenericServerProxy(serverDir)
            });
          }
        } catch (error) {
          errorLog(`Failed to load config for server ${namePrefix}${serverName}: ${error}`);
        }
      }
    }
  }

  /**
   * Discover all clients in the clients directory
   */
  discoverClients(): DiscoveredClient[] {
    const clients: DiscoveredClient[] = [];

    // Discover clients from main clients directory
    const clientsDir = join(this.baseDir, 'clients');
    if (existsSync(clientsDir)) {
      this.discoverClientsInDirectory(clientsDir, clients);
    }

    // Discover clients from legacy directory if flag is set
    if (this.includeLegacy) {
      const legacyClientsDir = join(this.baseDir, 'legacy', 'clients');
      if (existsSync(legacyClientsDir)) {
        this.discoverClientsInDirectory(legacyClientsDir, clients, 'legacy-');
      }
    }

    return clients;
  }

  /**
   * Discover all facilitators in the facilitators directory
   */
  discoverFacilitators(): DiscoveredFacilitator[] {
    const facilitators: DiscoveredFacilitator[] = [];

    // Discover facilitators from main facilitators directory
    const facilitatorsDir = join(this.baseDir, 'facilitators');
    if (existsSync(facilitatorsDir)) {
      this.discoverFacilitatorsInDirectory(facilitatorsDir, facilitators);
    }

    // Discover facilitators from legacy directory if flag is set
    if (this.includeLegacy) {
      const legacyFacilitatorsDir = join(this.baseDir, 'legacy', 'facilitators');
      if (existsSync(legacyFacilitatorsDir)) {
        this.discoverFacilitatorsInDirectory(legacyFacilitatorsDir, facilitators, 'legacy-');
      }
    }

    return facilitators;
  }

  /**
   * Helper method to discover facilitators in a specific directory
   */
  private discoverFacilitatorsInDirectory(facilitatorsDir: string, facilitators: DiscoveredFacilitator[], namePrefix: string = '', isExternal: boolean = false): void {
    let facilitatorDirs = readdirSync(facilitatorsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const facilitatorName of facilitatorDirs) {
      const facilitatorDir = join(facilitatorsDir, facilitatorName);
      
      // Special case: external-proxies is a nested directory of more facilitators
      if (facilitatorName === 'external-proxies') {
        verboseLog(`  🔍 Found external-proxies directory, discovering nested facilitators...`);
        this.discoverFacilitatorsInDirectory(facilitatorDir, facilitators, '', true);
        continue;
      }
      
      // Special case: local is a nested directory of more facilitators (inherits isExternal from parent)
      if (facilitatorName === 'local') {
        verboseLog(`  🔍 Found local directory, discovering nested facilitators...`);
        this.discoverFacilitatorsInDirectory(facilitatorDir, facilitators, '', isExternal);
        continue;
      }
      
      const configPath = join(facilitatorDir, 'test.config.json');

      if (existsSync(configPath)) {
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          const config: TestConfig = JSON.parse(configContent);

          if (config.type === 'facilitator') {
            facilitators.push({
              name: namePrefix + facilitatorName,
              directory: facilitatorDir,
              config,
              proxy: new GenericFacilitatorProxy(facilitatorDir),
              isExternal
            });
          }
        } catch (error) {
          errorLog(`Failed to load config for facilitator ${namePrefix}${facilitatorName}: ${error}`);
        }
      }
    }
  }

  /**
   * Helper method to discover clients in a specific directory
   */
  private discoverClientsInDirectory(clientsDir: string, clients: DiscoveredClient[], namePrefix: string = ''): void {
    let clientDirs = readdirSync(clientsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const clientName of clientDirs) {
      const clientDir = join(clientsDir, clientName);
      const configPath = join(clientDir, 'test.config.json');

      if (existsSync(configPath)) {
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          const config: TestConfig = JSON.parse(configContent);

          if (config.type === 'client') {
            clients.push({
              name: namePrefix + clientName,
              directory: clientDir,
              config,
              proxy: new GenericClientProxy(clientDir)
            });
          }
        } catch (error) {
          errorLog(`Failed to load config for client ${namePrefix}${clientName}: ${error}`);
        }
      }
    }
  }

  /**
   * Build facilitator network combos from discovered facilitators
   */
  private buildFacilitatorNetworkCombos(facilitators: DiscoveredFacilitator[]): void {
    facilitatorNetworkCombos = [];

    for (const facilitator of facilitators) {
      const protocolFamilies = facilitator.config.protocolFamilies || ['evm'];
      const x402Versions = facilitator.config.x402Versions || [2];

      for (const protocolFamily of protocolFamilies) {
        for (const x402Version of x402Versions) {
          // Add network combos based on protocol family
          if (protocolFamily === 'evm') {
            facilitatorNetworkCombos.push({
              useCdpFacilitator: false,
              network: 'eip155:84532',
              protocolFamily: protocolFamily as ProtocolFamily,
              x402Version,
              facilitatorName: facilitator.name
            });
          } else if (protocolFamily === 'svm') {
            facilitatorNetworkCombos.push({
              useCdpFacilitator: false,
              network: 'solana:devnet',
              protocolFamily: protocolFamily as ProtocolFamily,
              x402Version,
              facilitatorName: facilitator.name
            });
          }
        }
      }
    }

    // If no facilitators found, add a default combo for backward compatibility
    if (facilitatorNetworkCombos.length === 0) {
      facilitatorNetworkCombos.push({
        useCdpFacilitator: false,
        network: 'eip155:84532',
        protocolFamily: 'evm',
        x402Version: 2
      });
    }
  }

  /**
   * Generate all possible test scenarios
   */
  generateTestScenarios(): TestScenario[] {
    const servers = this.discoverServers();
    const clients = this.discoverClients();
    const facilitators = this.discoverFacilitators();

    // Build facilitator network combos from discovered facilitators
    this.buildFacilitatorNetworkCombos(facilitators);

    const scenarios: TestScenario[] = [];

    for (const client of clients) {
      // Default to EVM if no protocol families specified for backward compatibility
      const clientProtocolFamilies = client.config.protocolFamilies || ['evm'];

      // Get client's supported x402 versions (default to [1] for backward compatibility)
      const clientVersions = client.config.x402Versions;
      if (!clientVersions) {
        errorLog(`  ⚠️  Skipping ${client.name}: No x402 versions specified`);
        continue;
      }

      for (const server of servers) {
        // Get server's x402 version (default to 1 for backward compatibility)
        const serverVersion = server.config.x402Version;
        if (!serverVersion) {
          errorLog(`  ⚠️  Skipping ${server.name}: No x402 version specified`);
          continue;
        }

        // Check if client and server have compatible versions
        if (!clientVersions.includes(serverVersion)) {
          // Skip this client-server pair if versions don't overlap
          verboseLog(`  ⚠️  Skipping ${client.name} ↔ ${server.name}: Version mismatch (client supports [${clientVersions.join(', ')}], server implements ${serverVersion})`);
          continue;
        }

        // Only test endpoints that require payment
        const testableEndpoints = server.config.endpoints?.filter(endpoint => {
          // Only include endpoints that require payment
          return endpoint.requiresPayment;
        }) || [];

        for (const endpoint of testableEndpoints) {
          // Default to EVM if no protocol family specified for backward compatibility
          const endpointProtocolFamily = endpoint.protocolFamily || 'evm';

          // Only create scenarios where client supports endpoint's protocol family
          if (clientProtocolFamilies.includes(endpointProtocolFamily)) {
            // Get facilitator/network combos for this protocol family
            const combosForProtocol = this.getFacilitatorNetworkCombosForProtocol(endpointProtocolFamily);

            for (const combo of combosForProtocol) {
              // Skip if facilitator doesn't support the server's x402 version
              if (combo.x402Version !== serverVersion) {
                verboseLog(`  ⚠️  Skipping facilitator ${combo.facilitatorName} for ${server.name}: Version mismatch (facilitator supports v${combo.x402Version}, server implements v${serverVersion})`);
                continue;
              }

              // Find matching facilitator if specified
              const matchingFacilitator = combo.facilitatorName
                ? facilitators.find(f => f.name === combo.facilitatorName)
                : undefined;

              scenarios.push({
                client,
                server,
                facilitator: matchingFacilitator,
                endpoint,
                protocolFamily: endpointProtocolFamily,
                facilitatorNetworkCombo: {
                  useCdpFacilitator: combo.useCdpFacilitator,
                  network: combo.network
                }
              });
            }
          }
        }
      }
    }

    return scenarios;
  }

  /**
   * Print discovery summary
   */
  printDiscoverySummary(): void {
    const servers = this.discoverServers();
    const clients = this.discoverClients();
    const facilitators = this.discoverFacilitators();

    // Build combos to get accurate scenario count
    this.buildFacilitatorNetworkCombos(facilitators);
    const scenarios = this.generateTestScenarios();

    log('🔍 Test Discovery Summary');
    log('========================');
    if (this.includeLegacy) {
      log('🔄 Legacy mode enabled - including legacy implementations');
    }
    log(`📡 Servers found: ${servers.length}`);
    servers.forEach(server => {
      const paidEndpoints = server.config.endpoints?.filter(e => e.requiresPayment).length || 0;
      const protocolFamilies = new Set(
        server.config.endpoints?.filter(e => e.requiresPayment).map(e => e.protocolFamily || 'evm') || ['evm']
      );
      const version = server.config.x402Version || 1;
      log(`   - ${server.name} (${server.config.language}) v${version} - ${paidEndpoints} x402 endpoints [${Array.from(protocolFamilies).join(', ')}]`);
    });

    log(`📱 Clients found: ${clients.length}`);
    clients.forEach(client => {
      const protocolFamilies = client.config.protocolFamilies || ['evm'];
      const versions = client.config.x402Versions || [1];
      log(`   - ${client.name} (${client.config.language}) v[${versions.join(', ')}] [${protocolFamilies.join(', ')}]`);
    });

    log(`🏛️ Facilitators found: ${facilitators.length}`);
    
    const regularFacilitators = facilitators.filter(f => !f.isExternal);
    const externalFacilitators = facilitators.filter(f => f.isExternal);
    
    regularFacilitators.forEach(facilitator => {
      const protocolFamilies = facilitator.config.protocolFamilies || ['evm'];
      const versions = facilitator.config.x402Versions || [2];
      log(`   - ${facilitator.name} (${facilitator.config.language}) v[${versions.join(', ')}] [${protocolFamilies.join(', ')}]`);
    });
    
    if (externalFacilitators.length > 0) {
      log(`   External:`);
      externalFacilitators.forEach(facilitator => {
        const protocolFamilies = facilitator.config.protocolFamilies || ['evm'];
        const versions = facilitator.config.x402Versions || [2];
        log(`     - ${facilitator.name} (${facilitator.config.language}) v[${versions.join(', ')}] [${protocolFamilies.join(', ')}]`);
      });
    }

    log(`🔧 Facilitator/Network combos: ${this.getFacilitatorNetworkCombos().length}`);

    // Show protocol family breakdown
    const protocolBreakdown = scenarios.reduce((acc, scenario) => {
      acc[scenario.protocolFamily] = (acc[scenario.protocolFamily] || 0) + 1;
      return acc;
    }, {} as Record<ProtocolFamily, number>);

    log(`📊 Test scenarios: ${scenarios.length}`);
    Object.entries(protocolBreakdown).forEach(([protocol, count]) => {
      log(`   - ${protocol.toUpperCase()}: ${count} scenarios`);
    });
    log('');
  }
} 