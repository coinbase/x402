import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { GenericServerProxy } from './servers/generic-server';
import { GenericClientProxy } from './clients/generic-client';
import { log, verboseLog, errorLog } from './logger';
import {
  TestConfig,
  DiscoveredServer,
  DiscoveredClient,
  TestScenario
} from './types';

const facilitatorNetworkCombos = [
  { useCdpFacilitator: false, network: 'base-sepolia' },
  { useCdpFacilitator: true, network: 'base-sepolia' },
  { useCdpFacilitator: true, network: 'base' }
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
   * Discover all servers in the servers directory
   */
  discoverServers(): DiscoveredServer[] {
    const serversDir = join(this.baseDir, 'servers');
    if (!existsSync(serversDir)) {
      return [];
    }

    const servers: DiscoveredServer[] = [];
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
              name: serverName,
              directory: serverDir,
              config,
              proxy: new GenericServerProxy(serverDir)
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
              name: clientName,
              directory: clientDir,
              config,
              proxy: new GenericClientProxy(clientDir)
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
    const facilitatorNetworkCombos = this.getFacilitatorNetworkCombos();
    const scenarios: TestScenario[] = [];

    for (const client of clients) {
      for (const server of servers) {
        // Only test endpoints that require payment
        const testableEndpoints = server.config.endpoints?.filter(endpoint => {
          // Only include endpoints that require payment
          return endpoint.requiresPayment;
        }) || [];

        for (const endpoint of testableEndpoints) {
          for (const combo of facilitatorNetworkCombos) {
            scenarios.push({
              client,
              server,
              endpoint,
              facilitatorNetworkCombo: combo
            });
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
    servers.forEach(server => {
      const paidEndpoints = server.config.endpoints?.filter(e => e.requiresPayment).length || 0;
      log(`   - ${server.name} (${server.config.language}) - ${paidEndpoints} x402 endpoints`);
    });

    log(`📱 Clients found: ${clients.length}`);
    clients.forEach(client => {
      log(`   - ${client.name} (${client.config.language})`);
    });

    log(`🔧 Facilitator/Network combos: ${this.getFacilitatorNetworkCombos().length}`);
    log(`📊 Test scenarios: ${scenarios.length}`);
    log('');
  }
} 