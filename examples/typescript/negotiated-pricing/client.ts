import { negotiated } from 'x402/schemes';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function demonstrateNegotiation() {
  console.log('=== Negotiated Pricing Client Demo ===\n');

  // Example 1: Successful negotiation with acceptable offer
  await testEndpoint('/api/data/simple', '0.07', 'Simple Data - Acceptable Offer');

  console.log('\n---\n');

  // Example 2: Low offer that gets counter-offered
  await testEndpoint('/api/data/simple', '0.03', 'Simple Data - Low Offer (expect counter)');

  console.log('\n---\n');

  // Example 3: Volume-based pricing
  await testEndpoint('/api/data/bulk', '0.09', 'Bulk Data - Volume Discount', 50);
}

async function testEndpoint(
  path: string,
  proposedAmount: string,
  testName: string,
  volume?: number
) {
  console.log(`Test: ${testName}`);
  console.log(`Endpoint: ${path}`);
  console.log(`Proposed amount: $${proposedAmount}`);
  if (volume) console.log(`Volume: ${volume}`);

  try {
    // Step 1: Initial request without payment
    console.log('\n1. Making initial request...');
    let response = await fetch(`${SERVER_URL}${path}`);

    if (response.status === 402) {
      const requirements = await response.json();
      console.log('   Received payment requirements:');
      console.log(`   - Base amount: $${requirements.accepts[0].baseAmount}`);
      console.log(`   - Min acceptable: $${requirements.accepts[0].minAcceptable}`);
      console.log(`   - Max iterations: ${requirements.accepts[0].maxIterations}`);

      // Step 2: Create and send proposal
      console.log('\n2. Submitting proposal...');
      const proposal = negotiated.evm.createNegotiationProposal({
        negotiationId: `neg_${Date.now()}_${Math.random()}`,
        proposedAmount,
        proposer: '0x' + '1'.repeat(40), // Mock address for demo
        nonce: Date.now().toString(),
        deadline: Math.floor(Date.now() / 1000) + 30,
        volume,
        signature: '0x' + '0'.repeat(130) // Mock signature for demo
      });

      const paymentHeader = negotiated.evm.encodeNegotiationPayment(
        proposal,
        'base-sepolia'
      );

      response = await fetch(`${SERVER_URL}${path}`, {
        headers: { 'X-PAYMENT': paymentHeader }
      });

      // Step 3: Handle response
      if (response.status === 200) {
        const data = await response.json();
        console.log('   ✓ Proposal ACCEPTED');
        console.log(`   Final price: $${data.negotiatedPrice}`);
        console.log('   Access granted to protected resource');
      } else if (response.status === 402) {
        const negotiationResponse = await response.json();
        if (negotiationResponse.negotiation) {
          const neg = negotiationResponse.negotiation;
          if (neg.status === 'counter') {
            console.log('   ↔ Server COUNTER-OFFERED');
            console.log(`   Counter amount: $${neg.counterAmount}`);
            console.log(`   Reason: ${neg.reason}`);
            console.log(`   Remaining iterations: ${neg.remainingIterations}`);
          } else if (neg.status === 'rejected') {
            console.log('   ✗ Proposal REJECTED');
            console.log(`   Reason: ${neg.reason}`);
          }
        }
      } else {
        console.log(`   Unexpected response: ${response.status}`);
      }
    } else {
      console.log(`   Unexpected initial response: ${response.status}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  console.log('Starting negotiated pricing demonstration...\n');
  console.log('Make sure the server is running with: npm run server\n');

  // Quick health check
  try {
    const health = await fetch(`${SERVER_URL}/health`);
    if (health.ok) {
      console.log('✓ Server is running\n');
      await demonstrateNegotiation();
    } else {
      console.error('Server health check failed');
    }
  } catch (error) {
    console.error('Could not connect to server. Is it running?');
    console.error('Start the server with: npm run server');
  }
}

main().catch(console.error);

