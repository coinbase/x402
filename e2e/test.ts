import { ExpressServerProxy } from './src/servers/express';
import { AxiosClientProxy } from './src/clients/axios';

async function runTest() {
  console.log('🚀 Starting X402 E2E Test');
  console.log('========================');

  // Create proxies
  const server = new ExpressServerProxy();
  // const client = new AxiosClientProxy();

  try {
    // Start server
    console.log('📡 Starting Express server...');
    await server.start({
      port: 4021,
      facilitator: {
        url: 'http://localhost:3000',
        port: 3000
      },
      address: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C'
    });
    console.log('✅ Server started');

    // // Test with client
    // console.log('\n🔗 Testing with Axios client...');
    // const result = await client.call({
    //   privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
    //   serverUrl: 'http://localhost:4021',
    //   endpointPath: '/protected'
    // });

    // if (result.success) {
    //   console.log('✅ Client test passed');
    //   console.log('Response:', result.data);
    //   if (result.payment_response) {
    //     console.log('Payment response:', result.payment_response);
    //   }
    // } else {
    //   console.log('❌ Client test failed:', result.error);
    // }

  } catch (error) {
    console.error('💥 Test failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await server.stop();
    console.log('✅ Test completed');
  }
}

// Run the test
runTest().catch(console.error); 