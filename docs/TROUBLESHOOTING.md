# x402 Integration Troubleshooting Guide

This guide addresses common issues developers encounter when integrating x402 into their applications.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Common Configuration Issues](#common-configuration-issues)
- [Network-Specific Problems](#network-specific-problems)
- [Facilitator Compatibility](#facilitator-compatibility)
- [SDK-Specific Issues](#sdk-specific-issues)
- [Discovery and Resource Configuration](#discovery-and-resource-configuration)
- [Performance and Timeout Issues](#performance-and-timeout-issues)

## Quick Diagnostics

### Test Your Setup
```bash
# Test facilitator connectivity
curl -X POST "https://facilitator.x402.org/verify" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Test discovery endpoint
curl "https://your-api.com/.well-known/x402"
```

### Common Error Patterns
- `402 Payment Required` → Expected, payment flow working
- `500 Internal Server Error` → Configuration or facilitator issue
- `404 Not Found` → Discovery endpoint missing or misconfigured
- `CORS errors` → Missing CORS headers for browser clients
- `Timeout errors` → Network connectivity or facilitator overload

## Common Configuration Issues

### Missing Environment Variables

**Problem**: SDK initialization fails with missing configuration.

```bash
# Required environment variables
export X402_FACILITATOR_URL="https://facilitator.x402.org"
export PRIVATE_KEY="0x..."  # Your wallet private key
export RPC_URL="https://mainnet.base.org"  # Network RPC endpoint
```

**TypeScript Example**:
```typescript
import { createX402Client } from '@x402/core';

const client = createX402Client({
  facilitatorUrl: process.env.X402_FACILITATOR_URL!,
  privateKey: process.env.PRIVATE_KEY!,
  networkConfig: {
    rpcUrl: process.env.RPC_URL!,
    chainId: 8453 // Base mainnet
  }
});
```

### Discovery Endpoint Configuration

**Problem**: `/.well-known/x402` returns 404 or invalid JSON.

**Solution**: Ensure your discovery endpoint is properly configured:

```json
{
  "x402Version": "2",
  "discoveryDocument": {
    "resources": {
      "/weather": {
        "accepts": [
          {
            "scheme": "exact",
            "network": "eip155:8453",
            "amount": "1000000",
            "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            "payTo": "0xYourWalletAddress"
          }
        ],
        "description": "Weather data API"
      }
    }
  }
}
```

**Common mistakes**:
- Missing `Content-Type: application/json` header
- Incorrect JSON formatting
- Missing required fields (`x402Version`, `discoveryDocument`)
- Wrong asset addresses or network IDs

## Network-Specific Problems

### Base (EIP155:8453) Issues

**Asset Address Validation**:
```typescript
// Correct USDC address on Base
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Common mistake: Using mainnet USDC address
const USDC_MAINNET = "0xA0b86a33E6eBA3E1B0B4DcF4f"; // Wrong for Base
```

**RPC Endpoint Issues**:
```typescript
// Recommended Base RPC endpoints
const baseRpcs = [
  "https://mainnet.base.org",
  "https://base-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "https://base.blockpi.network/v1/rpc/public"
];
```

### Solana Configuration

**Common Program IDs**:
```typescript
// Correct Solana program addresses
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const USDC_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
```

**Devnet vs Mainnet**:
```python
# Python SDK - ensure correct network
from x402.mechanisms.svm import SVMClient

# Mainnet
client = SVMClient(
    rpc_url="https://api.mainnet-beta.solana.com",
    network="solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
)

# Devnet  
client = SVMClient(
    rpc_url="https://api.devnet.solana.com", 
    network="solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
)
```

## Facilitator Compatibility

### CDP Facilitator Limitations

**Problem**: CDP facilitator rejects transactions with extra instructions.

**Affected**: Solana transactions with Memo instructions, Lighthouse instructions, or custom programs.

**Solution**: Use alternative facilitators for Solana or disable extra instructions:

```python
# Python SDK - disable memo instruction for CDP compatibility
from x402.mechanisms.svm.exact.v1.client import SVMClient

client = SVMClient(
    add_memo=False,  # Disable memo for CDP facilitator
    rpc_url="https://api.mainnet-beta.solana.com"
)
```

**Alternative facilitators**:
- `https://facilitator.x402.org` (supports all instruction types)
- `https://api.payai.live/x402` (Phantom Lighthouse compatible)

### Rate Limiting

**Problem**: Facilitator returns 429 (Too Many Requests).

**Solution**: Implement exponential backoff:

```typescript
async function payWithRetry(paymentData: any, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.pay(paymentData);
    } catch (error) {
      if (error.status === 429 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

## SDK-Specific Issues

### TypeScript/Node.js

**ESM vs CommonJS Issues**:
```json
// package.json
{
  "type": "module",  // Required for ESM imports
  "dependencies": {
    "@x402/core": "latest"
  }
}
```

**Polyfill Requirements**:
```javascript
// For browser environments
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
```

### Python

**Virtual Environment Setup**:
```bash
# Recommended Python setup
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install x402[all]  # Install with all optional dependencies
```

**Common Import Issues**:
```python
# Correct imports
from x402 import Client
from x402.mechanisms.evm import EVMClient
from x402.mechanisms.svm import SVMClient

# Common mistake - wrong import paths
from x402.client import Client  # Wrong
```

### Go

**Module Path Issues**:
```go
// go.mod
module your-project

require github.com/coinbase/x402/go v0.x.x

// main.go
import (
    "github.com/coinbase/x402/go/mechanisms/evm"
    "github.com/coinbase/x402/go/core"
)
```

## Discovery and Resource Configuration

### CORS Configuration

**Problem**: Browser requests fail with CORS errors.

**Solution**: Configure CORS headers properly:

```javascript
// Express.js example
app.use('/.well-known/x402', cors({
  origin: ['https://your-frontend.com'],
  methods: ['GET'],
  headers: ['Content-Type']
}));
```

### Metadata Validation

**Problem**: Discovery document validation fails.

**Tool**: Use the x402 validator:
```bash
npx @x402/core validate https://your-api.com/.well-known/x402
```

**Common validation errors**:
- Invalid network format (use `eip155:8453`, not `8453`)
- Missing required fields in accepts array
- Invalid asset addresses
- Malformed JSON structure

## Performance and Timeout Issues

### Transaction Timeouts

**Problem**: Payments fail with timeout errors.

**Solution**: Adjust timeout settings:

```typescript
const client = createX402Client({
  facilitatorUrl: "https://facilitator.x402.org",
  timeoutMs: 30000,  // 30 seconds (default: 10s)
  retryAttempts: 3
});
```

### RPC Performance

**Problem**: Slow or unreliable RPC responses.

**Solution**: Use multiple RPC endpoints with fallback:

```typescript
const rpcEndpoints = [
  "https://mainnet.base.org",
  "https://base-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "https://base.blockpi.network/v1/rpc/public"
];

// Implement RPC failover logic
async function callWithFallback(method: string, params: any[]) {
  for (const endpoint of rpcEndpoints) {
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params, id: 1 })
      });
    } catch (error) {
      console.warn(`RPC endpoint ${endpoint} failed, trying next...`);
      continue;
    }
  }
  throw new Error('All RPC endpoints failed');
}
```

## Getting Help

### Debug Information to Include

When seeking help, provide:

1. **Environment details**:
   - SDK version (`npm list @x402/core` or `pip show x402`)
   - Network (Base, Solana, etc.)
   - Facilitator being used

2. **Error details**:
   - Full error message
   - Stack trace
   - Network requests (sanitized)

3. **Configuration**:
   - Discovery document (sanitized)
   - Asset addresses
   - Network configuration

### Community Resources

- **GitHub Issues**: [github.com/coinbase/x402/issues](https://github.com/coinbase/x402/issues)
- **Documentation**: [Official x402 docs](https://x402.org/docs)
- **Examples**: [github.com/coinbase/x402/examples](https://github.com/coinbase/x402/tree/main/examples)

---

**Last updated**: February 17, 2026  
**Version**: x402 v2.1+