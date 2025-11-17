import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { GenericServerProxy } from './servers/generic-server';
import { GenericClientProxy } from './clients/generic-client';
import { log, verboseLog, errorLog } from './logger';
import { TestConfig, DiscoveredServer, DiscoveredClient, TestScenario, ProtocolFamily } from './types';

const facilitatorNetworkCombos = [
  {
    useCdpFacilitator: false,
    network: 'base-sepolia',
    protocolFamily: 'evm' as ProtocolFamily,
  },
  {
    useCdpFacilitator: true,
    network: 'base-sepolia',
    protocolFamily: 'evm' as ProtocolFamily,
  },
  {
    useCdpFacilitator: true,
    network: 'base',
    protocolFamily: 'evm' as ProtocolFamily,
  },
  {
    useCdpFacilitator: false,
    network: 'solana-devnet',
    protocolFamily: 'svm' as ProtocolFamily,
  },
  {
    useCdpFacilitator: true,
    network: 'solana-devnet',
    protocolFamily: 'svm' as ProtocolFamily,
  },
  {
    useCdpFacilitator: true,
    network: 'solana',
    protocolFamily: 'svm' as ProtocolFamily,
  },
  {
    useCdpFacilitator: false,
    network: 'arc-testnet',
    protocolFamily: 'evm' as ProtocolFamily,
  },
];

export class TestDiscovery {
  private baseDir: string;

  constructor(baseDir: string = '.') {
    this.baseDir = baseDir;
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
        return ['base-sepolia', 'arc-testnet'];
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
    return facilitatorNetworkCombos.filter((combo) => combo.protocolFamily === protocolFamily);
  }

  /**
   * Discover all servers in the servers directory
   */
  discoverServers(): DiscoveredServer[] {
    const serversDir = join(this.baseDir, 'servers');
    if (!existsSync(serversDir)) {
      return [];
    }

    const servers: DiscoveredServer[] = [];
    let serverDirs = readdirSync(serversDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const serverName of serverDirs) {
      const serverDir = join(serversDir, serverName);
      const configPath = join(serverDir, 'test.config.json');

      if (existsSync(configPath)) {
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          const config: TestConfig = JSON.parse(configContent);

          if (config.type === 'server') {
            servers.push({
              name: serverName,
              directory: serverDir,
              config,
              proxy: new GenericServerProxy(serverDir),
            });
          }
        } catch (error) {
          errorLog(`Failed to load config for server ${serverName}: ${error}`);
        }
      }
    }

    return servers;
  }

  /**
   * Discover all clients in the clients directory
   */
  discoverClients(): DiscoveredClient[] {
    const clientsDir = join(this.baseDir, 'clients');
    if (!existsSync(clientsDir)) {
      return [];
    }

    const clients: DiscoveredClient[] = [];
    let clientDirs = readdirSync(clientsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const clientName of clientDirs) {
      const clientDir = join(clientsDir, clientName);
      const configPath = join(clientDir, 'test.config.json');

      if (existsSync(configPath)) {
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          const config: TestConfig = JSON.parse(configContent);

          if (config.type === 'client') {
            clients.push({
              name: clientName,
              directory: clientDir,
              config,
              proxy: new GenericClientProxy(clientDir),
            });
          }
        } catch (error) {
          errorLog(`Failed to load config for client ${clientName}: ${error}`);
        }
      }
    }

    return clients;
  }

  /**
   * Generate all possible test scenarios
   */
  generateTestScenarios(): TestScenario[] {
    const servers = this.discoverServers();
    const clients = this.discoverClients();
    const scenarios: TestScenario[] = [];

    for (const client of clients) {
      // Default to EVM if no protocol families specified for backward compatibility
      const clientProtocolFamilies = client.config.protocolFamilies || ['evm'];

      for (const server of servers) {
        // Only test endpoints that require payment
        const testableEndpoints =
          server.config.endpoints?.filter((endpoint) => {
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
              scenarios.push({
                client,
                server,
                endpoint,
                protocolFamily: endpointProtocolFamily,
                facilitatorNetworkCombo: {
                  useCdpFacilitator: combo.useCdpFacilitator,
                  network: combo.network,
                },
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
    const scenarios = this.generateTestScenarios();

    log('🔍 Test Discovery Summary');
    log('========================');
    log(`📡 Servers found: ${servers.length}`);
    servers.forEach((server) => {
      const paidEndpoints = server.config.endpoints?.filter((e) => e.requiresPayment).length || 0;
      const protocolFamilies = new Set(
        server.config.endpoints?.filter((e) => e.requiresPayment).map((e) => e.protocolFamily || 'evm') || ['evm']
      );
      log(
        `   - ${server.name} (${server.config.language}) - ${paidEndpoints} x402 endpoints [${Array.from(
          protocolFamilies
        ).join(', ')}]`
      );
    });

    log(`📱 Clients found: ${clients.length}`);
    clients.forEach((client) => {
      const protocolFamilies = client.config.protocolFamilies || ['evm'];
      log(`   - ${client.name} (${client.config.language}) [${protocolFamilies.join(', ')}]`);
    });

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
