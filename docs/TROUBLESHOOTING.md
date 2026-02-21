---
title: "Troubleshooting Guide"
description: "Common issues and solutions when integrating x402 payments"
---

# x402 Troubleshooting Guide

This guide covers common issues developers encounter when integrating x402 payments and their solutions.

## Table of Contents

- [Payment Verification Issues](#payment-verification-issues)
- [Network and Chain Configuration](#network-and-chain-configuration)
- [Facilitator Compatibility](#facilitator-compatibility)
- [SDK and Implementation Issues](#sdk-and-implementation-issues)
- [Discovery and Bazaar Setup](#discovery-and-bazaar-setup)
- [Performance and Optimization](#performance-and-optimization)
- [Debugging Tools](#debugging-tools)

## Payment Verification Issues

### Problem: "Invalid payment signature" or verification failures

**Symptoms:**
- 402 responses with "invalid signature" errors
- Payments that work in tests but fail in production
- Inconsistent signature validation

**Common Causes & Solutions:**

1. **Clock skew between client and server**
   ```typescript
   // Solution: Add buffer time for valid_after timestamps
   const validAfter = Math.floor(Date.now() / 1000) - 60; // 60 second buffer
   const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
   ```

2. **Incorrect network or chain ID**
   ```typescript
   // Verify network matches exactly
   // ❌ Wrong: Base Mainnet is 8453, not 84532
   network: "eip155:84532" // This is Base Sepolia
   
   // ✅ Correct: Base Mainnet
   network: "eip155:8453"
   ```

3. **Asset decimals mismatch**
   ```python
   # Make sure token decimals match your calculations
   # USDC = 6 decimals, WETH = 18 decimals
   asset_info = get_asset_info(network, token_address)
   amount_wei = int(Decimal(amount) * 10**asset_info['decimals'])
   ```

### Problem: "Insufficient funds" despite having balance

**Diagnosis Steps:**
1. Check token balances: `balanceOf(payer_address)`
2. Verify allowances: `allowance(payer, facilitator)` for EIP-3009 tokens
3. For Permit2: Check if token is approved to Permit2 contract
4. Confirm gas fees are available for transaction execution

**Solution:**
```javascript
// For EIP-3009 tokens, no allowance needed
// For Permit2 tokens, ensure approval first:
await tokenContract.approve(PERMIT2_ADDRESS, amount);
```

## Network and Chain Configuration

### Problem: "Unknown network" or "Network not supported"

**Solution:**
```typescript
// Use CAIP-2 format for networks
const SUPPORTED_NETWORKS = {
  'eip155:1': 'Ethereum Mainnet',
  'eip155:8453': 'Base Mainnet',
  'eip155:84532': 'Base Sepolia',
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'Solana Mainnet',
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': 'Solana Devnet'
};
```

### Problem: Chain ID mismatches in documentation examples

**Common Error:**
- Documentation showing `eip155:8453` labeled as "Base Sepolia" 
- Should be "Base Mainnet" (8453) vs "Base Sepolia" (84532)

**Verification:**
```bash
# Check current chain ID
curl https://mainnet.base.org -X POST -H "Content-Type: application/json" \
  --data '{"method":"eth_chainId","params":[],"id":1,"jsonrpc":"2.0"}'
# Returns: {"result":"0x2105"} = 8453 = Base Mainnet
```

## Facilitator Compatibility

### Problem: CDP Facilitator rejecting Solana transactions with Memo instructions

**Error:** `unknown fourth instruction: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`

**Background:**
- x402 Python SDK adds Memo instructions for transaction uniqueness
- CDP facilitator only accepts specific instruction patterns
- Open-source facilitators allow Memo instructions

**Workarounds:**
1. Use alternative facilitators (x402.org, PayAI) for Solana
2. Configure custom facilitator that whitelists Memo program
3. Remove Memo instructions (reduces uniqueness guarantees)

### Problem: Custom scheme extensions not working with facilitators

**Symptoms:**
- `extra` field missing from 402 responses
- Custom schemes not recognized

**Root Cause:**
- `buildPaymentRequirementsFromOptions()` may drop `extra` field
- See [Issue #1198](https://github.com/coinbase/x402/issues/1198)

**Solution:**
- Use PR #1139 fix or implement workaround
- Ensure facilitator supports your custom scheme

## SDK and Implementation Issues

### Problem: get_asset_info() returns wrong decimals for custom tokens

**Error Pattern:**
```python
# This returned USDC metadata (6 decimals) for WETH (18 decimals)
info = get_asset_info("eip155:8453", "0x4200000000000000000000000000000000000006")
# Fixed in recent versions to raise ValueError for unregistered tokens
```

**Solution:**
- Update to latest SDK version
- Register custom tokens in NETWORK_CONFIGS
- Handle ValueError exceptions for unknown tokens

### Problem: TypeScript type errors with PaymentRequirements

**Common Issues:**
- Missing `x402Version` field in facilitator requests
- Type mismatches between client and server schemas

**Solution:**
```typescript
// Ensure all required fields are present
const paymentRequired: PaymentRequired = {
  x402Version: 2,  // Don't forget this field!
  resource: { /* ... */ },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      amount: "1000000",
      asset: "0x...",
      payTo: "0x...",
      maxTimeoutSeconds: 300,
      extra: {}
    }
  ]
};
```

### Problem: Python import errors for optional dependencies

**Error:** `ImportError: EVM mechanism requires ethereum packages`

**Solution:**
```bash
# Install with extras for specific mechanisms
pip install x402[evm]  # For EVM support
pip install x402[svm]  # For Solana support
pip install x402[evm,svm]  # For both
```

## Discovery and Bazaar Setup

### Problem: Discovery document validation failures

**Common Issues:**
- Invalid JSON structure
- Missing required fields
- Incorrect network identifiers

**Validation:**
```bash
# Use discovery validator tool
cd tools/
node discovery-validator.js https://yourdomain.com/.well-known/x402

# Or validate local file
node discovery-validator.js ./your-discovery.json
```

### Problem: Bazaar indexing not working

**Checklist:**
1. Discovery document accessible at `/.well-known/x402`
2. CORS headers allow cross-origin requests
3. Content-Type: `application/json`
4. Valid schema compliance

**Example:**
```json
{
  "x402Version": 2,
  "discovery": {
    "accepts": [
      {
        "scheme": "exact",
        "network": "eip155:8453",
        "payTo": "0x...",
        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      }
    ]
  },
  "endpoints": [
    {
      "path": "/api/weather",
      "method": "GET",
      "description": "Weather data",
      "price": "$0.10"
    }
  ]
}
```

## Performance and Optimization

### Problem: Slow payment verification

**Optimization strategies:**
1. Cache asset metadata and network configs
2. Use persistent HTTP connections for facilitator requests
3. Implement request deduplication
4. Pre-validate signatures before facilitator calls

### Problem: High gas fees on Ethereum

**Solutions:**
1. Use L2 networks (Base, Optimism, Polygon)
2. Implement gas price monitoring
3. Batch multiple payments when possible
4. Use gasless options like Permit2

## Debugging Tools

### Useful Commands

**Check network connectivity:**
```bash
# Test facilitator endpoint
curl -X POST https://x402.org/facilitator/verify \
  -H "Content-Type: application/json" \
  -d '{"test": "connection"}'
```

**Validate signatures:**
```bash
# Use x402 CLI tools (if available)
x402 verify-signature --network eip155:8453 --signature 0x...
```

**Check token balances:**
```bash
# EVM networks
cast call $TOKEN_ADDRESS "balanceOf(address)(uint256)" $USER_ADDRESS --rpc-url $RPC_URL

# Solana
solana balance $TOKEN_ACCOUNT_ADDRESS --url $RPC_URL
```

### Debug Logging

**Enable debug logs:**
```typescript
// Node.js
process.env.DEBUG = 'x402:*';

// Python
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger('x402')
```

### Common Error Codes and Meanings

| Error Code | Meaning | Common Causes |
|------------|---------|---------------|
| `invalid_signature` | Signature verification failed | Clock skew, wrong private key, network mismatch |
| `insufficient_funds` | Not enough balance | Low token balance, missing allowances |
| `network_mismatch` | Network IDs don't match | Wrong chain ID in request |
| `invalid_amount` | Payment amount invalid | Decimal conversion errors, negative amounts |
| `transaction_failed` | On-chain execution failed | Gas issues, contract errors, invalid parameters |
| `asset_not_supported` | Token not recognized | Unregistered token, wrong asset address |

### Getting Help

If you're still experiencing issues:

1. Check the [GitHub Issues](https://github.com/coinbase/x402/issues)
2. Review [Example Code](https://github.com/coinbase/x402/tree/main/examples)
3. Join the community discussions
4. Open a new issue with:
   - Clear reproduction steps
   - Network and SDK versions
   - Relevant error logs
   - Minimal code example

## Prevention Best Practices

1. **Always use testnet first** - Test on Base Sepolia or Solana Devnet
2. **Validate inputs** - Check addresses, amounts, and network IDs
3. **Handle errors gracefully** - Don't assume payments will always work
4. **Monitor facilitator status** - Have fallback facilitators configured
5. **Keep SDKs updated** - New versions fix bugs and add features
6. **Document your integration** - Note specific network/asset combinations used

---

*This guide covers common scenarios. For specific issues not covered here, please check the [GitHub Issues](https://github.com/coinbase/x402/issues) or open a new issue with detailed reproduction steps.*