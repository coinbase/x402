# x402 Error Handling Guide

This guide covers common errors you may encounter when working with x402 and how to resolve them.

## Client Errors

### Network Connection Issues

**Error:** `Failed to fetch` or `Network request failed`

**Causes:**
- Facilitator endpoint is unreachable
- Network connectivity issues
- CORS policy blocking the request (browser environments)

**Solutions:**
```typescript
// Always handle network errors gracefully
try {
  const result = await x402Client.request(url, options);
  return result;
} catch (error) {
  if (error.message.includes('fetch')) {
    throw new Error('Network unavailable. Please check your connection.');
  }
  throw error;
}
```

### Payment Requirement Parsing

**Error:** `Invalid payment requirements format`

**Causes:**
- Malformed 402 response from server
- Missing required fields in payment requirements
- Incorrect JSON structure

**Solutions:**
```typescript
// Validate payment requirements before processing
function validatePaymentRequirements(requirements: unknown): PaymentRequirements {
  if (!requirements || typeof requirements !== 'object') {
    throw new Error('Payment requirements must be an object');
  }
  
  const req = requirements as PaymentRequirements;
  if (!req.schemes || !Array.isArray(req.schemes)) {
    throw new Error('Payment requirements must include schemes array');
  }
  
  return req;
}
```

## Server Configuration Errors

### Middleware Setup Issues

**Error:** `Cannot read property 'accepts' of undefined`

**Causes:**
- Route configuration missing or malformed
- Incorrect middleware initialization order

**Solutions:**
```typescript
// Correct middleware setup
app.use(paymentMiddleware({
  "GET /api/weather": {
    accepts: [{
      scheme: "exact/evm/v1",
      network: "eip155:8453",
      price: "$0.01",
      payTo: "0x742d35cC6634C0532925a3b8d46B7E68a3d8b8D4"
    }],
    description: "Weather data for specified location"
  }
}, server));

// ❌ Wrong - missing accepts array
app.use(paymentMiddleware({
  "GET /api/weather": {
    description: "Weather data"
    // Missing accepts!
  }
}, server));
```

### Asset Configuration Problems

**Error:** `Token not supported on this network`

**Causes:**
- Asset address not in network's supported assets list
- Network configuration missing from NETWORK_CONFIGS
- Incorrect asset address format

**Solutions:**
```typescript
// Check if asset is supported before using
import { get_asset_info } from '@x402/evm';

try {
  const assetInfo = get_asset_info("eip155:8453", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  console.log('Asset supported:', assetInfo);
} catch (error) {
  console.error('Asset not supported:', error.message);
  // Fallback to default asset or show error to user
}
```

## Payment Processing Errors

### Insufficient Funds

**Error:** `Insufficient balance for payment`

**Causes:**
- User wallet balance too low
- Gas fees not accounted for
- Token allowance not set (ERC-20)

**Solutions:**
```typescript
// Always check balance before attempting payment
async function checkSufficientBalance(
  walletAddress: string, 
  tokenAddress: string, 
  amount: bigint, 
  networkId: string
): Promise<boolean> {
  const balance = await getTokenBalance(walletAddress, tokenAddress, networkId);
  const gasEstimate = await estimateGasCost(networkId);
  
  return balance >= (amount + gasEstimate);
}
```

### Transaction Failures

**Error:** `Transaction reverted` or `Transaction failed`

**Causes:**
- Smart contract execution failed
- Insufficient gas limit
- Contract state changed between estimate and execution

**Solutions:**
```typescript
// Retry logic with exponential backoff
async function retryTransaction(
  transactionFn: () => Promise<string>, 
  maxRetries: number = 3
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await transactionFn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.pow(2, i) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries reached');
}
```

## Facilitator Errors

### Invalid Payment Verification

**Error:** `Payment verification failed`

**Causes:**
- Transaction not yet confirmed on blockchain
- Incorrect payment amount or recipient
- Transaction was cancelled or replaced

**Solutions:**
```typescript
// Wait for transaction confirmation before verification
async function waitForConfirmation(txHash: string, confirmations = 1): Promise<void> {
  let currentConfirmations = 0;
  
  while (currentConfirmations < confirmations) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }
    
    const currentBlock = await provider.getBlockNumber();
    currentConfirmations = currentBlock - receipt.blockNumber + 1;
    
    if (currentConfirmations < confirmations) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
```

### Signature Validation Errors

**Error:** `Invalid signature` or `Signature verification failed`

**Causes:**
- Incorrect message format for signing
- Wrong signer address
- Message modified after signing

**Solutions:**
```typescript
// Ensure consistent message formatting
function formatMessageForSigning(paymentData: PaymentData): string {
  // Use deterministic JSON stringify
  return JSON.stringify(paymentData, Object.keys(paymentData).sort());
}

// Verify signer matches expected address
async function verifySignature(
  message: string, 
  signature: string, 
  expectedSigner: string
): Promise<boolean> {
  const recoveredAddress = ethers.utils.verifyMessage(message, signature);
  return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
}
```

## Debugging Tips

### Enable Debug Logging

```typescript
// For client-side debugging
localStorage.setItem('x402:debug', 'true');

// For server-side debugging (Node.js)
process.env.X402_DEBUG = 'true';
```

### Inspect Network Requests

When debugging payment flow issues:

1. **Check the 402 Response:**
   - Verify `WWW-Authenticate` header is present
   - Validate payment requirements JSON structure
   - Confirm supported schemes match your client

2. **Verify Payment Transaction:**
   - Check transaction hash on blockchain explorer
   - Confirm amount and recipient are correct
   - Ensure transaction is confirmed (not pending)

3. **Test Facilitator Response:**
   - Verify `/verify` endpoint accepts your payment proof
   - Check response headers and status codes
   - Confirm settlement response format

### Common Debugging Commands

```bash
# Test facilitator endpoint health
curl -X GET "https://your-facilitator.com/health"

# Manually trigger 402 response
curl -X GET "https://your-server.com/protected-resource"

# Verify payment with facilitator
curl -X POST "https://facilitator.com/verify" \
  -H "Content-Type: application/json" \
  -d '{"proof": "your-payment-proof"}'
```

## Error Codes Reference

| Code | Description | Resolution |
|------|-------------|------------|
| `INSUFFICIENT_FUNDS` | Wallet balance too low | Add funds or reduce payment amount |
| `INVALID_SIGNATURE` | Signature verification failed | Check message format and signer |
| `UNSUPPORTED_ASSET` | Token not supported | Use supported asset or request addition |
| `NETWORK_ERROR` | Connection failed | Check network connectivity |
| `TRANSACTION_FAILED` | Blockchain transaction reverted | Check gas and contract state |
| `VERIFICATION_TIMEOUT` | Payment verification timed out | Wait for confirmation, then retry |
| `MALFORMED_REQUEST` | Invalid request format | Validate request structure |

## Best Practices for Error Handling

1. **Always use try-catch blocks** around x402 operations
2. **Provide user-friendly error messages** instead of raw error objects
3. **Implement retry logic** for network-related failures
4. **Log errors with context** for debugging purposes
5. **Validate inputs** before processing
6. **Handle edge cases** like network switching and connection drops
7. **Test error scenarios** in your development environment

## Getting Help

If you encounter errors not covered in this guide:

1. Check the [x402 GitHub Issues](https://github.com/coinbase/x402/issues)
2. Search existing issues for similar problems
3. Create a new issue with:
   - Detailed error message
   - Steps to reproduce
   - Environment details (browser, Node.js version, etc.)
   - Relevant code snippets

For urgent issues, consider posting in the [x402 Discord](https://discord.gg/x402) community.