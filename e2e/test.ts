import { config } from 'dotenv';
import { TestDiscovery } from './src/discovery';
import { ServerConfig, ClientConfig, ScenarioResult } from './src/types';

// Load environment variables
config();

async function runCallProtectedScenario(
  server: any,
  client: any,
  serverConfig: ServerConfig,
  callConfig: ClientConfig
): Promise<ScenarioResult> {
  try {
    await server.start(serverConfig);

    // Wait for server to be healthy before proceeding
    let healthCheckAttempts = 0;
    const maxHealthCheckAttempts = 10;

    while (healthCheckAttempts < maxHealthCheckAttempts) {
      const healthResult = await server.health();
      if (healthResult.success) {
        break;
      }

      healthCheckAttempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (healthCheckAttempts >= maxHealthCheckAttempts) {
      return {
        success: false,
        error: 'Server failed to become healthy after maximum attempts'
      };
    }

    const result = await client.call(callConfig);

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
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // Cleanup
    await server.stop();
    await client.forceStop();
  }
}

async function runTest() {
  console.log('🚀 Starting X402 E2E Test Suite');
  console.log('===============================');

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
  discovery.printDiscoverySummary();

  const scenarios = discovery.generateTestScenarios();

  if (scenarios.length === 0) {
    console.log('❌ No test scenarios found');
    return;
  }

  // Run all scenarios
  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    const combo = scenario.facilitatorNetworkCombo;
    const comboLabel = `useCdpFacilitator=${combo.useCdpFacilitator}, network=${combo.network}`;
    const testName = `${scenario.client.name} → ${scenario.server.name} → ${scenario.endpoint.path} [${comboLabel}]`;

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
      console.log(`🧪 Testing: ${testName}`);
      const result = await runCallProtectedScenario(
        scenario.server.proxy,
        scenario.client.proxy,
        serverConfig,
        callConfig
      );

      if (result.success) {
        passed++;
      } else {
        console.log(`❌ ${testName}: ${result.error}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${testName}: ${error}`);
      failed++;
    }
  }

  // Summary
  console.log('');
  console.log('📊 Test Summary');
  console.log('==============');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Run the test
runTest().catch(console.error);