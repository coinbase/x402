import { config } from 'dotenv';
import { TestDiscovery } from './src/discovery';
import { ClientConfig, ScenarioResult } from './src/types';
import { config as loggerConfig, log, verboseLog, errorLog, close as closeLogger } from './src/logger';
import { handleDiscoveryValidation, shouldRunDiscoveryValidation } from './extensions/bazaar';
import { parseArgs, printHelp } from './src/cli/args';
import { runInteractiveMode } from './src/cli/interactive';
import { filterScenarios, TestFilters, shouldShowExtensionOutput } from './src/cli/filters';
import { minimizeScenarios } from './src/sampling';

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
const parsedArgs = parseArgs();

interface Facilitator {
  start: (config: { port: number; evmPrivateKey: string; svmPrivateKey: string; evmNetwork: string; svmNetwork: string; }) => Promise<void>;
  health: () => Promise<{ success: boolean }>;
  getUrl: () => string;
  stop: () => Promise<void>;
}

// FacilitatorManager handles async facilitator lifecycle
class FacilitatorManager {
  private facilitator: any;
  private port: number;
  private readyPromise: Promise<string | null>;
  private url: string | null = null;

  constructor(facilitator: Facilitator, port: number, evmNetwork: string, svmNetwork: string) {
    this.facilitator = facilitator;
    this.port = port;

    // Start facilitator and health checks asynchronously
    this.readyPromise = this.startAndWaitForHealth(evmNetwork, svmNetwork);
  }

