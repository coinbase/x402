# Permit2 Universal Token Approvals Example

This example demonstrates how to use the x402 protocol with **Uniswap Permit2**, which provides universal token approvals for **any ERC20 token**.

## What is Permit2?

Permit2 is a token approval contract deployed by Uniswap at a canonical address on all chains:
```
0x000000000022D473030F116dDEE9F6B43aC78BA3
```

### Key Features

✅ **Universal Support** - Works with ANY ERC20 token, even without native permit support  
✅ **Single Approval** - Users approve Permit2 once, then use signatures for transfers  
✅ **Batch Operations** - Can transfer multiple tokens in one transaction  
✅ **Expiring Approvals** - Built-in expiration for better security  
✅ **No Token Modifications** - Works with existing ERC20 contracts  

## Comparison

| Feature | EIP-3009 | EIP-2612 | **Permit2** |
|---------|----------|----------|-------------|
| **Token Support** | USDC only | Modern ERC20 | **ANY ERC20** |
| **Setup Required** | None | None | **One-time approval** |
| **Transactions** | 1 | 2 | **1** (after approval) |
| **Security** | ✅ High | ✅ High | **✅✅ Highest** |
| **Gas Cost** | Lowest | Medium | **Medium** |

## Architecture

```
┌─────────┐                   ┌──────────────┐
│  User   │──approve once────>│   Permit2    │
│         │                   │   Contract   │
└─────────┘                   └──────────────┘
     │                                │
     │ Sign Permit                    │
     │ (off-chain)                    │
     ▼                                │
┌─────────────┐                       │
│ x402 Client │                       │
└─────────────┘                       │
     │                                │
     │ X-PAYMENT header               │
     ▼                                ▼
┌──────────────┐          ┌────────────────────┐
│ Facilitator  │─────────>│  ERC20 Token       │
│              │ transfer │  (any token!)      │
└──────────────┘          └────────────────────┘
```

## Setup

### 1. One-Time Approval (Required First Time)

Before using Permit2, users must approve the Permit2 contract to spend their tokens:

```typescript
// Approve Permit2 to spend your tokens
await token.approve(
  "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  MaxUint256
);
```

This only needs to be done **once per token**.

### 2. Install Dependencies

```bash
cd examples/typescript
pnpm install
pnpm build
```

### 3. Configure Environment

```bash
cp .env-local .env
```

Edit `.env`:
```
CLIENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
PROVIDER_URL=https://base.blockpi.network/v1/rpc/YOUR_RPC_KEY
```

### 4. Run Facilitator

```bash
cd ../facilitator
pnpm dev
```

## Running the Example

```bash
pnpm run client
```

## How It Works

### 1. Sign Permit2 Authorization (Off-chain)

```typescript
const signature = await wallet.signTypedData({
  domain: {
    name: "Permit2",
    chainId,
    verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  },
  types: {
    PermitTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    TokenPermissions: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  message: {
    permitted: {
      token: tokenAddress,
      amount: paymentAmount,
    },
    spender: facilitatorAddress,
    nonce: currentNonce,
    deadline: expirationTime,
  },
});
```

### 2. Create x402 Payment Header

```typescript
const paymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "base",
  payload: {
    authorizationType: "permit2",
    signature,
    authorization: {
      owner: clientAddress,
      spender: facilitatorAddress,
      token: tokenAddress,
      amount: paymentAmount,
      deadline: expirationTime,
      nonce: currentNonce,
    },
  },
};
```

### 3. Facilitator Settles Payment

The facilitator calls Permit2's `permitTransferFrom`:

```solidity
function permitTransferFrom(
  PermitTransferFrom memory permit,
  SignatureTransferDetails calldata transferDetails,
  address owner,
  bytes calldata signature
)
```

This transfers tokens directly from the user to the payee in **one transaction**.

## Supported Tokens

Permit2 works with **ANY ERC20 token**, including:
- USDC, USDT, DAI
- WETH, WBTC
- UNI, AAVE, COMP
- Custom tokens
- **Even tokens without native permit support!**

## Advantages

✅ **Universal** - Works with any ERC20  
✅ **Efficient** - One transaction after initial approval  
✅ **Secure** - Expiring approvals reduce risk  
✅ **Future-proof** - Standard adopted by major protocols  
✅ **Batch Support** - Can transfer multiple tokens at once  

## Disadvantages

⚠️ **Initial Approval** - Requires one-time on-chain approval  
⚠️ **Complexity** - More complex than simple permit  
⚠️ **Gas** - Slightly higher gas than EIP-3009  

## Security Considerations

1. **Expiring Approvals** - Set reasonable deadlines
2. **Nonce Management** - Permit2 tracks nonces to prevent replays
3. **Signature Validation** - Always verify signatures match expected owner
4. **Amount Limits** - Request only what's needed

## Resources

- [Permit2 Documentation](https://github.com/Uniswap/permit2)
- [Permit2 Contract Address](https://etherscan.io/address/0x000000000022D473030F116dDEE9F6B43aC78BA3)
- [Integration Guide](https://docs.uniswap.org/contracts/permit2/overview)

## Next Steps

- Integrate batch transfers (multiple tokens in one payment)
- Use with any ERC20 token
- Explore advanced Permit2 features (witness data, etc.)

