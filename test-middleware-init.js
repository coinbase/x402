// Test middleware initialization to reproduce the issue

const { HTTPFacilitatorClient, x402ResourceServer, x402HTTPResourceServer } = require('./typescript/packages/core/dist/cjs/server/index.js');

async function testMiddlewareInit() {
  console.log('Testing middleware initialization...');
  
  try {
    // Create facilitator client exactly like in the quickstart
    const facilitatorClient = new HTTPFacilitatorClient({ 
      url: 'https://x402.org/facilitator' 
    });
    
    console.log('Created facilitator client with URL:', facilitatorClient.url);
    
    // Test getSupported directly
    console.log('Calling getSupported()...');
    const supported = await facilitatorClient.getSupported();
    console.log('getSupported() success! Got', supported.kinds.length, 'kinds');
    
    // Test creating the resource server like in the quickstart
    const resourceServer = new x402ResourceServer(facilitatorClient);
    console.log('Created resource server');
    
    // Test creating the HTTP server like in the middleware
    const routes = {
      "GET /weather": {
        accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: "0x1234567890123456789012345678901234567890" }],
        description: "Weather data",
        mimeType: "application/json",
      }
    };
    
    const httpServer = new x402HTTPResourceServer(resourceServer, routes);
    console.log('Created HTTP server');
    
    // Test initialization like the middleware does
    console.log('Calling httpServer.initialize()...');
    await httpServer.initialize();
    console.log('httpServer.initialize() completed successfully!');
    
  } catch (error) {
    console.error('Error during initialization:', error.message);
    console.error('Full error:', error);
  }
}

testMiddlewareInit();