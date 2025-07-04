import { config } from 'dotenv';
import { TestDiscovery } from './src/discovery';
import { ServerConfig, ClientConfig, ScenarioResult } from './src/types';
import { createWriteStream, WriteStream } from 'fs';

// Load environment variables
config();

// Helper function to write to both console and log file
function log(message: string, toFile: boolean = true) {
  console.log(message);
  if (logStream && toFile) {
    logStream.write(message + '\n');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

// Parse verbose test numbers (e.g., -v 54 55 56)
const verboseTestNumbers = new Set<number>();
const verboseIndex = args.findIndex(arg => arg === '-v' || arg === '--verbose');
if (verboseIndex !== -1) {
  // Check if there are numbers after -v
  let hasNumbers = false;
  for (let i = verboseIndex + 1; i < args.length; i++) {
    const num = parseInt(args[i]);
    if (!isNaN(num)) {
      verboseTestNumbers.add(num);
      hasNumbers = true;
    } else {
      // Stop at first non-number
      break;
    }
  }

  // If no numbers provided, make all tests verbose
  if (!hasNumbers) {
    verboseTestNumbers.add(-1); // Special marker for "all tests"
  }
}

// Parse filter arguments
const clientFilter = args.find(arg => arg.startsWith('--client='))?.split('=')[1];
const serverFilter = args.find(arg => arg.startsWith('--server='))?.split('=')[1];
const networkFilter = args.find(arg => arg.startsWith('--network='))?.split('=')[1];
const facilitatorFilter = args.find(arg => arg.startsWith('--facilitator='))?.split('=')[1];

// Parse log file argument
const logFile = args.find(arg => arg.startsWith('--log-file='))?.split('=')[1];
let logStream: WriteStream | null = null;

async function runCallProtectedScenario(
  server: any,
  client: any,
  serverConfig: ServerConfig,
  callConfig: ClientConfig,
  isVerbose: boolean = false
): Promise<ScenarioResult> {
  try {
    if (isVerbose) {
      log(`  🚀 Starting server with config: ${JSON.stringify(serverConfig, null, 2)}`);
    }
    await server.start(serverConfig, isVerbose);

    // Wait for server to be healthy before proceeding
    let healthCheckAttempts = 0;
    const maxHealthCheckAttempts = 10;

    while (healthCheckAttempts < maxHealthCheckAttempts) {
      const healthResult = await server.health();
      if (isVerbose) {
        log(`  🔍 Health check attempt ${healthCheckAttempts + 1}/${maxHealthCheckAttempts}: ${healthResult.success ? '✅' : '❌'}`);
      }
      if (healthResult.success) {
        if (isVerbose) {
          log(`  ✅ Server is healthy after ${healthCheckAttempts + 1} attempts`);
        }
        break;
      }

      healthCheckAttempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (healthCheckAttempts >= maxHealthCheckAttempts) {
      if (isVerbose) {
        log(`  ❌ Server failed to become healthy after ${maxHealthCheckAttempts} attempts`);
      }
      return {
        success: false,
        error: 'Server failed to become healthy after maximum attempts'
      };
    }

    if (isVerbose) {
      log(`  📞 Making client call with config: ${JSON.stringify(callConfig, null, 2)}`);
    }
    const result = await client.call(callConfig, isVerbose);

    if (isVerbose) {
      log(`  📊 Client call result: ${JSON.stringify(result, null, 2)}`);
    }

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
    if (isVerbose) {
      log(`  💥 Scenario failed with error: ${error}`);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // Cleanup
    if (isVerbose) {
      log(`  🧹 Cleaning up server and client processes`);
    }
    await server.stop();
    await client.forceStop();
  }
}

async function runTest() {
  // Show help if requested
  if (args.includes('-h') || args.includes('--help')) {
    console.log('🚀 X402 E2E Test Suite');
    console.log('======================');
    console.log('');
    console.log('Usage: npm test [options]');
    console.log('');
    console.log('Options:');
    console.log('  -v [test_numbers...]       Enable verbose logging for specific test numbers');
    console.log('  --log-file=<path>          Save verbose output to file');
    console.log('  --client=<name>            Filter by client name (e.g., httpx, axios)');
    console.log('  --server=<name>            Filter by server name (e.g., express, fastapi)');
    console.log('  --network=<name>           Filter by network (e.g., base, base-sepolia)');
    console.log('  --facilitator=<true|false> Filter by facilitator usage');
    console.log('  -h, --help                 Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  npm test -- -v              # Run all tests with verbose logging');
    console.log('  npm test -- -v 54           # Run all tests, verbose for test #54');
    console.log('  npm test -- -v 54 55 56     # Run all tests, verbose for tests #54, #55, #56');
    console.log('  npm test -- -v --log-file=test.log  # Save all verbose output to test.log');
    console.log('  npm test -- --client=httpx --server=express -v 1');
    console.log('');
    return;
  }

  // Initialize log file if specified
  if (logFile) {
    try {
      logStream = createWriteStream(logFile);
      log(`🚀 X402 E2E Test Suite - Log started at ${new Date().toISOString()}`);
      log(`📝 Logging verbose output to: ${logFile}`);
    } catch (error) {
      console.error(`Failed to create log file ${logFile}:`, error);
      process.exit(1);
    }
  }

  log('🚀 Starting X402 E2E Test Suite');
  if (verboseTestNumbers.size > 0) {
    if (verboseTestNumbers.has(-1)) {
      log('🔍 Verbose mode enabled for all tests');
    } else {
      log(`🔍 Verbose mode enabled for tests: ${Array.from(verboseTestNumbers).sort((a, b) => a - b).join(', ')}`);
    }
  }
  log('===============================');

  // Load configuration from environment
  const serverAddress = process.env.SERVER_ADDRESS;
  const clientPrivateKey = process.env.CLIENT_PRIVATE_KEY;
  const serverPort = parseInt(process.env.SERVER_PORT || '4021');

  if (!serverAddress || !clientPrivateKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   SERVER_ADDRESS and CLIENT_PRIVATE_KEY must be set');
    process.exit(1);
  }

  // Discover all servers and clients
  const discovery = new TestDiscovery();
  discovery.printDiscoverySummary(log);

  const scenarios = discovery.generateTestScenarios();

  if (scenarios.length === 0) {
    console.log('❌ No test scenarios found');
    return;
  }

  // Filter scenarios based on command line arguments
  const filteredScenarios = scenarios.filter(scenario => {
    if (clientFilter && scenario.client.name !== clientFilter) return false;
    if (serverFilter && scenario.server.name !== serverFilter) return false;
    if (networkFilter && scenario.facilitatorNetworkCombo.network !== networkFilter) return false;
    if (facilitatorFilter) {
      const useFacilitator = facilitatorFilter === 'true';
      if (scenario.facilitatorNetworkCombo.useCdpFacilitator !== useFacilitator) return false;
    }
    return true;
  });

  if (filteredScenarios.length === 0) {
    log('❌ No test scenarios match the specified filters');
    if (clientFilter) log(`   Client filter: ${clientFilter}`);
    if (serverFilter) log(`   Server filter: ${serverFilter}`);
    if (networkFilter) log(`   Network filter: ${networkFilter}`);
    if (facilitatorFilter) log(`   Facilitator filter: ${facilitatorFilter}`);
    return;
  }

  log(`🎯 Running ${filteredScenarios.length} filtered scenarios`);
  if (clientFilter) log(`   Client: ${clientFilter}`);
  if (serverFilter) log(`   Server: ${serverFilter}`);
  if (networkFilter) log(`   Network: ${networkFilter}`);
  if (facilitatorFilter) log(`   Facilitator: ${facilitatorFilter}`);
  log('');

  // Run filtered scenarios
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < filteredScenarios.length; i++) {
    const scenario = filteredScenarios[i];
    const testNumber = i + 1;
    const combo = scenario.facilitatorNetworkCombo;
    const comboLabel = `useCdpFacilitator=${combo.useCdpFacilitator}, network=${combo.network}`;
    const testName = `${scenario.client.name} → ${scenario.server.name} → ${scenario.endpoint.path} [${comboLabel}]`;

    // Check if this test should be verbose
    const isVerbose = verboseTestNumbers.has(-1) || verboseTestNumbers.has(testNumber);

    const serverConfig: ServerConfig = {
      port: serverPort,
      useCdpFacilitator: combo.useCdpFacilitator,
      payTo: serverAddress,
      network: combo.network
    };

    const callConfig: ClientConfig = {
      privateKey: clientPrivateKey,
      serverUrl: scenario.server.proxy.getUrl(),
      endpointPath: scenario.endpoint.path
    };

    try {
      log(`🧪 Testing #${testNumber}: ${testName}`);
      if (isVerbose) {
        log(`  📋 Scenario details:`);
        log(`    - Client: ${scenario.client.name} (${scenario.client.config.language})`);
        log(`    - Server: ${scenario.server.name} (${scenario.server.config.language})`);
        log(`    - Endpoint: ${scenario.endpoint.path}`);
        log(`    - Facilitator: ${combo.useCdpFacilitator ? 'CDP' : 'None'}`);
        log(`    - Network: ${combo.network}`);
        log('');
      }

      const result = await runCallProtectedScenario(
        scenario.server.proxy,
        scenario.client.proxy,
        serverConfig,
        callConfig,
        isVerbose
      );

      if (result.success) {
        if (isVerbose) {
          log(`  ✅ Test passed`);
        }
        passed++;
      } else {
        log(`❌ #${testNumber} ${testName}: ${result.error}`);
        if (isVerbose) {
          log(`  🔍 Error details: ${JSON.stringify(result, null, 2)}`);
        }
        failed++;
      }
    } catch (error) {
      log(`❌ #${testNumber} ${testName}: ${error}`);
      if (isVerbose) {
        log(`  🔍 Exception details: ${error}`);
      }
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

  // Close log file if it was opened
  if (logStream) {
    logStream.end();
    logStream = null;
  }

  if (failed > 0) {
    process.exit(1);
  }
}

// Run the test
runTest().catch(console.error);