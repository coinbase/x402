# Scheme: `exact` on `XRP Ledger`

## Summary

The `exact` scheme on XRP Ledger uses the native Payment transaction type to transfer a specific amount of either XRP (native currency) or issued tokens from the payer to the resource server. The approach requires the payer to form a complete signed transaction which results in the facilitator having no ability to adjust the transaction and direct funds anywhere but the address specified by the resource server in paymentRequirements.

## Protocol Sequencing

![](../../../static/xrp-exact-flow.png)

The following outlines the flow of the `exact` scheme on `XRP Ledger`:

1. Client makes a request to a `resource server` and gets back a `402 Payment Required` response.
2. If the client doesn't already have local information about their account balance and sequence number, it can make a request to an RPC service to get the current account information.
3. Craft and sign a Payment transaction to be used as payment.
4. Resend the request to the `resource server` including the payment in the `X-PAYMENT` header.
5. `resource server` passes the payment payload to the `facilitator` for verification.
6. `resource server` does the work to fulfill the request.
7. `resource server` requests settlement from the `facilitator`.
8. `facilitator` submits the transaction to the `XRP Ledger` network for execution and reports back to the `resource server` the result of the transaction.
9. `resource server` returns the response to the client.

## `X-Payment` header payload

The `payload` field of the `X-PAYMENT` header must contain the following fields:

- `signature`: The signed transaction blob (hex encoded) for the XRP Payment transaction.
- `transaction`: The JSON representation of the signed XRP Payment transaction.

Example:

```json
{
  "signature": "12000022800000002400000001614000000005F5E1006840000000000000",
  "transaction": "{\"TransactionType\":\"Payment\",\"Account\":\"rN7n7otQDd6FczFgLdAtBjjqyUT8EbGRvS\",\"Destination\":\"rfkDp7HsXcJPDs4R5TQasKmgNVb5sEj8LS\",\"Amount\":\"100000000\",\"Fee\":\"12\",\"Sequence\":1,\"SigningPubKey\":\"02...\"}"
}
```

Full `X-PAYMENT` header:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "xrp-mainnet",
  "payload": {
    "signature": "12000022800000002400000001614000000005F5E1006840000000000000",
    "transaction": "{\"TransactionType\":\"Payment\",\"Account\":\"rN7n7otQDd6FczFgLdAtBjjqyUT8EbGRvS\",\"Destination\":\"rfkDp7HsXcJPDs4R5TQasKmgNVb5sEj8LS\",\"Amount\":\"100000000\",\"Fee\":\"12\",\"Sequence\":1,\"SigningPubKey\":\"02...\"}"
  }
}
```

## Native XRP vs Issued Tokens

The XRP Ledger supports two types of assets:

1. **Native XRP**: The native currency, measured in "drops" (1 XRP = 1,000,000 drops)
   - Asset field in payment requirements: `"XRP"` or empty
   - Amount specified in drops as a string

2. **Issued Tokens**: Tokens issued by accounts on the XRP Ledger
   - Asset field format: `"CURRENCY.ISSUER"` (e.g., `"USD.rN7n7otQDd6FczFgLdAtBjjqyUT8EbGRvS"`)
   - Amount specified as decimal value string
   - Requires trustline between payer and issuer

## Verification

Steps to verify a payment for the `exact` scheme:

1. Verify the network is for the agreed upon XRP Ledger network (mainnet, testnet, or devnet).
2. Verify the signature is valid over the provided transaction.
3. Validate the transaction structure and required fields.
4. Check that the transaction has not already been executed on-chain (using transaction hash).
5. Verify the destination address matches the resource server's address in `paymentRequirements.payTo`.
6. Verify the amount matches or exceeds the value in `paymentRequirements.maxAmountRequired`.
7. For issued tokens, verify the currency and issuer match the specified asset.

## Settlement

Settlement is performed via the facilitator broadcasting the signed transaction to the XRP Ledger network for execution. The facilitator should:

1. Submit the transaction to a reliable XRP Ledger node.
2. Wait for the transaction to be validated and included in a closed ledger.
3. Return the transaction result including the transaction hash and ledger index.

## Memos

The XRP Ledger supports attaching memo data to transactions. If a nonce or invoice ID is provided in the payment requirements, it will be included as a memo in the transaction with:
- Memo Type: `"x402-nonce"` (hex encoded)
- Memo Data: The nonce/invoice ID value (hex encoded)

## Transaction Fees

XRP Ledger transactions require a small fee in XRP (typically 10-12 drops). The client must:
1. Have sufficient XRP balance to cover both the payment amount (if paying in XRP) and the transaction fee.
2. Set an appropriate fee based on current network conditions.
3. Account for the fee when calculating available balance.

## Error Handling

Common error scenarios:

1. **Insufficient XRP for fees**: Even when paying with issued tokens, XRP is required for transaction fees.
2. **No trustline**: For issued token payments, the payer must have a trustline to the issuer.
3. **Sequence number mismatch**: The transaction sequence must match the account's current sequence.
4. **Destination tag required**: Some addresses require a destination tag for compliance.

## Future Work

1. **Multi-signing support**: Enable payment authorization from multi-signature accounts.
2. **Escrow payments**: Support for conditional payments using XRP Ledger's escrow feature.
3. **Payment channels**: Implement micropayments using XRP Ledger payment channels for reduced fees.
4. **Cross-currency payments**: Leverage XRP Ledger's built-in DEX for automatic currency conversion.

## Recommendation

- Use the spec defined above for the first version of the protocol.
- Support both native XRP and issued token payments.
- Implement proper error handling for XRP Ledger-specific scenarios.
- Consider implementing payment channels in a future version for high-frequency micropayments.