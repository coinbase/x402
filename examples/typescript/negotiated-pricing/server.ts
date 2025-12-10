import express from 'express';
import { negotiatedPayment, RangeBasedStrategy, VolumeBasedStrategy } from 'x402-express';

const app = express();
app.use(express.json());

// Example 1: Simple range-based pricing strategy
const rangeStrategy = new RangeBasedStrategy('0.10', '0.05', 3);

app.get(
  '/api/data/simple',
  negotiatedPayment({
    strategy: rangeStrategy,
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on base-sepolia
    network: 'base-sepolia',
    description: 'Simple environmental data'
  }),
  (req, res) => {
    res.json({
      message: 'Access granted to simple data',
      negotiatedPrice: res.locals.negotiation?.finalAmount,
      data: {
        timestamp: new Date().toISOString(),
        temperature: 72.5,
        humidity: 45
      }
    });
  }
);

// Example 2: Volume-based pricing strategy
const volumeStrategy = new VolumeBasedStrategy(
  '0.10', // base price
  '0.05', // minimum acceptable
  new Map([
    [10, 0.95],  // 5% off for 10+
    [50, 0.90],  // 10% off for 50+
    [100, 0.85]  // 15% off for 100+
  ])
);

app.get(
  '/api/data/bulk',
  negotiatedPayment({
    strategy: volumeStrategy,
    payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    network: 'base-sepolia',
    description: 'Bulk environmental data with volume discounts'
  }),
  (req, res) => {
    res.json({
      message: 'Access granted to bulk data',
      negotiatedPrice: res.locals.negotiation?.finalAmount,
      data: {
        records: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          temperature: 70 + Math.random() * 10,
          humidity: 40 + Math.random() * 20
        }))
      }
    });
  }
);

// Health check endpoint (no payment required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Negotiated pricing server running on port ${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log('  GET /api/data/simple - Range-based pricing (base: $0.10, min: $0.05)');
  console.log('  GET /api/data/bulk   - Volume-based pricing with bulk discounts');
  console.log('  GET /health          - Health check (no payment)\n');
  console.log('To test negotiation:');
  console.log('  1. Make initial request (will receive 402 with payment requirements)');
  console.log('  2. Submit proposal with X-PAYMENT header');
  console.log('  3. Server will accept, counter, or reject based on strategy\n');
});

