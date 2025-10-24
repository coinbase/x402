# EIP-2612 Permit Quick Start Guide

## 🎯 Verify Permit Support

Follow these steps to verify x402's EIP-2612 Permit support:

## 📋 Prerequisites

### 1. Prepare Wallet and Funds

You need a wallet containing:
- ✅ **DAI tokens** (or other ERC20 supporting EIP-2612)
- ✅ **ETH** (small amount for gas fees)

**Get test tokens:**
- Base Mainnet: Withdraw from exchanges or swap on DEX
- Testnet: Use faucets

### 2. Install Dependencies

```bash
cd examples/typescript
pnpm install
pnpm build
```

## 🚀 Running Steps

### Step 1: Configure Facilitator

```bash
cd ../../facilitator
cp .env-local .env
```

Edit `.env`:
```env
EVM_PRIVATE_KEY=0xYOUR_FACILITATOR_PRIVATE_KEY
```

### Step 2: Configure Permit Client

```bash
cd examples/typescript/clients/permit-erc20
cp .env-local .env
```

Edit `.env`:
```env
CLIENT_PRIVATE_KEY=0xYOUR_CLIENT_PRIVATE_KEY
PROVIDER_URL=https://base.blockpi.network/v1/rpc/YOUR_RPC_KEY
```

### Step 3: Install Example Dependencies

```bash
cd examples/typescript/clients/permit-erc20
pnpm install
```

## 🎬 Start Testing

Open **three terminals**:

### 🟦 Terminal 1 - Facilitator

```bash
cd facilitator
pnpm dev
```

**Expected output:**
```
✓ Registered route: POST /settle (exact/evm)
✓ Registered route: POST /verify (exact/evm)
✓ Registered route: GET /supported-payment-kinds
Server listening at http://localhost:3002
```

### 🟩 Terminal 2 - Resource Server

```bash
cd examples/typescript/clients/permit-erc20
pnpm run resource
```

**Expected output:**
```
🔒 Protected resource server started
📍 Listening on http://localhost:4024
💰 Accepting Permit payments for DAI
```

### 🟨 Terminal 3 - Client

```bash
cd examples/typescript/clients/permit-erc20
pnpm run client
```

**Expected output:**
```
═══════════════════════════════════════════
   EIP-2612 Permit x402 Example
═══════════════════════════════════════════

🔐 Creating Permit payment header...
   Client: 0x...
   Token: 0x1111111111166b7fe7bd91427724b487980afc69
   Amount: 1000000000000000000
   Current nonce: 0
   ✅ Permit signed!

🚀 Making request to resource server...

💰 402 Payment Required
   Payment details: {...}

🔄 Retrying with payment...

✅ Success!
   Response: { message: 'Payment received and verified!', ... }
```

## ✅ Success Indicators

If you see the following logs, Permit support is working correctly:

### Facilitator Logs
```
Verifying EVM payment...
Authorization type: permit
Permit signature verified ✓
Settling EVM payment...
Permit transaction confirmed ✓
TransferFrom transaction confirmed ✓
```

### Resource Server Logs
```
💰 Payment verified successfully
Payer: 0x...
```

### Client Logs
```
✅ Success!
Response: { message: 'Payment received and verified!' }
```

## 🔍 Key Verification Points

1. ✅ Client successfully creates Permit signature
2. ✅ Facilitator correctly verifies Permit signature
3. ✅ Facilitator calls `permit()` for approval
4. ✅ Facilitator calls `transferFrom()` for transfer
5. ✅ Resource Server receives 200 OK

## 🐛 Common Issues

**Missing private key?**
Edit `.env` file and add your private key

**Insufficient balance?**
Ensure wallet has enough DAI and ETH

**Connection refused?**
- Check if Facilitator is running (port 3002)
- View Facilitator terminal error logs

**Invalid token?**
- Check if token address is correct
- Confirm token supports EIP-2612

## 🎓 Understanding How It Works

### 1. Client Signs Permit (Off-chain)

```typescript
const signature = await wallet.signTypedData({
  domain: { name: "DAI", version: "1", ... },
  types: { Permit: [...] },
  message: { owner, spender, value, nonce, deadline }
});
```

### 2. Facilitator Verifies (Off-chain)

```typescript
const recoveredAddress = verifyTypedData({
  domain, types, message, signature
});
// Check if recoveredAddress === authorization.owner
```

### 3. Facilitator Settles (On-chain - 2 transactions)

```solidity
// Transaction 1: Approve
token.permit(owner, spender, value, deadline, v, r, s);

// Transaction 2: Transfer
token.transferFrom(owner, payTo, amount);
```

## 📊 Comparison with EIP-3009

| Feature | EIP-3009 | EIP-2612 |
|---------|----------|----------|
| **Tokens** | USDC only | DAI, UNI, AAVE, etc. |
| **Transactions** | 1 | **2** |
| **Gas** | Lower | Higher |
| **Nonce** | Custom bytes32 | Sequential uint256 |

## 🎯 Next Steps

- ✅ Try Permit2 example (supports any ERC20)
- ✅ Test different ERC20 tokens
- ✅ Compare gas costs of three authorization methods

## 📚 Related Resources

- [EIP-2612 Specification](https://eips.ethereum.org/EIPS/eip-2612)
- [Full Documentation](../../../AUTHORIZATION_TYPES.md)
- [Permit2 Example](../permit2-universal/README.md)
