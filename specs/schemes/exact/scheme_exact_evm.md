# Scheme: `exact` on `EVM`

## Summary

The `exact` scheme on EVM chains uses `EIP-3009` to authorize a transfer of a specific amount of an `ERC20 token` from the payer to the resource server. The approach results in the facilitator having no ability to direct funds anywhere but the address specified by the resource server in PaymentRequirements.

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` must contain the following fields:

- `signature`: The signature of the `EIP-3009` `transferWithAuthorization` operation.
- `authorization`: Parameters required to reconstruct the message signed for the `transferWithAuthorization` operation.

Example `payload`:

```json
{
  "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
  "authorization": {
    "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "value": "10000",
    "validAfter": "1740672089",
    "validBefore": "1740672154",
    "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
  }
}
```

Full `PaymentPayload` object:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "extra": {
      "name": "USDC",
      "version": "2"
    }
  },
  "payload": {
    "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    "authorization": {
      "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      "to": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "value": "10000",
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
    }
  }
}
```

## Verification

Steps to verify a payment for the `exact` scheme:

1. Verify the signature is valid
2. Verify the `client` has enough of the `asset` (ERC20 token) to cover `PaymentRequirements.amount`
3. Verify the value in the `payload.authorization` is enough to cover `PaymentRequirements.amount`
4. Verify the authorization parameters are within the valid time range
5. Verify nonce is not used
6. Verify the authorization parameters are for the agreed upon ERC20 contract and chain
7. Simulate the `transferWithAuthorization` to ensure the transaction would succeed

## Settlement

Settlement is performed via the facilitator calling the `transferWithAuthorization` function on the `EIP-3009` compliant contract with the `payload.signature` and `payload.authorization` parameters from the `PaymentPayload`.

## Appendix

There are 2 standards that `usdc` supports on EVM chains that we can leverage for a payments protocol, `EIP-3009` and `EIP-2612`.

**EIP-3009: Transfer with Authorization**: Allows for a signature to be used to authorize a transfer of a **specific amount** from one address to another in a single transaction.

Pros:

- CB can facilitate payments of specific amounts (broadcast transactions), meaning both the client and resource server do not need gas to settle payments.
- No new contracts needed, we can facilitate this transaction without needing to deploy a contract to route or custody funds onchain.

Cons:

- The signature authorizing transfer includes the `amount` to be transferred, meaning a resource server needs to know exactly how much something should cost at the time of request. This means things like usage-based payments (ex: generate tokens from an LLM) are not possible.

**EIP-2612: Permit**: Allows for a signature to be used to authorize usage of **up to an amount** funds from one address to another in a later transaction.

Pros:

- Because the permit signature gives permission for transfering up to an amount, it allows for usage-based payments.

Cons:

- Submitting the permit signature and then performing the `transferFrom` call are 2 separate function calls, meaning you need to either use `multicall` or deploy a contract (routing contract) that wraps the 2 functions. The permit signature would need to authorize the routing contract to transfer funds.

- Leverages `ERC-20` `transferFrom` / `approve` / `transfer` functions, which have a hard dependency on `msg.sender`. This breaks the flow of performing the facilitator batching a `permit()` call and a `transferFrom()` call in a single multicall (`msg.sender` becomes the multicall contract address rather than the facilitator's address).

### Recommendations

- Use `EIP-3009` for the first version of the protocol and only support payments of specific amounts.
- In follow up leverage `EIP-2612` + `routing contract` to support usage-based payments, and optionally bundle that with hard guarantees of payment by holding funds in escrow with the routing contract.
