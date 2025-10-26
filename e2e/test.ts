import { config } from 'dotenv';
import { TestDiscovery } from './src/discovery';
import { ClientConfig, ScenarioResult, TestScenario } from './src/types';
import { config as loggerConfig, log, verboseLog, errorLog, close as closeLogger } from './src/logger';

export interface ServerConfig {
  port: number;
  useCdpFacilitator: boolean;
  evmPayTo: string;
  svmPayTo: string;
  evmNetwork: string;
  svmNetwork: string;
  facilitatorUrl?: string;
}

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);

// Parse dev mode flag (sets network=base-sepolia, prod=false)
const isDevMode = args.includes('--dev') || args.includes('-d');

// Parse verbose flag
const isVerbose = args.includes('-v') || args.includes('--verbose');

// Parse legacy flag (includes /legacy directory in discovery)
const includeLegacy = args.includes('--legacy');

// Parse language flags
const languageFilters: string[] = [];
if (args.includes('-ts') || args.includes('--typescript')) languageFilters.push('typescript');
if (args.includes('-py') || args.includes('--python')) languageFilters.push('python');
if (args.includes('-go') || args.includes('--go')) languageFilters.push('go');

// Parse protocol family flags
const protocolFamilyFilters: string[] = [];
args.forEach((arg, index) => {
  if ((arg === '--family' || arg === '-f') && index + 1 < args.length) {
    protocolFamilyFilters.push(args[index + 1]);
  } else if (arg.startsWith('--family=')) {
    protocolFamilyFilters.push(arg.split('=')[1]);
  }
});

// Parse filter arguments
const clientFilter = args.find(arg => arg.startsWith('--client='))?.split('=')[1];
const serverFilter = args.find(arg => arg.startsWith('--server='))?.split('=')[1];
const networkFilter = isDevMode ? ['base-sepolia', 'solana-devnet'] :
  args.find(arg => arg.startsWith('--network='))?.split('=')[1] ?
    [args.find(arg => arg.startsWith('--network='))?.split('=')[1]!] :
    undefined;
const prodFilter = isDevMode ? 'false' : args.find(arg => arg.startsWith('--prod='))?.split('=')[1];

// Parse log file argument
const logFile = args.find(arg => arg.startsWith('--log-file='))?.split('=')[1];

// Initialize logger
loggerConfig({ logFile, verbose: isVerbose });

// FacilitatorManager handles async facilitator lifecycle
class FacilitatorManager {
  private facilitator: any;
  private port: number;
  private readyPromise: Promise<string | null>;
  private url: string | null = null;

  constructor(facilitator: any, port: number, evmNetwork: string, svmNetwork: string) {
    this.facilitator = facilitator;
    this.port = port;

    // Start facilitator and health checks asynchronously
    this.readyPromise = this.startAndWaitForHealth(evmNetwork, svmNetwork);
  }

