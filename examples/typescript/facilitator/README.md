# X402 Facilitator Example

A reference implementation of an x402 payment facilitator that supports multiple authorization types.

## Supported Authorization Types

This facilitator supports all major EVM token authorization methods:

### 1. **EIP-3009** - `transferWithAuthorization`
- **Tokens**: USDC, EURC
- **Transactions**: 1
- **Gas Cost**: Lowest
- **Use Case**: Best for USDC payments

### 2. **EIP-2612** - Standard `permit`
- **Tokens**: Most modern ERC20 (DAI, UNI, COMP, AAVE, etc.)
- **Transactions**: 2 (permit + transferFrom)
- **Gas Cost**: Medium
- **Use Case**: Wide token support

### 3. **Permit2** - Universal Approvals
- **Tokens**: ANY ERC20 (including legacy tokens)
- **Transactions**: 1 (after one-time approval)
- **Gas Cost**: Medium
- **Use Case**: Maximum flexibility, future-proof

### 4. **Solana** - Token Transfers
- **Network**: Solana (mainnet/devnet)
- **Use Case**: SPL token transfers

## Quick Start

### 1. Install Dependencies

```bash
cd examples/typescript
pnpm install
pnpm build
```

### 2. Configure Environment

```bash
cd facilitator
cp .env-local .env
```

Edit `.env`:
```bash
# EVM chains (Base, Ethereum, etc.)
EVM_PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# Solana (optional)
SVM_PRIVATE_KEY=base58_private_key
SVM_RPC_URL=https://api.devnet.solana.com

# Server port
PORT=3002
```

### 3. Start the Facilitator

```bash
pnpm dev
```

You should see:
```
═══════════════════════════════════════════════════════
  X402 Facilitator Server
═══════════════════════════════════════════════════════
  Server listening at http://localhost:3002

  Supported Authorization Types:
    ✅ EIP-3009  - USDC/EURC transferWithAuthorization
    ✅ EIP-2612  - Standard ERC20 Permit
    ✅ Permit2   - Universal token approvals (any ERC20)

  Endpoints:
    POST /verify    - Verify payment signatures
    POST /settle    - Settle payments on-chain
    GET  /supported - List supported payment types
═══════════════════════════════════════════════════════
```

## API Endpoints

### POST /verify

Verifies a payment signature without executing the transaction.

**Request:**
```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "base",
    "payload": {
      "authorizationType": "permit",
      "signature": "0x...",
      "authorization": { ... }
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "1000000",
    "resource": "...",
    "payTo": "0x...",
    "asset": "0x...",
    ...
  }
}
```

**Response:**
```json
{
  "isValid": true,
  "payer": "0x..."
}
```

### POST /settle

Settles a verified payment on-chain.

**Request:** Same as `/verify`

**Response:**
```json
{
  "success": true,
  "transaction": "0x...",
  "network": "base",
  "payer": "0x..."
}
```

### GET /supported

Lists all supported payment types.

**Response:**
```json
{
  "kinds": [
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base",
      "extra": {
        "authorizationType": "eip3009",
        "description": "USDC/EURC with transferWithAuthorization"
      }
    },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base",
      "extra": {
        "authorizationType": "permit",
        "description": "ERC20 tokens with EIP-2612 Permit support"
      }
    },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base",
      "extra": {
        "authorizationType": "permit2",
        "description": "Any ERC20 token via Uniswap Permit2"
      }
    }
  ]
}
```

## How It Works

The facilitator acts as a trusted intermediary that:

1. **Verifies** payment signatures off-chain
2. **Settles** payments on-chain by executing the authorized transfer

```
┌─────────┐           ┌─────────────┐          ┌──────────────┐
│ Client  │  Sign     │ Facilitator │  Verify  │  Blockchain  │
│         │ Payment   │             │ Signature│              │
│         │──────────>│             │──────────>│              │
│         │           │             │          │              │
│         │           │   Settle    │ Execute  │              │
│Resource │           │             │ Transfer │              │
│ Server  │<──────────│             │──────────>│              │
└─────────┘  Confirm  └─────────────┘          └──────────────┘
```

## Authorization Type Selection

The facilitator automatically detects the authorization type from the payment payload:

```typescript
// EIP-3009
{
  "authorizationType": "eip3009",
  "authorization": {
    "from": "0x...",
    "to": "0x...",
    "value": "1000000",
    "validAfter": "0",
    "validBefore": "1234567890",
    "nonce": "0x..."
  }
}

// EIP-2612
{
  "authorizationType": "permit",
  "authorization": {
    "owner": "0x...",
    "spender": "0x...",
    "value": "1000000",
    "deadline": "1234567890",
    "nonce": "0"
  }
}

// Permit2
{
  "authorizationType": "permit2",
  "authorization": {
    "owner": "0x...",
    "spender": "0x...",
    "token": "0x...",
    "amount": "1000000",
    "deadline": "1234567890",
    "nonce": "0"
  }
}
```

## Testing with Different Authorization Types

### Test with EIP-3009 (USDC)
```bash
cd ../clients/chainlink-vrf-nft
pnpm run client
```

### Test with EIP-2612 (Permit)
```bash
cd ../clients/permit-erc20
pnpm run client
```

### Test with Permit2
```bash
cd ../clients/permit2-universal
pnpm run client
```

## Security Considerations

1. **Private Key Management** - Never commit private keys
2. **Network Validation** - Verify network matches expected chain
3. **Amount Validation** - Check amounts don't exceed limits
4. **Deadline Validation** - Ensure permits haven't expired
5. **Signature Verification** - Always verify signatures before settling

## Deployment

For production:

1. Use a secure key management system (HSM, KMS)
2. Implement rate limiting
3. Add authentication for settle endpoint
4. Monitor for suspicious activity
5. Set up proper error handling and logging

## Troubleshooting

**Error: "Missing required environment variables"**
- Ensure `EVM_PRIVATE_KEY` or `SVM_PRIVATE_KEY` is set in `.env`

**Error: "invalid_scheme"**
- Check that the authorization type is supported
- Verify the payment payload structure

**Error: "insufficient_funds"**
- Ensure the payer has enough token balance
- Check token approval if using Permit2

## Resources

- [X402 Specification](../../../specs/x402-specification.md)
- [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)
- [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612)
- [Permit2 Documentation](https://github.com/Uniswap/permit2)
