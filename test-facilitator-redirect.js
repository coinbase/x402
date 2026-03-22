const { HTTPFacilitatorClient } = require('./typescript/packages/core/dist/cjs/index.js');

// Test script to reproduce the redirect issue with x402.org facilitator

async function testFacilitator() {
  console.log('Testing HTTPFacilitatorClient with x402.org facilitator...');
  
  const client = new HTTPFacilitatorClient({ 
    url: 'https://x402.org/facilitator' 
  });
  
  try {
    console.log('Calling getSupported()...');
    const supported = await client.getSupported();
    console.log('Success! Received supported response:', JSON.stringify(supported, null, 2));
  } catch (error) {
    console.error('Error calling getSupported():', error.message);
    console.error('Full error:', error);
  }
}

testFacilitator().catch(console.error);