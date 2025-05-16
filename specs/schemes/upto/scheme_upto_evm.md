# Scheme: `upto` `EVM`

## Summary

The `upto` scheme on EVM chains uses `EIP-2612` and the `Permit2` contract to authorize a transfer of up to a specified amount of an `ERC20 token` from the payer to the resource server. This approach allows the resource server to charge the client for the actual cost of the resource, which may be less than or equal to the maximum amount specified.

## `X-Payment` header payload

The `payload` field of the `X-PAYMENT` header must contain the following fields:
- `signature`: The signature of the `Permit2` `permitTransferFrom` operation.
- `authorization`: parameters required to reconstruct the message signed for the `permitTransferFrom` operation.

Example:

```
{
  "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
  "authorization": {
    "owner": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "spender": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "token": "0x6B175474E89094C44DA98B954EedeAC495271d0F",
    "amount": "10000",
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
      amount: "10000",
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
3. Verify the client has approved the `Permit2` contract to spend at least `paymentRequirements.maxAmountRequired` of the `asset` 
4. Verify the amount in the `payload.authorization` is enough to cover `paymentRequirements.maxAmountRequired`
5. Verify the spender in the `payload.authorization` is the resource server
6. Verify the permit deadline is not expired
7. Verify nonce is not used
8. Verify the permit parameters are for the agreed upon ERC20 contract and chain
9. Simulate the `permitTransferFrom` to ensure the transaction would succeed

## Settlement

The resource server can settle the payment by calling the `permitTransferFrom` function on the `Permit2` contract with the signature and authorization parameters from the `X-PAYMENT` header. 

## Appendix

The `Permit2` contract requires the user to issue an "infinite" approval for the `Permit2` contract to spend the user's tokens before it can be used, which requires an additional setup step from the user. Alternatively, we could extend this scheme to take in an "infinite" `EIP-2612` `permit` signature along with the `Permit2` signature, which would delegate the approval step to the facilitator. Unfortunately, because of a hard dependency on `msg.sender`, these two transactions cannot be batched with a regular multicall, so it would increase the first payments settlement time.