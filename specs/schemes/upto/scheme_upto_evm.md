# Scheme: `upto` `EVM`

## Summary

The `upto` scheme on EVM chains uses `EIP-2612` to authorize a transfer of up to a specified amount of an `ERC20 token` from the payer to the resource server. This approach allows the resource server to charge the client for the actual cost of the resource, which may be less than or equal to the maximum amount specified.

## `X-Payment` header payload

The `payload` field of the `X-PAYMENT` header must contain the following fields:
- `signature`: The signature of the `EIP-2612` `permit` operation.
- `authorization`: parameters required to reconstruct the message signed for the `permit` operation.

Example:

```
{
  "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
  "authorization": {
    "owner": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "spender": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "value": "10000",
    "deadline": "1740672154",
    "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
  }
}

```

Full `X-PAYMENT` header:

```
{
  x402Version: 1,
  scheme: "upto",
  network: "base-sepolia",
  payload: {
    signature: "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    authorization: {
      owner: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      spender: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      value: "10000",
      deadline: "1740672154",
      nonce: "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
    }
  }
}
```

## Verification

Steps to verify a payment for the `upto` scheme:

1. Verify the signature is valid
2. Verify the `client` has enough of the `asset` (ERC20 token) to cover `paymentRequirements.maxAmountRequired`
3. Verify the value in the `payload.authorization` is enough to cover `paymentRequirements.maxAmountRequired`
4. Verify the spender in the `payload.authorization` is the resource server
5. Verify the permit deadline is not expired
6. Verify nonce is not used
7. Verify the permit parameters are for the agreed upon ERC20 contract and chain
8. Simulate the `permit` to ensure the transaction would succeed

## Settlement

The resource server can settle the payment by calling the `permit` and `transferFrom` functions on the `EIP-2612` compliant ERC20 token contract. This requires two separate transactions or a single transaction through a routing contract.

## Appendix

There are three ways i see to implement the `upto` scheme:

**`EIP-2612` with two transactions**: Regular use of the `EIP-2612` requires two transactions: `permit` and `transferFrom`. 

Pros:
- Simplicity
- No reliance on a third party contract.

Cons: 
- Doubled settlement time
- Only supports tokens that support `EIP-2612`
- Ordered nonces: sending transactions in parallel might cause nonce collisions.

**`EIP-2612` with a routing contract**: The `permit` and `transferFrom` functions can be called in a single transaction through a routing contract.

Pros:
- Single transaction settlement

Cons:
- Requires a routing contract to be deployed. This is an additional point of risk.
- Only supports tokens that support `EIP-2612`
- Ordered nonces: sending transactions in parallel might cause nonce collisions.

**Permit2**: `Permit2` is a meta-transaction contract that allows for allowance management and transfer of `ERC20` tokens in a single transaction.

Pros: 
- Single transaction settlement
- Supports all ERC20 tokens
- Well audited and widely used
- Unordered nonces: Supports multiple transactions in parallel

Cons:
- Requires the client to first approve the `Permit2` contract to spend their tokens
