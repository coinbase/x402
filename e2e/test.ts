import { config } from 'dotenv';
import { spawn, execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { TestDiscovery } from './src/discovery';
import { ClientConfig, ScenarioResult, ServerConfig, TestScenario } from './src/types';
import { config as loggerConfig, log, verboseLog, errorLog, close as closeLogger, createComboLogger } from './src/logger';
import { handleDiscoveryValidation, shouldRunDiscoveryValidation } from './extensions/bazaar';
import { parseArgs, printHelp } from './src/cli/args';
import { runInteractiveMode } from './src/cli/interactive';
import { filterScenarios, TestFilters, shouldShowExtensionOutput } from './src/cli/filters';
import { minimizeScenarios } from './src/sampling';
import { getNetworkSet, NetworkMode, NetworkSet, getNetworkModeDescription } from './src/networks/networks';
import { GenericServerProxy } from './src/servers/generic-server';
import { Semaphore, FacilitatorLock } from './src/concurrency';
import { FacilitatorManager } from './src/facilitators/facilitator-manager';
import { waitForHealth } from './src/health';

/**
 * Run Permit2 setup script to ensure the client wallet has approved the Permit2 contract
 */
async function setupPermit2Approval(): Promise<boolean> {
  return new Promise((resolve) => {
    log('\n🔑 Setting up Permit2 approval for EVM client wallet...');

    const child = spawn('pnpm', ['permit2:approve'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: true,
    });

    let stderr = '';

    child.stdout?.on('data', (data) => {
      verboseLog(data.toString().trim());
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      verboseLog(data.toString().trim());
    });

    child.on('close', (code) => {
      if (code === 0) {
        log('  ✅ Permit2 approval setup complete');
        resolve(true);
      } else {
        errorLog(`  ❌ Permit2 setup failed (exit code ${code})`);
        if (stderr) {
          errorLog(`  Error: ${stderr}`);
        }
        resolve(false);
      }
    });

    child.on('error', (error) => {
      errorLog(`  ❌ Failed to run Permit2 setup: ${error.message}`);
      resolve(false);
    });
  });
}

/**
 * Revoke Permit2 approval so that EIP-2612 gas sponsoring extension is exercised.
 * Sets the Permit2 allowance to 0, forcing the client to use the EIP-2612 permit path.
 */
async function revokePermit2Approval(): Promise<boolean> {
  return new Promise((resolve) => {
    verboseLog('  🔓 Revoking Permit2 approval for EIP-2612 test...');

    const child = spawn('pnpm', ['permit2:revoke'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: true,
    });

    let stderr = '';

    child.stdout?.on('data', (data) => {
      verboseLog(data.toString().trim());
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      verboseLog(data.toString().trim());
    });

    child.on('close', (code) => {
      if (code === 0) {
        verboseLog('  ✅ Permit2 approval revoked (allowance set to 0)');
        resolve(true);
      } else {
        errorLog(`  ❌ Permit2 revoke failed (exit code ${code})`);
        if (stderr) {
          errorLog(`  Error: ${stderr}`);
        }
        resolve(false);
      }
    });

    child.on('error', (error) => {
      errorLog(`  ❌ Failed to run Permit2 revoke: ${error.message}`);
      resolve(false);
    });
  });
}

// Load environment variables
config();

// Parse command line arguments
const parsedArgs = parseArgs();

async function startServer(
  server: any,
  serverConfig: ServerConfig
): Promise<boolean> {
  verboseLog(`  🚀 Starting server on port ${serverConfig.port}...`);
  await server.start(serverConfig);

  return waitForHealth(
    () => server.health(),
    { initialDelayMs: 100, intervalMs: 500, maxAttempts: 20, label: 'Server' },
  );
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
    errorLog(' SERVER_EVM_ADDRESS, SERVER_SVM_ADDRESS, CLIENT_EVM_PRIVATE_KEY, CLIENT_SVM_PRIVATE_KEY, FACILITATOR_EVM_PRIVATE_KEY, and FACILITATOR_SVM_PRIVATE_KEY must be set');
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
  let networkMode: NetworkMode;

  // Interactive or programmatic mode
  if (parsedArgs.mode === 'interactive') {
    const selections = await runInteractiveMode(
      allClients,
      allServers,
      allFacilitators,
      allScenarios,
      parsedArgs.minimize,
      parsedArgs.networkMode // Pass preselected network mode (may be undefined)
    );

    if (!selections) {
      log('\n❌ Cancelled by user');
      return;
    }

    filters = selections;
    selectedExtensions = selections.extensions;
    networkMode = selections.networkMode;
  } else {
    log('\n🤖 Programmatic Mode');
    log('===================\n');

    filters = parsedArgs.filters;
    selectedExtensions = parsedArgs.filters.extensions;

    // In programmatic mode, network mode defaults to testnet if not specified
    networkMode = parsedArgs.networkMode || 'testnet';

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

  // Get network configuration based on selected mode
  const networks = getNetworkSet(networkMode);

  log(`\n🌐 Network Mode: ${networkMode.toUpperCase()}`);
  log(`   EVM: ${networks.evm.name} (${networks.evm.caip2})`);
  log(`   SVM: ${networks.svm.name} (${networks.svm.caip2})`);

  if (networkMode === 'mainnet') {
    log('\n⚠️  WARNING: Running on MAINNET - real funds will be used!');
  }
  log('');

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

  // Auto-detect Permit2 scenarios
  const hasPermit2Scenarios = filteredScenarios.some(
    (s) => s.endpoint.transferMethod === 'permit2'
  );

  // Check if eip2612GasSponsoring extension should be tested
  const hasEip2612Extension = selectedExtensions?.includes('eip2612GasSponsoring') ?? false;

  if (hasPermit2Scenarios) {
    if (hasEip2612Extension) {
      log('🔐 Permit2 scenarios detected with eip2612GasSponsoring extension');
    } else {
      // Standard permit2 flow: ensure approval exists
      log('🔐 Permit2 scenarios detected - checking approval...');
      const setupSuccess = await setupPermit2Approval();
      if (!setupSuccess) {
        errorLog(
          '\n❌ Failed to setup Permit2 approval. Cannot continue with Permit2 tests.'
        );
        errorLog(
          '💡 Make sure CLIENT_EVM_PRIVATE_KEY is set and the wallet has USDC.'
        );
        process.exit(1);
      }
    }
  }

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
  const systemManagedVars = new Set(['PORT', 'EVM_PRIVATE_KEY', 'SVM_PRIVATE_KEY', 'EVM_NETWORK', 'SVM_NETWORK', 'EVM_RPC_URL', 'SVM_RPC_URL']);

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
      missingVars.forEach(varName => errorLog(` - ${varName}`));
    }
    errorLog('\n💡 Please set the required environment variables and try again.\n');
    process.exit(1);
  }

  log('  ✅ All required environment variables are present\n');

  // Clean up any processes on test ports from previous runs
  try {
    execSync('pnpm clean:ports', { cwd: process.cwd(), stdio: 'pipe' });
    verboseLog('  🧹 Cleared test ports from previous runs');
    await new Promise(resolve => setTimeout(resolve, 500)); // Allow OS to release ports
  } catch {
    // clean:ports may exit non-zero if no processes were found; that's fine
  }

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
  let currentPort = 4022;

  // Ports blocked by Node's fetch (undici) / Chromium — requests to these
  // ports fail with "bad port" regardless of what is listening.
  const UNSAFE_PORTS = new Set([4045]);
  const nextPort = () => {
    while (UNSAFE_PORTS.has(currentPort)) currentPort++;
    return currentPort++;
  };

  // Assign ports and start all facilitators
  const facilitatorManagers = new Map<string, FacilitatorManager>();

  // Group scenarios by server + facilitator combination
  // This ensures we restart servers when switching facilitators
  interface ServerFacilitatorCombo {
    serverName: string;
    facilitatorName: string | undefined;
    scenarios: typeof filteredScenarios;
    comboIndex: number;
    port: number;
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

  // Convert map to array of combos, assigning a unique port to each
  let comboIndex = 0;
  for (const [, scenarios] of comboMap) {
    const firstScenario = scenarios[0];
    serverFacilitatorCombos.push({
      serverName: firstScenario.server.name,
      facilitatorName: firstScenario.facilitator?.name,
      scenarios,
      comboIndex,
      port: nextPort(),
    });
    comboIndex++;
  }

  // Start all facilitators with unique ports
  for (const [facilitatorName, facilitator] of uniqueFacilitators) {
    const port = nextPort();
    log(`\n🏛️ Starting facilitator: ${facilitatorName} on port ${port}`);

    const manager = new FacilitatorManager(
      facilitator.proxy,
      port,
      networks,
      facilitatorName
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

  log(`🔧 Server/Facilitator combinations: ${serverFacilitatorCombos.length}`);
  serverFacilitatorCombos.forEach(combo => {
    log(`   • ${combo.serverName} + ${combo.facilitatorName || 'none'}: ${combo.scenarios.length} test(s) (port ${combo.port})`);
  });
  if (parsedArgs.parallel) {
    log(`\n⚡ Parallel mode enabled (concurrency: ${parsedArgs.concurrency})`);
  }
  log('');

  // Track which facilitators processed which servers (for discovery validation)
  const facilitatorServerMap = new Map<string, Set<string>>(); // facilitatorName -> Set<serverName>

  // ── Helper: run a single test scenario ────────────────────────────────
  async function runSingleTest(
    scenario: TestScenario,
    port: number,
    localTestNumber: number,
    cLog: { log: typeof log; verboseLog: typeof verboseLog; errorLog: typeof errorLog },
  ): Promise<DetailedTestResult> {
    const facilitatorLabel = scenario.facilitator ? ` via ${scenario.facilitator.name}` : '';
    const testName = `${scenario.client.name} → ${scenario.server.name} → ${scenario.endpoint.path}${facilitatorLabel}`;

    const clientConfig: ClientConfig = {
      evmPrivateKey: clientEvmPrivateKey!,
      svmPrivateKey: clientSvmPrivateKey!,
      serverUrl: `http://localhost:${port}`,
      endpointPath: scenario.endpoint.path,
    };

    try {
      cLog.log(`🧪 Test #${localTestNumber}: ${testName}`);
      const result = await runClientTest(scenario.client.proxy, clientConfig);

      const detailedResult: DetailedTestResult = {
        testNumber: localTestNumber,
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
        cLog.log(`  ✅ Test passed`);
      } else {
        cLog.log(`  ❌ Test failed: ${result.error}`);
        if (result.verboseLogs && result.verboseLogs.length > 0) {
          cLog.log(`  🔍 Verbose logs:`);
          result.verboseLogs.forEach(logLine => cLog.log(logLine));
        }
        cLog.verboseLog(`  🔍 Error details: ${JSON.stringify(result, null, 2)}`);
      }

      return detailedResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      cLog.log(`  ❌ Test failed with exception: ${errorMsg}`);
      cLog.verboseLog(`  🔍 Exception details: ${error}`);
      return {
        testNumber: localTestNumber,
        client: scenario.client.name,
        server: scenario.server.name,
        endpoint: scenario.endpoint.path,
        facilitator: scenario.facilitator?.name || 'none',
        protocolFamily: scenario.protocolFamily,
        passed: false,
        error: errorMsg,
      };
    }
  }

  // ── Execute a single server+facilitator combo ─────────────────────────
  async function executeCombo(
    combo: ServerFacilitatorCombo,
    evmLock: FacilitatorLock | null,
    nextTestNumber: () => number,
    evmSettleMs: number,
  ): Promise<DetailedTestResult[]> {
    const { serverName, facilitatorName, scenarios, port } = combo;
    const server = uniqueServers.get(serverName)!;
    const cLog = createComboLogger(combo.comboIndex, serverName, facilitatorName);

    // Track facilitator→server mapping
    if (facilitatorName) {
      if (!facilitatorServerMap.has(facilitatorName)) {
        facilitatorServerMap.set(facilitatorName, new Set());
      }
      facilitatorServerMap.get(facilitatorName)!.add(serverName);
    }

    // Create a fresh server instance for this combo (own port, own process)
    const serverProxy = new GenericServerProxy(server.directory);

    const facilitatorUrl = facilitatorName
      ? facilitatorUrls.get(facilitatorName)
      : undefined;

    cLog.log(`🚀 Starting server: ${serverName} (port ${port}) with facilitator: ${facilitatorName || 'none'}`);

    const serverConfig: ServerConfig = {
      port,
      evmPayTo: serverEvmAddress!,
      svmPayTo: serverSvmAddress!,
      networks,
      facilitatorUrl,
    };

    const started = await startServer(serverProxy, serverConfig);
    if (!started) {
      cLog.log(`❌ Failed to start server ${serverName}`);
      return scenarios.map(scenario => ({
        testNumber: nextTestNumber(),
        client: scenario.client.name,
        server: scenario.server.name,
        endpoint: scenario.endpoint.path,
        facilitator: scenario.facilitator?.name || 'none',
        protocolFamily: scenario.protocolFamily,
        passed: false,
        error: 'Server failed to start',
      }));
    }
    cLog.log(`  ✅ Server ${serverName} ready`);

    const results: DetailedTestResult[] = [];
    try {
      for (const scenario of scenarios) {
        const tn = nextTestNumber();
        const isEvm = scenario.protocolFamily === 'evm';

        if (hasEip2612Extension && scenario.endpoint.transferMethod === 'permit2') {
          await revokePermit2Approval();
        }

        if (isEvm && facilitatorName && evmLock) {
          // Acquire EVM lock for this facilitator to prevent nonce collisions
          const releaseLock = await evmLock.acquire(facilitatorName);
          try {
            results.push(await runSingleTest(scenario, port, tn, cLog));
            // Delay inside the lock so the nonce settles before releasing
            await new Promise(resolve => setTimeout(resolve, evmSettleMs));
          } finally {
            releaseLock();
          }
        } else {
          results.push(await runSingleTest(scenario, port, tn, cLog));
        }
      }
    } finally {
      cLog.verboseLog(`  🛑 Stopping ${serverName} (finished combo)`);
      await serverProxy.stop();
    }

    return results;
  }

  // ── Unified execution: concurrency=1 for sequential, N for parallel ──
  const effectiveConcurrency = parsedArgs.parallel ? parsedArgs.concurrency : 1;
  const evmLock = parsedArgs.parallel ? new FacilitatorLock() : null;
  const semaphore = new Semaphore(effectiveConcurrency);

  let globalTestNumber = 0;
  const nextTestNumber = () => ++globalTestNumber;

  const comboPromises = serverFacilitatorCombos.map(async (combo) => {
    const release = await semaphore.acquire();
    try {
      return await executeCombo(combo, evmLock, nextTestNumber, parsedArgs.evmSettleMs);
    } finally {
      release();
    }
  });

  testResults = (await Promise.all(comboPromises)).flat();

  // Run discovery validation before cleanup (while facilitators are still running)
  const facilitatorsWithConfig = Array.from(uniqueFacilitators.values()).map((f: any) => ({
    proxy: facilitatorManagers.get(f.name)!.getProxy(),
    config: f.config,
  }));

  const serversArray = Array.from(uniqueServers.values());

  // Build a serverName→port map for discovery validation (first combo per server).
  const discoveryServerPorts = new Map<string, number>();
  for (const combo of serverFacilitatorCombos) {
    if (!discoveryServerPorts.has(combo.serverName)) {
      discoveryServerPorts.set(combo.serverName, combo.port);
    }
  }

  // Run discovery validation if bazaar extension is enabled
  const showBazaarOutput = shouldShowExtensionOutput('bazaar', selectedExtensions);
  if (showBazaarOutput && shouldRunDiscoveryValidation(facilitatorsWithConfig, serversArray)) {
    log('\n🔍 Running Bazaar Discovery Validation...\n');
    await handleDiscoveryValidation(
      facilitatorsWithConfig,
      serversArray,
      discoveryServerPorts,
      facilitatorServerMap
    );
  }

  // Clean up facilitators (servers already stopped in test loop for both modes)
  log('\n🧹 Cleaning up...');

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
  log(`🌐 Network: ${networkMode} (${getNetworkModeDescription(networkMode)})`);
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
      log(`  #${test.testNumber.toString().padStart(2, ' ')}: ${test.client} → ${test.server} → ${test.endpoint}`);
      log(`      Facilitator: ${test.facilitator}`);
      if (test.network) {
        log(`      Network: ${test.network}`);
      }
      if (test.transaction) {
        log(`      Tx: ${test.transaction}`);
      }
    });
    log('');
  }

if (failedTests.length > 0) {
  log('❌ FAILED TESTS:');
  log('');
  failedTests.forEach(test => {
    log(`  #${test.testNumber.toString().padStart(2, ' ')}: ${test.client} → ${test.server} → ${test.endpoint}`);
    log(`      Facilitator: ${test.facilitator}`);
    if (test.network) {
      log(`      Network: ${test.network}`);
    }
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
  log(` ${facilitator.padEnd(15)} ✅ ${stats.passed} / ❌ ${stats.failed} (${passRate}%)`);
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
  log(` ${server.padEnd(20)} ✅ ${stats.passed} / ❌ ${stats.failed} (${passRate}%)`);
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
    log(` ${protocol.toUpperCase()}: ✅ ${stats.passed} / ❌ ${stats.failed} / 📈 ${total} total`);
  });
  log('');
}

// Write structured JSON output if requested
if (parsedArgs.outputJson) {
  const breakdown = (results: DetailedTestResult[], key: keyof DetailedTestResult) =>
    results.reduce((acc, test) => {
      const k = String(test[key]);
      if (!acc[k]) acc[k] = { passed: 0, failed: 0 };
      if (test.passed) acc[k].passed++;
      else acc[k].failed++;
      return acc;
    }, {} as Record<string, { passed: number; failed: number }>);

  const jsonOutput = {
    summary: {
      total: passed + failed,
      passed,
      failed,
      networkMode,
    },
    results: testResults,
    breakdowns: {
      byFacilitator: breakdown(testResults, 'facilitator'),
      byServer: breakdown(testResults, 'server'),
      byClient: breakdown(testResults, 'client'),
      byProtocolFamily: breakdown(testResults, 'protocolFamily'),
    },
  };

  writeFileSync(parsedArgs.outputJson, JSON.stringify(jsonOutput, null, 2));
  log(`📄 JSON results written to ${parsedArgs.outputJson}`);
}

// Close logger
closeLogger();

if (failed > 0) {
  process.exit(1);
}
}

// Run the test
runTest().catch(error => errorLog(error));
