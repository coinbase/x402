import { config } from 'dotenv';
import { TestDiscovery } from './src/discovery';
import { ServerConfig, ClientConfig, ScenarioResult } from './src/types';
import { config as loggerConfig, log, verboseLog, errorLog, close as closeLogger } from './src/logger';

// Load environment variables
config();

// Parse command line arguments
const args = process.argv.slice(2);

// Parse dev mode flag (sets network=base-sepolia, prod=false)
const isDevMode = args.includes('--dev') || args.includes('-d');

// Parse verbose flag
const isVerbose = args.includes('-v') || args.includes('--verbose');

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

async function runCallProtectedScenario(
  server: any,
  client: any,
  serverConfig: ServerConfig,
  callConfig: ClientConfig
): Promise<ScenarioResult> {
  try {
    verboseLog(`  🚀 Starting server with config: ${JSON.stringify(serverConfig, null, 2)}`);
    await server.start(serverConfig);

    // Wait for server to be healthy before proceeding
    let healthCheckAttempts = 0;
    const maxHealthCheckAttempts = 10;

    while (healthCheckAttempts < maxHealthCheckAttempts) {
      const healthResult = await server.health();
      verboseLog(`  🔍 Health check attempt ${healthCheckAttempts + 1}/${maxHealthCheckAttempts}: ${healthResult.success ? '✅' : '❌'}`);

      if (healthResult.success) {
        verboseLog(`  ✅ Server is healthy after ${healthCheckAttempts + 1} attempts`);
        break;
      }

      healthCheckAttempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (healthCheckAttempts >= maxHealthCheckAttempts) {
      verboseLog(`  ❌ Server failed to become healthy after ${maxHealthCheckAttempts} attempts`);
      return {
        success: false,
        error: 'Server failed to become healthy after maximum attempts'
      };
    }

    verboseLog(`  📞 Making client call with config: ${JSON.stringify(callConfig, null, 2)}`);
    const result = await client.call(callConfig);

    verboseLog(`  📊 Client call result: ${JSON.stringify(result, null, 2)}`);

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
    verboseLog(`  💥 Scenario failed with error: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // Cleanup
    verboseLog(`  🧹 Cleaning up server and client processes`);
    await server.stop();
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
  const discovery = new TestDiscovery('.');
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

  console.info(scenarios);

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

    console.info(networkFilter, scenario.facilitatorNetworkCombo.network);

    // Network filter - if set, only run tests for these networks
    if (networkFilter && !(networkFilter.includes(scenario.facilitatorNetworkCombo.network))) return false;


    console.info(protocolFamilyFilters, scenario.protocolFamily);

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

  // Run filtered scenarios
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < filteredScenarios.length; i++) {
    const scenario = filteredScenarios[i];
    const testNumber = i + 1;
    const combo = scenario.facilitatorNetworkCombo;
    const comboLabel = `useCdpFacilitator=${combo.useCdpFacilitator}, networks=[${combo.network}]`;
    const testName = `${scenario.client.name} → ${scenario.server.name} → ${scenario.endpoint.path} [${comboLabel}]`;

    const serverConfig: ServerConfig = {
      port: serverPort,
      useCdpFacilitator: combo.useCdpFacilitator,
      evmPayTo: serverEvmAddress,
      svmPayTo: serverSvmAddress,
      evmNetwork: scenario.protocolFamily === 'evm' ? combo.network : 'base-sepolia',
      svmNetwork: scenario.protocolFamily === 'svm' ? combo.network : 'solana-devnet',
    };

    const callConfig: ClientConfig = {
      evmPrivateKey: clientEvmPrivateKey,
      svmPrivateKey: clientSvmPrivateKey,
      serverUrl: scenario.server.proxy.getUrl(),
      endpointPath: scenario.endpoint.path
    };

    try {
      log(`🧪 Testing #${testNumber}: ${testName}`);
      const result = await runCallProtectedScenario(
        scenario.server.proxy,
        scenario.client.proxy,
        serverConfig,
        callConfig
      );

      if (result.success) {
        verboseLog(`  ✅ Test passed`);
        passed++;
      } else {
        log(`❌ #${testNumber} ${testName}: ${result.error}`);
        verboseLog(`  🔍 Error details: ${JSON.stringify(result, null, 2)}`);
        failed++;
      }
    } catch (error) {
      log(`❌ #${testNumber} ${testName}: ${error}`);
      verboseLog(`  🔍 Exception details: ${error}`);
      failed++;
    }
  }

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