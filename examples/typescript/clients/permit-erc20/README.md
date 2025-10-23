# EIP-2612 Permit Example

This example demonstrates how to use the x402 protocol with **EIP-2612 Permit** (standard ERC20 permit) instead of EIP-3009.

## Key Differences from EIP-3009

| Feature | EIP-3009 | EIP-2612 Permit |
|---------|----------|-----------------|
| **Token Support** | USDC, EURC only | Most modern ERC20 tokens |
| **Nonce Management** | Custom nonce (bytes32) | Sequential on-chain nonce |
| **Settlement** | 1 transaction (`transferWithAuthorization`) | 2 transactions (`permit` + `transferFrom`) |
| **Gas Cost** | Lower | Slightly higher |

## Supported Tokens

EIP-2612 Permit is supported by many popular tokens including:
- **DAI**
- **UNI** (Uniswap)
- **COMP** (Compound)
- **AAVE**
- Most tokens deployed with OpenZeppelin's ERC20Permit

## Setup

1. **Install Dependencies:**
   ```bash
   cd examples/typescript
   pnpm install
   pnpm build
   ```

2. **Configure Environment Variables:**
   ```bash
   cp .env-local .env
   ```
   
   Edit `.env` and add:
   ```
   CLIENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
   PROVIDER_URL=https://base.blockpi.network/v1/rpc/YOUR_RPC_KEY
   ```

3. **Ensure Facilitator is Running:**
   ```bash
   cd ../facilitator
   pnpm dev
   ```

## Running the Example

你需要**三个终端**来运行完整的测试：

### 终端 1: 启动 Facilitator

```bash
cd ../../facilitator
cp .env-local .env
# 编辑 .env，填入 EVM_PRIVATE_KEY
pnpm dev
```

等待看到 `Server listening at http://localhost:3002`

### 终端 2: 启动 Resource Server

```bash
cd examples/typescript/clients/permit-erc20
pnpm run resource
```

### 终端 3: 运行 Client

```bash
cd examples/typescript/clients/permit-erc20
cp .env-local .env
# 编辑 .env，填入 CLIENT_PRIVATE_KEY
pnpm run client
```

## How It Works

### 1. Client Side
```typescript
// Sign a Permit authorization
const { signature, nonce } = await signPermit(wallet, {
  owner: clientAddress,
  spender: facilitatorAddress,
  value: "1000000", // Amount to approve
  deadline: Math.floor(Date.now() / 1000) + 3600,
}, paymentRequirements);
```

### 2. Payment Header
The client creates an x402 payment header with:
```json
{
  "authorizationType": "permit",
  "signature": "0x...",
  "authorization": {
    "owner": "0x...",
    "spender": "0x...",
    "value": "1000000",
    "deadline": "1234567890",
    "nonce": "0"
  }
}
```

### 3. Facilitator Side
The facilitator:
1. **Verifies** the permit signature
2. **Settles** by calling:
   - `permit(owner, spender, value, deadline, v, r, s)` - Approves the transfer
   - `transferFrom(owner, payTo, amount)` - Executes the transfer

## Token Requirements

Your wallet needs:
- ✅ **ERC20 tokens with Permit support** (e.g., DAI, UNI)
- ✅ **ETH for gas fees** (~ 0.001 ETH)

## Architecture

```
┌─────────┐           ┌────────────┐          ┌──────────────┐
│ Client  │  Permit   │ Facilitator│  permit()│  ERC20 Token │
│         │ ─────────>│            │─────────>│   Contract   │
│         │           │            │          │              │
│         │           │            │transferFr│              │
│         │           │            │om()──────>│              │
└─────────┘           └────────────┘          └──────────────┘
```

## Advantages of Permit

1. **Wider Token Support** - Works with many more tokens than EIP-3009
2. **No Token Redeployment** - Uses standard ERC20Permit extension
3. **Gasless Approvals** - Users sign permit off-chain

## Disadvantages

1. **Two Transactions** - Requires both `permit()` and `transferFrom()`
2. **Higher Gas** - More expensive than EIP-3009
3. **Sequential Nonces** - Cannot reorder transactions

## Next Steps

- Try with different ERC20 tokens (DAI, UNI, AAVE, etc.)
- Compare gas costs with EIP-3009
- Explore Permit2 for universal token support

