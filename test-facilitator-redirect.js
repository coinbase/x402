/**
 * Test script to reproduce issue #1692 - HTTP 308 redirect handling
 * This script tests the HTTPFacilitatorClient against x402.org/facilitator
 * to verify redirect handling works correctly.
 */

import { HTTPFacilitatorClient } from "./typescript/packages/core/dist/esm/http/index.mjs";

async function testFacilitatorRedirect() {
  console.log("Testing HTTPFacilitatorClient redirect handling...");
  
  const facilitatorClient = new HTTPFacilitatorClient({ 
    url: "https://x402.org/facilitator" 
  });
  
  try {
    console.log("Calling getSupported()...");
    const supported = await facilitatorClient.getSupported();
    console.log("✅ Success! Supported kinds:", supported.kinds.length);
    console.log("Extensions:", supported.extensions);
    return true;
  } catch (error) {
    console.error("❌ Error:", error.message);
    return false;
  }
}

async function testMiddlewareWithRedirect() {
  console.log("\nTesting Express middleware initialization...");
  
  // Import the actual Express middleware
  const { paymentMiddlewareFromConfig } = await import("./typescript/packages/http/express/dist/esm/index.mjs");
  const { ExactEvmScheme } = await import("./typescript/packages/mechanisms/evm-exact/dist/esm/server/index.mjs");
  
  const payTo = "0x523Eff3dB03938eaa31a5a6FBd41E3B9d23edde5";
  
  const routes = {
    "GET /test": {
      accepts: [{ 
        scheme: "exact", 
        price: "$0.001", 
        network: "eip155:84532", 
        payTo 
      }],
      description: "Test endpoint",
      mimeType: "application/json",
    },
  };
  
  try {
    // Create middleware with the problematic facilitator URL
    const facilitatorClient = new HTTPFacilitatorClient({ 
      url: "https://x402.org/facilitator" 
    });
    
    const middleware = paymentMiddlewareFromConfig(
      routes,
      facilitatorClient,
      [{ network: "eip155:84532", server: new ExactEvmScheme() }],
      undefined, // paywallConfig
      undefined, // paywall
      true  // syncFacilitatorOnStart
    );
    
    console.log("✅ Middleware created successfully");
    
    // Test with a mock request that triggers payment requirement
    const mockReq = {
      path: "/test",
      method: "GET",
      headers: {},
      get: (header) => mockReq.headers[header.toLowerCase()]
    };
    
    const mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: (key, value) => { mockRes.headers[key] = value; },
      status: (code) => { mockRes.statusCode = code; return mockRes; },
      json: (data) => { console.log("Response:", JSON.stringify(data, null, 2)); },
      send: (data) => { console.log("Response:", data); },
      writeHead: () => mockRes,
      write: () => true,
      end: () => mockRes,
      flushHeaders: () => {}
    };
    
    let nextCalled = false;
    const mockNext = (error) => {
      if (error) {
        console.error("❌ Middleware error:", error.message);
      } else {
        nextCalled = true;
      }
    };
    
    // This should trigger initialization and the 402 response
    await middleware(mockReq, mockRes, mockNext);
    
    if (mockRes.statusCode === 402) {
      console.log("✅ Middleware correctly returned 402 Payment Required");
      return true;
    } else if (nextCalled) {
      console.error("❌ Middleware incorrectly passed request through (should return 402)");
      return false;
    } else {
      console.error("❌ Unexpected middleware behavior");
      return false;
    }
    
  } catch (error) {
    console.error("❌ Middleware test failed:", error.message);
    return false;
  }
}

// Run tests
testFacilitatorRedirect()
  .then(success => {
    if (success) {
      return testMiddlewareWithRedirect();
    }
    return false;
  })
  .then(success => {
    if (success) {
      console.log("\n🎉 All tests passed!");
    } else {
      console.log("\n💥 Some tests failed");
      process.exit(1);
    }
  })
  .catch(error => {
    console.error("\n💥 Test runner error:", error);
    process.exit(1);
  });