  private async startAndWaitForHealth(evmNetwork: string, svmNetwork: string): Promise<string | null> {
    verboseLog(`  🏛️ Starting facilitator on port ${this.port}...`);

    await this.facilitator.start({
      port: this.port,
      evmPrivateKey: process.env.FACILITATOR_EVM_PRIVATE_KEY,
      svmPrivateKey: process.env.FACILITATOR_SVM_PRIVATE_KEY,
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

  getProxy(): any {
    return this.facilitator;
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
    // Give server time to actually bind to port before first check
    if (attempts === 0) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }

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
  if (parsedArgs.showHelp) {
    printHelp();
    return;
  }

  // Initialize logger
  loggerConfig({ logFile: parsedArgs.logFile, verbose: parsedArgs.verbose });

  log('🚀 Starting X402 E2E Test Suite');
  log('===============================');

  // Load configuration from environment
  const serverEvmAddress = process.env.SERVER_EVM_ADDRESS;
  const serverSvmAddress = process.env.SERVER_SVM_ADDRESS;
  const clientEvmPrivateKey = process.env.CLIENT_EVM_PRIVATE_KEY;
  const clientSvmPrivateKey = process.env.CLIENT_SVM_PRIVATE_KEY;
  const facilitatorEvmPrivateKey = process.env.FACILITATOR_EVM_PRIVATE_KEY;
  const facilitatorSvmPrivateKey = process.env.FACILITATOR_SVM_PRIVATE_KEY;

  if (!serverEvmAddress || !serverSvmAddress || !clientEvmPrivateKey || !clientSvmPrivateKey || !facilitatorEvmPrivateKey || !facilitatorSvmPrivateKey) {
    errorLog('❌ Missing required environment variables:');
    errorLog('   SERVER_EVM_ADDRESS, SERVER_SVM_ADDRESS, CLIENT_EVM_PRIVATE_KEY, CLIENT_SVM_PRIVATE_KEY, FACILITATOR_EVM_PRIVATE_KEY, and FACILITATOR_SVM_PRIVATE_KEY must be set');
    process.exit(1);
  }

  // Discover all servers, clients, and facilitators (always include legacy)
  const discovery = new TestDiscovery('.', true); // Always discover legacy

  const allClients = discovery.discoverClients();
  const allServers = discovery.discoverServers();
  const allFacilitators = discovery.discoverFacilitators();

  discovery.printDiscoverySummary();

  // Generate all possible scenarios
  const allScenarios = discovery.generateTestScenarios();

  if (allScenarios.length === 0) {
    log('❌ No test scenarios found');
    return;
  }

  let filters: TestFilters;
  let selectedExtensions: string[] | undefined;

  // Interactive or programmatic mode
  if (parsedArgs.mode === 'interactive') {
    const selections = await runInteractiveMode(
      allClients,
      allServers,
      allFacilitators,
      allScenarios,
      parsedArgs.minimize
    );

    if (!selections) {
      log('\n❌ Cancelled by user');
      return;
    }

    filters = selections;
    selectedExtensions = selections.extensions;
  } else {
    log('\n🤖 Programmatic Mode');
    log('===================\n');

    filters = parsedArgs.filters;
    selectedExtensions = parsedArgs.filters.extensions;

    // Print active filters
    const filterEntries = Object.entries(filters).filter(([_, v]) => v && (Array.isArray(v) ? v.length > 0 : true));
    if (filterEntries.length > 0) {
      log('Active filters:');
      filterEntries.forEach(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          log(`  - ${key}: ${value.join(', ')}`);
        }
      });
      log('');
    }
  }

  // Apply filters to scenarios
  let filteredScenarios = filterScenarios(allScenarios, filters);

  if (filteredScenarios.length === 0) {
    log('❌ No scenarios match the selections');
    log('💡 Try selecting more options or run without filters\n');
    return;
  }

  // Apply coverage-based minimization if --min flag is set
  if (parsedArgs.minimize) {
    filteredScenarios = minimizeScenarios(filteredScenarios);

    if (filteredScenarios.length === 0) {
      log('❌ All scenarios are already covered');
      log('💡 This should not happen - coverage tracking may have an issue\n');
      return;
    }
  } else {
    log(`\n✅ ${filteredScenarios.length} scenarios selected`);
  }

  if (selectedExtensions && selectedExtensions.length > 0) {
    log(`🎁 Extensions enabled: ${selectedExtensions.join(', ')}`);
  }
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

  // Validate environment variables for all selected facilitators
  log('\n🔍 Validating facilitator environment variables...\n');
  const missingEnvVars: { facilitatorName: string; missingVars: string[] }[] = [];
  
  // Environment variables managed by the test framework (don't require user to set)
  const systemManagedVars = new Set(['PORT', 'EVM_PRIVATE_KEY', 'SVM_PRIVATE_KEY', 'EVM_NETWORK', 'SVM_NETWORK']);
  
  for (const [facilitatorName, facilitator] of uniqueFacilitators) {
    const requiredVars = facilitator.config.environment?.required || [];
    const missing: string[] = [];
    
    for (const envVar of requiredVars) {
      // Skip variables managed by the test framework
      if (systemManagedVars.has(envVar)) {
        continue;
      }
      
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }
    
    if (missing.length > 0) {
      missingEnvVars.push({ facilitatorName, missingVars: missing });
    }
  }
  
  if (missingEnvVars.length > 0) {
    errorLog('❌ Missing required environment variables for selected facilitators:\n');
    for (const { facilitatorName, missingVars } of missingEnvVars) {
      errorLog(`   ${facilitatorName}:`);
      missingVars.forEach(varName => errorLog(`      - ${varName}`));
    }
    errorLog('\n💡 Please set the required environment variables and try again.\n');
    process.exit(1);
  }
  
  log('  ✅ All required environment variables are present\n');

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

  // Assign ports and start all facilitators
  const facilitatorManagers = new Map<string, FacilitatorManager>();
  const serverPorts = new Map<string, number>(); // Track assigned ports for each server

  // Assign ports to servers (they'll reuse these ports across restarts)
  for (const [serverName] of uniqueServers) {
    const port = currentPort++;
    serverPorts.set(serverName, port);
  }

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

  log('\n✅ All facilitators are ready! Servers will be started/restarted as needed per test scenario.\n');

  // Group scenarios by server + facilitator combination
  // This ensures we restart servers when switching facilitators
  interface ServerFacilitatorCombo {
    serverName: string;
    facilitatorName: string | undefined;
    scenarios: typeof filteredScenarios;
  }

  const serverFacilitatorCombos: ServerFacilitatorCombo[] = [];
  const groupKey = (serverName: string, facilitatorName: string | undefined) =>
    `${serverName}::${facilitatorName || 'none'}`;

  const comboMap = new Map<string, typeof filteredScenarios>();

  for (const scenario of filteredScenarios) {
    const key = groupKey(scenario.server.name, scenario.facilitator?.name);
    if (!comboMap.has(key)) {
      comboMap.set(key, []);
    }
    comboMap.get(key)!.push(scenario);
  }

  // Convert map to array of combos
  for (const [key, scenarios] of comboMap) {
    const firstScenario = scenarios[0];
    serverFacilitatorCombos.push({
      serverName: firstScenario.server.name,
      facilitatorName: firstScenario.facilitator?.name,
      scenarios,
    });
  }

  log(`🔧 Server/Facilitator combinations: ${serverFacilitatorCombos.length}`);
  serverFacilitatorCombos.forEach(combo => {
    log(`   • ${combo.serverName} + ${combo.facilitatorName || 'none'}: ${combo.scenarios.length} test(s)`);
  });
  log('');

  // Track running servers to stop/restart them as needed
  const runningServers = new Map<string, any>(); // serverName -> server proxy

  // Track which facilitators processed which servers (for discovery validation)
  const facilitatorServerMap = new Map<string, Set<string>>(); // facilitatorName -> Set<serverName>

  // Run tests grouped by server+facilitator combination
  for (const combo of serverFacilitatorCombos) {
    const { serverName, facilitatorName, scenarios } = combo;
    const server = uniqueServers.get(serverName)!;
    const port = serverPorts.get(serverName)!;

    // Track that this facilitator is processing this server
    if (facilitatorName) {
      if (!facilitatorServerMap.has(facilitatorName)) {
        facilitatorServerMap.set(facilitatorName, new Set());
      }
      facilitatorServerMap.get(facilitatorName)!.add(serverName);
    }

    // Stop server if it's already running (from previous combo)
    if (runningServers.has(serverName)) {
      verboseLog(`  🔄 Restarting ${serverName} with new facilitator: ${facilitatorName || 'none'}`);
      await runningServers.get(serverName).stop();
      runningServers.delete(serverName);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for port to be released
    }

    // Start server with the appropriate facilitator
    const facilitatorUrl = facilitatorName ?
      facilitatorUrls.get(facilitatorName) : undefined;

    log(`\n🚀 Starting server: ${serverName} (port ${port}) with facilitator: ${facilitatorName || 'none'}`);

    const serverConfig: ServerConfig = {
      port,
      evmPayTo: serverEvmAddress,
      svmPayTo: serverSvmAddress,
      evmNetwork: 'eip155:84532',
      svmNetwork: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      facilitatorUrl,
    };

    const started = await startServer(server.proxy, serverConfig);
    if (!started) {
      log(`❌ Failed to start server ${serverName}`);
      process.exit(1);
    }
    log(`  ✅ Server ${serverName} ready\n`);
    runningServers.set(serverName, server.proxy);

    // Run all tests for this server+facilitator combination
    for (const scenario of scenarios) {
      testNumber++;
      const facilitatorLabel = scenario.facilitator ? ` via ${scenario.facilitator.name}` : '';
      const testName = `${scenario.client.name} → ${scenario.server.name} → ${scenario.endpoint.path}${facilitatorLabel}`;

      const clientConfig: ClientConfig = {
        evmPrivateKey: clientEvmPrivateKey,
        svmPrivateKey: clientSvmPrivateKey,
        serverUrl: `http://localhost:${port}`,
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

    // Stop server after running all tests for this combo
    verboseLog(`  🛑 Stopping ${serverName} (finished combo)`);
    await server.proxy.stop();
    runningServers.delete(serverName);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cleanup
  }

  // Run discovery validation before cleanup (while facilitators are still running)
  const facilitatorsWithConfig = Array.from(uniqueFacilitators.values()).map((f: any) => ({
    proxy: facilitatorManagers.get(f.name)!.getProxy(),
    config: f.config,
  }));

  const serversArray = Array.from(uniqueServers.values());

  // Run discovery validation if bazaar extension is enabled
  const showBazaarOutput = shouldShowExtensionOutput('bazaar', selectedExtensions);
  if (showBazaarOutput && shouldRunDiscoveryValidation(facilitatorsWithConfig, serversArray)) {
    log('\n🔍 Running Bazaar Discovery Validation...\n');
    await handleDiscoveryValidation(
      facilitatorsWithConfig,
      serversArray,
      serverPorts,
      facilitatorServerMap
    );
  }

  // Clean up facilitators (servers already stopped in test loop)
  log('\n🧹 Cleaning up...');

  // Stop any servers that might still be running
  for (const [serverName, serverProxy] of runningServers) {
    log(`  🛑 Stopping server: ${serverName}`);
    await serverProxy.stop();
  }

  // Stop all facilitators
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