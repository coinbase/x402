import { config } from 'dotenv';
import { TestDiscovery } from './src/discovery';
import { ClientConfig, ScenarioResult, TestScenario } from './src/types';
import { config as loggerConfig, log, verboseLog, errorLog, close as closeLogger } from './src/logger';

export interface ServerConfig {
  port: number;
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
): Promise<ScenarioResult & { verboseLogs?: string[] }> {
  const verboseLogs: string[] = [];

  const bufferLog = (msg: string) => {
    verboseLogs.push(msg);
  };

  try {
    bufferLog(`  📞 Running client: ${JSON.stringify(callConfig, null, 2)}`);
    const result = await client.call(callConfig);
    bufferLog(`  📊 Client result: ${JSON.stringify(result, null, 2)}`);

    // Check if the client execution succeeded
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Client execution failed',
        verboseLogs
      };
    }

    // Check if we got a 402 Payment Required response (payment failed)
    if (result.status_code === 402) {
      const errorData = result.data as any;
      const errorMsg = errorData?.error || 'Payment required - payment failed';
      return {
        success: false,
        error: `Payment failed (402): ${errorMsg}`,
        data: result.data,
        status_code: result.status_code,
        verboseLogs
      };
    }

    // For protected endpoints, verify the payment actually succeeded
    const paymentResponse = result.payment_response;
    if (paymentResponse) {
      // Payment was required - verify it succeeded
      if (!paymentResponse.success) {
        return {
          success: false,
          error: `Payment failed: ${paymentResponse.errorReason || 'unknown error'}`,
          data: result.data,
          status_code: result.status_code,
          payment_response: paymentResponse,
          verboseLogs
        };
      }

      // Payment should have a transaction hash
      if (!paymentResponse.transaction) {
        return {
          success: false,
          error: 'Payment succeeded but no transaction hash returned',
          data: result.data,
          status_code: result.status_code,
          payment_response: paymentResponse,
          verboseLogs
        };
      }

      // Payment should not have an error reason
      if (paymentResponse.errorReason) {
        return {
          success: false,
          error: `Payment has error reason: ${paymentResponse.errorReason}`,
          data: result.data,
          status_code: result.status_code,
          payment_response: paymentResponse,
          verboseLogs
        };
      }
    }

    // All checks passed
    return {
      success: true,
      data: result.data,
      status_code: result.status_code,
      payment_response: paymentResponse,
      verboseLogs
    };
  } catch (error) {
    bufferLog(`  💥 Client failed: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      verboseLogs
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
    console.log('  -f, --family=<protocol>    Filter by protocol family (evm, svm) - can be used multiple times');
    console.log('  -h, --help                 Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm test                         # Run all v2 tests');
    console.log('  pnpm test -v                      # Run with verbose logging');
    console.log('  pnpm test --legacy                # Include v1 legacy implementations');
    console.log('  pnpm test --legacy -ts            # Test legacy + new TypeScript implementations');
    console.log('  pnpm test -py -go                 # Test Python and Go implementations');
    console.log('  pnpm test -ts --client=fetch      # Test TypeScript fetch client');
    console.log('  pnpm test -f evm                  # Test EVM protocol family only');
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
    protocolFamilyFilters.length > 0 && { name: 'Protocol Families', value: protocolFamilyFilters.join(', ') }
  ].filter((f): f is FilterInfo => typeof f === 'object' && f !== null && 'name' in f && 'value' in f);

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

    // Protocol family filter - if set, only run tests for these protocol families
    if (protocolFamilyFilters.length > 0 && !protocolFamilyFilters.includes(scenario.protocolFamily)) return false;

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

  interface DetailedTestResult {
    testNumber: number;
    client: string;
    server: string;
    endpoint: string;
    facilitator: string;
    protocolFamily: string;
    passed: boolean;
    error?: string;
    transaction?: string;
    network?: string;
  }

  let testResults: DetailedTestResult[] = [];
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
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
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

  // Start all servers in parallel
  log('\n⏳ Starting all servers...');
  const serverStartPromises: Promise<void>[] = [];

  for (const [serverName, serverInfo] of serverInstances) {
    const serverTask = async () => {
      log(`  🚀 Starting server: ${serverName} on port ${serverInfo.port}`);

      // Find which facilitator URL this server should use (from first matching scenario)
      const serverScenario = filteredScenarios.find(s => s.server.name === serverName);
      const facilitatorUrl = serverScenario?.facilitator ?
        facilitatorUrls.get(serverScenario.facilitator.name) : undefined;

      const serverConfig: ServerConfig = {
        port: serverInfo.port,
        evmPayTo: serverEvmAddress,
        svmPayTo: serverSvmAddress,
        evmNetwork: 'eip155:84532',
        svmNetwork: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        facilitatorUrl,
      };

      const started = await startServer(serverInfo.proxy, serverConfig);
      if (!started) {
        log(`❌ Failed to start server ${serverName}`);
        process.exit(1);
      }
      log(`  ✅ Server ${serverName} ready`);
    };

    serverStartPromises.push(serverTask());
  }

  // Wait for all servers to be ready
  await Promise.all(serverStartPromises);

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

      const detailedResult: DetailedTestResult = {
        testNumber,
        client: scenario.client.name,
        server: scenario.server.name,
        endpoint: scenario.endpoint.path,
        facilitator: scenario.facilitator?.name || 'none',
        protocolFamily: scenario.protocolFamily,
        passed: result.success,
        error: result.error,
        transaction: result.payment_response?.transaction,
        network: result.payment_response?.network,
      };

      if (result.success) {
        log(`  ✅ Test passed`);
        testResults.push(detailedResult);
      } else {
        log(`  ❌ Test failed: ${result.error}`);

        // Print buffered verbose logs only for failed tests
        if (result.verboseLogs && result.verboseLogs.length > 0) {
          log(`  🔍 Verbose logs:`);
          result.verboseLogs.forEach(logLine => log(logLine));
        }

        verboseLog(`  🔍 Error details: ${JSON.stringify(result, null, 2)}`);
        testResults.push(detailedResult);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`  ❌ Test failed with exception: ${errorMsg}`);
      verboseLog(`  🔍 Exception details: ${error}`);
      testResults.push({
        testNumber,
        client: scenario.client.name,
        server: scenario.server.name,
        endpoint: scenario.endpoint.path,
        facilitator: scenario.facilitator?.name || 'none',
        protocolFamily: scenario.protocolFamily,
        passed: false,
        error: errorMsg,
      });
    }

    // Delay between tests to prevent timing/state/nonce issues
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Clean up servers and facilitators in parallel
  log('\n🧹 Cleaning up...');

  const serverStopPromises: Promise<void>[] = [];
  for (const [serverName, serverInfo] of serverInstances) {
    log(`  🛑 Stopping server: ${serverName}`);
    serverStopPromises.push(serverInfo.proxy.stop());
  }
  await Promise.all(serverStopPromises);

  const facilitatorStopPromises: Promise<void>[] = [];
  for (const [facilitatorName, manager] of facilitatorManagers) {
    log(`  🛑 Stopping facilitator: ${facilitatorName}`);
    facilitatorStopPromises.push(manager.stop());
  }
  await Promise.all(facilitatorStopPromises);

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
  log('');

  // Detailed results table
  log('📋 Detailed Test Results');
  log('========================');
  log('');

  // Group by status
  const passedTests = testResults.filter(r => r.passed);
  const failedTests = testResults.filter(r => !r.passed);

  if (passedTests.length > 0) {
    log('✅ PASSED TESTS:');
    log('');
    passedTests.forEach(test => {
      const txInfo = test.transaction ? ` | Tx: ${test.transaction.substring(0, 10)}...` : '';
      log(`  #${test.testNumber.toString().padStart(2, ' ')}: ${test.client} → ${test.server} → ${test.endpoint}`);
      log(`      Facilitator: ${test.facilitator} | Network: ${test.network || 'N/A'}${txInfo}`);
    });
    log('');
  }

  if (failedTests.length > 0) {
    log('❌ FAILED TESTS:');
    log('');
    failedTests.forEach(test => {
      log(`  #${test.testNumber.toString().padStart(2, ' ')}: ${test.client} → ${test.server} → ${test.endpoint}`);
      log(`      Facilitator: ${test.facilitator}`);
      log(`      Error: ${test.error || 'Unknown error'}`);
    });
    log('');
  }

  // Breakdown by facilitator
  const facilitatorBreakdown = testResults.reduce((acc, test) => {
    const key = test.facilitator;
    if (!acc[key]) acc[key] = { passed: 0, failed: 0 };
    if (test.passed) acc[key].passed++;
    else acc[key].failed++;
    return acc;
  }, {} as Record<string, { passed: number; failed: number }>);

  log('📊 Breakdown by Facilitator:');
  Object.entries(facilitatorBreakdown).forEach(([facilitator, stats]) => {
    const total = stats.passed + stats.failed;
    const passRate = total > 0 ? Math.round((stats.passed / total) * 100) : 0;
    log(`   ${facilitator.padEnd(15)} ✅ ${stats.passed} / ❌ ${stats.failed} (${passRate}%)`);
  });
  log('');

  // Breakdown by server
  const serverBreakdown = testResults.reduce((acc, test) => {
    const key = test.server;
    if (!acc[key]) acc[key] = { passed: 0, failed: 0 };
    if (test.passed) acc[key].passed++;
    else acc[key].failed++;
    return acc;
  }, {} as Record<string, { passed: number; failed: number }>);

  log('📊 Breakdown by Server:');
  Object.entries(serverBreakdown).forEach(([server, stats]) => {
    const total = stats.passed + stats.failed;
    const passRate = total > 0 ? Math.round((stats.passed / total) * 100) : 0;
    log(`   ${server.padEnd(20)} ✅ ${stats.passed} / ❌ ${stats.failed} (${passRate}%)`);
  });
  log('');

  // Breakdown by client
  const clientBreakdown = testResults.reduce((acc, test) => {
    const key = test.client;
    if (!acc[key]) acc[key] = { passed: 0, failed: 0 };
    if (test.passed) acc[key].passed++;
    else acc[key].failed++;
    return acc;
  }, {} as Record<string, { passed: number; failed: number }>);

  log('📊 Breakdown by Client:');
  Object.entries(clientBreakdown).forEach(([client, stats]) => {
    const total = stats.passed + stats.failed;
    const passRate = total > 0 ? Math.round((stats.passed / total) * 100) : 0;
    log(`   ${client.padEnd(20)} ✅ ${stats.passed} / ❌ ${stats.failed} (${passRate}%)`);
  });
  log('');

  // Protocol family breakdown
  const protocolBreakdown = testResults.reduce((acc, test) => {
    const key = test.protocolFamily;
    if (!acc[key]) acc[key] = { passed: 0, failed: 0 };
    if (test.passed) acc[key].passed++;
    else acc[key].failed++;
    return acc;
  }, {} as Record<string, { passed: number; failed: number }>);

  if (Object.keys(protocolBreakdown).length > 1) {
    log('📊 Protocol Family Breakdown:');
    Object.entries(protocolBreakdown).forEach(([protocol, stats]) => {
      const total = stats.passed + stats.failed;
      log(`   ${protocol.toUpperCase()}: ✅ ${stats.passed} / ❌ ${stats.failed} / 📈 ${total} total`);
    });
    log('');
  }

  // Close logger
  closeLogger();

  if (failed > 0) {
    process.exit(1);
  }
}

// Run the test
runTest().catch(error => errorLog(error));