  private async startAndWaitForHealth(evmNetwork: string, svmNetwork: string): Promise<string | null> {
    verboseLog(`  🏛️ Starting facilitator on port ${this.port}...`);

    await this.facilitator.start({
      port: this.port,
      evmPrivateKey: process.env.CLIENT_EVM_PRIVATE_KEY,
      svmPrivateKey: process.env.CLIENT_SVM_PRIVATE_KEY,
      evmNetwork,
      svmNetwork,
    });

    // Wait for facilitator to be healthy
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const healthResult = await this.facilitator.health();
      verboseLog(`  🔍 Facilitator health check ${attempts + 1}/${maxAttempts}: ${healthResult.success ? '✅' : '❌'}`);

      if (healthResult.success) {
        verboseLog(`  ✅ Facilitator is healthy`);
        this.url = this.facilitator.getUrl();
        return this.url;
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    verboseLog(`  ❌ Facilitator failed to become healthy`);
    return null;
  }

  async ready(): Promise<string | null> {
    return this.readyPromise;
  }

  async stop(): Promise<void> {
    if (this.facilitator) {
      await this.facilitator.stop();
    }
  }
}

async function startServer(
  server: any,
  serverConfig: ServerConfig
): Promise<boolean> {
  verboseLog(`  🚀 Starting server on port ${serverConfig.port}...`);
  await server.start(serverConfig);

  // Wait for server to be healthy
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const healthResult = await server.health();
    verboseLog(`  🔍 Server health check ${attempts + 1}/${maxAttempts}: ${healthResult.success ? '✅' : '❌'}`);

    if (healthResult.success) {
      verboseLog(`  ✅ Server is healthy`);
      return true;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  verboseLog(`  ❌ Server failed to become healthy`);
  return false;
}

async function runClientTest(
  client: any,
  callConfig: ClientConfig
): Promise<ScenarioResult> {
  try {
    verboseLog(`  📞 Running client: ${JSON.stringify(callConfig, null, 2)}`);
    const result = await client.call(callConfig);
    verboseLog(`  📊 Client result: ${JSON.stringify(result, null, 2)}`);

    if (result.success) {
      return {
        success: true,
        data: result.data,
        status_code: result.status_code,
        payment_response: result.payment_response
      };
    } else {
      return {
        success: false,
        error: result.error
      };
    }
  } catch (error) {
    verboseLog(`  💥 Client failed: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await client.forceStop();
  }
}

async function runTest() {
  // Show help if requested
  if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: npm test [options]');
    console.log('');
    console.log('Options:');
    console.log('Environment:');
    console.log('  -d, --dev                  Development mode (base-sepolia, no CDP)');
    console.log('  -v, --verbose              Enable verbose logging');
    console.log('  --legacy                   Include legacy implementations from /legacy directory');
    console.log('  -ts, --typescript          Include TypeScript implementations');
    console.log('  -py, --python              Include Python implementations');
    console.log('  -go, --go                  Include Go implementations');
    console.log('');
    console.log('Filters:');
    console.log('  --log-file=<path>          Save verbose output to file');
    console.log('  --client=<n>               Filter by client name (e.g., httpx, axios)');
    console.log('  --server=<n>               Filter by server name (e.g., express, fastapi)');
    console.log('  --network=<n>              Filter by network (base, base-sepolia)');
    console.log('  --prod=<true|false>        Filter by production vs testnet scenarios');
    console.log('  -f, --family=<protocol>    Filter by protocol family (evm, svm) - can be used multiple times');
    console.log('  -h, --help                 Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm test                         # Run all tests');
    console.log('  pnpm test -d                      # Run tests in development mode');
    console.log('  pnpm test -py -go                 # Test Python and Go implementations');
    console.log('  pnpm test -ts --client=axios      # Test TypeScript axios client');
    console.log('  pnpm test -d -py                  # Dev mode, Python implementations only');
    console.log('  pnpm test --network=base --prod=true # Base mainnet only');
    console.log('  pnpm test -f evm                  # Test EVM protocol family only');
    console.log('  pnpm test -f evm -f svm           # Test both EVM and SVM protocol families');
    console.log('  pnpm test --legacy                # Include legacy implementations');
    console.log('  pnpm test --legacy -d -ts         # Test legacy + new TypeScript implementations');
    console.log('');
    return;
  }

  log('🚀 Starting X402 E2E Test Suite');
  log('===============================');

  // Load configuration from environment
  const serverEvmAddress = process.env.SERVER_EVM_ADDRESS;
  const serverSvmAddress = process.env.SERVER_SVM_ADDRESS;
  const clientEvmPrivateKey = process.env.CLIENT_EVM_PRIVATE_KEY;
  const clientSvmPrivateKey = process.env.CLIENT_SVM_PRIVATE_KEY;
  const serverPort = parseInt(process.env.SERVER_PORT || '4021');

  if (!serverEvmAddress || !serverSvmAddress || !clientEvmPrivateKey || !clientSvmPrivateKey) {
    errorLog('❌ Missing required environment variables:');
    errorLog('   SERVER_EVM_ADDRESS, SERVER_SVM_ADDRESS, CLIENT_EVM_PRIVATE_KEY and CLIENT_SVM_PRIVATE_KEY must be set');
    process.exit(1);
  }

  // Discover all servers and clients
  const discovery = new TestDiscovery('.', includeLegacy);
  discovery.printDiscoverySummary();

  const scenarios = discovery.generateTestScenarios();

  if (scenarios.length === 0) {
    log('❌ No test scenarios found');
    return;
  }

  // Count active filters
  interface FilterInfo {
    name: string;
    value: string;
  }

  const activeFilters: FilterInfo[] = [
    languageFilters.length > 0 && { name: 'Languages', value: languageFilters.join(', ') },
    clientFilter && { name: 'Client', value: clientFilter },
    serverFilter && { name: 'Server', value: serverFilter },
    networkFilter && { name: 'Network', value: networkFilter.join(', ') },
    prodFilter && { name: 'Production', value: prodFilter },
    protocolFamilyFilters.length > 0 && { name: 'Protocol Families', value: protocolFamilyFilters.join(', ') }
  ].filter((f): f is FilterInfo => f !== null && f !== undefined);

  log('📊 Test Scenarios');
  log('===============');
  log(`Total unfiltered scenarios: ${scenarios.length}`);
  if (activeFilters.length > 0) {
    log(`Active filters (${activeFilters.length}):`);
    activeFilters.forEach(filter => {
      log(`   - ${filter.name}: ${filter.value}`);
    });
  } else {
    log('No active filters');
  }

  // Filter scenarios based on command line arguments
  const filteredScenarios = scenarios.filter(scenario => {
    // Language filter - if languages specified, both client and server must match one of them
    if (languageFilters.length > 0) {
      const matchesLanguage = languageFilters.some(lang =>
        scenario.client.config.language.includes(lang) &&
        scenario.server.config.language.includes(lang)
      );
      if (!matchesLanguage) return false;
    }

    // Client filter - if set, only run tests for this client
    if (clientFilter && scenario.client.name !== clientFilter) return false;

    // Server filter - if set, only run tests for this server
    if (serverFilter && scenario.server.name !== serverFilter) return false;

    // Network filter - if set, only run tests for these networks
    if (networkFilter && !(networkFilter.includes(scenario.facilitatorNetworkCombo.network))) return false;

    // Protocol family filter - if set, only run tests for these protocol families
    if (protocolFamilyFilters.length > 0 && !protocolFamilyFilters.includes(scenario.protocolFamily)) return false;

    // Production filter - if set, filter by production vs testnet scenarios
    if (prodFilter !== undefined) {
      const isProd = prodFilter.toLowerCase() === 'true';
      const isTestnetOnly = !scenario.facilitatorNetworkCombo.useCdpFacilitator && (scenario.facilitatorNetworkCombo.network === 'base-sepolia' || scenario.facilitatorNetworkCombo.network === 'solana-devnet');
      if (isProd && isTestnetOnly) return false;
      if (!isProd && !isTestnetOnly) return false;
    }

    return true;
  });

  if (filteredScenarios.length === 0) {
    log('❌ No scenarios match the active filters');
    return;
  }

  log(`Scenarios to run: ${filteredScenarios.length}`);
  log('');

  // Collect unique facilitators and servers
  const uniqueFacilitators = new Map<string, any>();
  const uniqueServers = new Map<string, any>();

  filteredScenarios.forEach(scenario => {
    if (scenario.facilitator) {
      uniqueFacilitators.set(scenario.facilitator.name, scenario.facilitator);
    }
    uniqueServers.set(scenario.server.name, scenario.server);
  });

  let testResults: Array<{ name: string; passed: boolean; error?: string }> = [];
  let testNumber = 0;
  let currentPort = 4022;

  // Assign ports and start all facilitators and servers
  const facilitatorManagers = new Map<string, FacilitatorManager>();
  const serverInstances = new Map<string, { proxy: any; port: number }>();

  // Start all facilitators with unique ports
  for (const [facilitatorName, facilitator] of uniqueFacilitators) {
    const port = currentPort++;
    log(`\n🏛️ Starting facilitator: ${facilitatorName} on port ${port}`);

    const manager = new FacilitatorManager(
      facilitator.proxy,
      port,
      'eip155:84532',
      'solana:devnet'
    );
    facilitatorManagers.set(facilitatorName, manager);
  }

  // Start all servers with unique ports
  for (const [serverName, server] of uniqueServers) {
    const port = currentPort++;
    serverInstances.set(serverName, { proxy: server.proxy, port });
  }

  // Wait for all facilitators to be ready
  log('\n⏳ Waiting for all facilitators to be ready...');
  const facilitatorUrls = new Map<string, string>();

  for (const [facilitatorName, manager] of facilitatorManagers) {
    const url = await manager.ready();
    if (!url) {
      log(`❌ Failed to start facilitator ${facilitatorName}`);
      process.exit(1);
    }
    facilitatorUrls.set(facilitatorName, url);
    log(`  ✅ Facilitator ${facilitatorName} ready at ${url}`);
  }

  // Start all servers
  log('\n⏳ Starting all servers...');
  for (const [serverName, serverInfo] of serverInstances) {
    log(`  🚀 Starting server: ${serverName} on port ${serverInfo.port}`);

    // Find which facilitator URL this server should use (from first matching scenario)
    const serverScenario = filteredScenarios.find(s => s.server.name === serverName);
    const facilitatorUrl = serverScenario?.facilitator ?
      facilitatorUrls.get(serverScenario.facilitator.name) : undefined;

    const serverConfig: ServerConfig = {
      port: serverInfo.port,
      useCdpFacilitator: false,
      evmPayTo: serverEvmAddress,
      svmPayTo: serverSvmAddress,
      evmNetwork: 'eip155:84532',
      svmNetwork: 'solana:devnet',
      facilitatorUrl,
    };

    const started = await startServer(serverInfo.proxy, serverConfig);
    if (!started) {
      log(`❌ Failed to start server ${serverName}`);
      process.exit(1);
    }
    log(`  ✅ Server ${serverName} ready`);
  }

  log('\n✅ All facilitators and servers are ready! Running client tests sequentially...\n');

  // Run client tests sequentially to avoid nonce conflicts
  for (const scenario of filteredScenarios) {
    testNumber++;
    const facilitatorLabel = scenario.facilitator ? ` via ${scenario.facilitator.name}` : '';
    const testName = `${scenario.client.name} → ${scenario.server.name} → ${scenario.endpoint.path}${facilitatorLabel}`;

    const serverInfo = serverInstances.get(scenario.server.name)!;

    const clientConfig: ClientConfig = {
      evmPrivateKey: clientEvmPrivateKey,
      svmPrivateKey: clientSvmPrivateKey,
      serverUrl: `http://localhost:${serverInfo.port}`,
      endpointPath: scenario.endpoint.path,
    };

    try {
      log(`🧪 Test #${testNumber}: ${testName}`);
      const result = await runClientTest(scenario.client.proxy, clientConfig);

      if (result.success) {
        log(`  ✅ Test passed`);
        testResults.push({ name: testName, passed: true });
      } else {
        log(`  ❌ Test failed: ${result.error}`);
        verboseLog(`  🔍 Error details: ${JSON.stringify(result, null, 2)}`);
        testResults.push({ name: testName, passed: false, error: result.error });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`  ❌ Test failed with exception: ${errorMsg}`);
      verboseLog(`  🔍 Exception details: ${error}`);
      testResults.push({ name: testName, passed: false, error: errorMsg });
    }
  }

  // Clean up servers and facilitators
  log('\n🧹 Cleaning up...');
  for (const [serverName, serverInfo] of serverInstances) {
    log(`  🛑 Stopping server: ${serverName}`);
    await serverInfo.proxy.stop();
  }

  for (const [facilitatorName, manager] of facilitatorManagers) {
    log(`  🛑 Stopping facilitator: ${facilitatorName}`);
    await manager.stop();
  }

  // Calculate totals
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;

  // Summary
  log('');
  log('📊 Test Summary');
  log('==============');
  log(`✅ Passed: ${passed}`);
  log(`❌ Failed: ${failed}`);
  log(`📈 Total: ${passed + failed}`);

  // Protocol family breakdown
  const protocolBreakdown = filteredScenarios.reduce((acc, scenario) => {
    const key = scenario.protocolFamily;
    if (!acc[key]) acc[key] = { passed: 0, failed: 0, total: 0 };
    acc[key].total++;
    return acc;
  }, {} as Record<string, { passed: number; failed: number; total: number }>);

  if (Object.keys(protocolBreakdown).length > 1) {
    log('');
    log('📊 Protocol Family Breakdown:');
    Object.entries(protocolBreakdown).forEach(([protocol, stats]) => {
      log(`   ${protocol.toUpperCase()}: ${stats.total} scenarios tested`);
    });
  }

  // Close logger
  closeLogger();

  if (failed > 0) {
    process.exit(1);
  }
}

// Run the test
runTest().catch(error => errorLog(error));