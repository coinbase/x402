# Scheme: `split` `evm`

## Summary

EVM implementation of the `split` scheme for distributing payments to multiple recipients via an on-chain splitter contract. Supports any ERC20 token on EVM-compatible networks (Base, Ethereum, Arbitrum, etc.).

The client approves the splitter contract and calls `split()` with the token, amount, and recipient array. The contract atomically distributes funds using `transferFrom` for each recipient.

## `X-Payment` header payload

The payment payload follows the standard x402 format with scheme-specific data:

```json
{
  "x402Version": 2,
  "scheme": "split",
  "network": "eip155:8453",
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0xPayer...",
      "to": "0xSplitter...",
      "value": "1000000",
      "data": "0x...",
      "chainId": 8453
    }
  }
}
```

### Client Construction Steps

1. Parse `PaymentRequirements` from 402 response
2. Extract `splitterAddress` and `recipients` from `extra`
3. Encode `split(address token, uint256 totalAmount, Recipient[] recipients)` calldata
4. Approve splitter to spend `amount` of `asset` (if not already approved)
5. Send transaction calling `splitter.split(asset, amount, recipients)`
6. Include transaction hash in payment header

### Calldata Encoding

```typescript
import { encodeFunctionData } from "viem";

const calldata = encodeFunctionData({
  abi: SPLITTER_ABI,
  functionName: "split",
  args: [
    asset,                    // ERC20 token address
    BigInt(amount),           // Total amount in smallest units
    recipients.map(r => ({    // Recipient array
      addr: r.address,
      bps: BigInt(r.bps),
    })),
  ],
});
```

## Verification

The facilitator MUST perform the following verification steps:

1. **Transaction receipt**: Fetch receipt for the provided transaction hash. MUST have `status === 1` (success).

2. **Contract target**: The transaction MUST interact with the declared `splitterAddress`. Note: for smart wallets (ERC-4337), the top-level `to` may be the EntryPoint contract. Verify via emitted events instead.

3. **PaymentSplit event**: The `PaymentSplit` event MUST be emitted from `splitterAddress` with:
   - `payer` matching the declared client address
   - `token` matching `PaymentRequirements.asset`
   - `totalAmount >= PaymentRequirements.amount`

4. **RecipientPaid events**: For each recipient in `PaymentRequirements.extra.recipients`, a `RecipientPaid` event MUST be emitted with:
   - `recipient` matching the declared address
   - `amount` matching `(totalAmount * bps) / 10000` (within rounding tolerance of 1 unit)

5. **Confirmations**: Transaction MUST have at least 1 block confirmation on Base L2.

### Event Topics

```
PaymentSplit: keccak256("PaymentSplit(address,address,uint256,uint256)")
RecipientPaid: keccak256("RecipientPaid(address,address,uint256,uint256)")
```

## Settlement

Settlement is immediate upon verification. The splitter contract executes all transfers atomically during the client's transaction, so no separate settlement step is required.

The facilitator returns:

```json
{
  "success": true,
  "transaction": "0xTransactionHash...",
  "network": "eip155:8453"
}
```

## Appendix

### Gas Costs (Base L2)

| Recipients | Estimated Gas | Approx Cost (Base) |
|------------|--------------|---------------------|
| 2 | ~70,000 | ~$0.001 |
| 3 | ~85,000 | ~$0.0015 |
| 4 | ~100,000 | ~$0.002 |
| 5 | ~120,000 | ~$0.0025 |

### Supported Networks

Any EVM network supported by x402:
- Base Mainnet (`eip155:8453`)
- Base Sepolia (`eip155:84532`)
- Ethereum Mainnet (`eip155:1`)
- Arbitrum (`eip155:42161`)

### Splitter Contract ABI

```json
[
  {
    "inputs": [
      { "name": "token", "type": "address" },
      { "name": "totalAmount", "type": "uint256" },
      {
        "name": "recipients",
        "type": "tuple[]",
        "components": [
          { "name": "addr", "type": "address" },
          { "name": "bps", "type": "uint256" }
        ]
      }
    ],
    "name": "split",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]
```
