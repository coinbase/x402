# Exact Payment Scheme for NEAR Protocol (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on NEAR.

This scheme facilitates payments of a specific amount of a NEP-141 fungible token on the NEAR blockchain.

## Scheme Name

`exact`

## Protocol Flow

The protocol flow for `exact` on NEAR leverages NEP-366 meta transactions (DelegateAction).

1.  **Client** makes an HTTP request to a **Resource Server**.
2.  **Resource Server** responds with a `402 Payment Required` status. The response body contains the `paymentRequirements` for the `exact` scheme. The `extra` field contains a **relayerId** which is the NEAR account ID that will act as the relayer and pay transaction gas fees. This will typically be the facilitator.
3.  **Client** creates a `DelegateAction` that contains:
    - An `ft_transfer` function call action to transfer the specified amount of tokens
    - The client's account ID as `sender_id`
    - The fungible token contract account ID as `receiver_id`
    - Appropriate `nonce` and `max_block_height` for replay protection
4.  **Client** signs the `DelegateAction` with their ED25519 private key, creating a `SignedDelegateAction`.
5.  **Client** serializes the `SignedDelegateAction` using Borsh serialization and encodes it as a Base64 string.
6.  **Client** sends a new HTTP request to the resource server with the `X-PAYMENT` header containing the Base64-encoded `SignedDelegateAction`.
7.  **Resource Server** receives the request and forwards the `X-PAYMENT` header and `paymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
8.  **Facilitator** decodes and deserializes the `SignedDelegateAction`.
9.  **Facilitator** verifies:
    - The signature is valid for the sender's account
    - The `DelegateAction` contains only the expected `ft_transfer` function call
    - The transfer amount matches `maxAmountRequired`
    - The recipient matches `payTo`
    - The `nonce` hasn't been used
    - The `max_block_height` hasn't been exceeded
    - The sender has sufficient token balance
10. **Facilitator** returns a verification response to the **Resource Server**.
11. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
12. **Facilitator Server** wraps the `SignedDelegateAction` in a standard NEAR transaction as `Action::Delegate`, signs it as the relayer, and submits it to the NEAR network.
13. Upon successful on-chain settlement, the **Facilitator Server** responds to the **Resource Server**.
14. **Resource Server** grants the **Client** access to the resource in its response.


## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on NEAR requires the following:

```json
{
  "scheme": "exact",
  "network": "near-mainnet",
  "maxAmountRequired": "1000000",
  "asset": "usdc.near",
  "payTo": "merchant.near",
  "resource": "https://example.com/weather",
  "description": "Access to protected content",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 60,
  "outputSchema": null,
  "extra": {
    "relayerId": "facilitator.near",
    "ftContract": "usdc.near"
  }
}
```

-   `asset`: The NEAR account ID of the NEP-141 fungible token contract (e.g., "usdc.near", "wrap.near").
-   `extra.relayerId`: The NEAR account ID that will act as the relayer and pay transaction gas fees. This is typically the facilitator's account.
-   `extra.ftContract`: The NEAR account ID of the fungible token contract (should match `asset` for clarity).


## `X-PAYMENT` Header Payload

The `X-PAYMENT` header is base64 encoded and sent in the request from the client to the resource server when paying for a resource.

Once decoded, the `X-PAYMENT` header is a JSON string with the following properties:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "near-mainnet",
  "payload": {
    "signedDelegateAction": "BASE64_ENCODED_BORSH_SERIALIZED_SIGNED_DELEGATE_ACTION"
  }
}
```

The `payload.signedDelegateAction` field contains the base64-encoded, Borsh-serialized `SignedDelegateAction`.


### SignedDelegateAction Structure

The `SignedDelegateAction` contains:

```rust
struct SignedDelegateAction {
    pub delegate_action: DelegateAction,
    pub signature: Signature,
}

struct DelegateAction {
    pub sender_id: AccountId,        // Client's NEAR account ID
    pub receiver_id: AccountId,      // FT contract account ID
    pub actions: Vec<Action>,        // Must contain ft_transfer function call
    pub nonce: u64,                  // For replay protection
    pub max_block_height: u64,       // Expiration block height
    pub public_key: PublicKey,       // Client's public key
}
```

### ft_transfer Action Details

The `actions` field must contain a single `FunctionCall` action with:

```json
{
  "FunctionCall": {
    "method_name": "ft_transfer",
    "args": {
      "receiver_id": "merchant.near",
      "amount": "1000000",
      "memo": "x402 payment for resource"
    },
    "gas": "30000000000000",
    "deposit": "1"
  }
}
```

**Critical Security Note**: NEP-141 requires exactly 1 yoctoNEAR to be attached to `ft_transfer` calls. This prevents restricted access keys from calling transfer methods without wallet confirmation.


## `X-PAYMENT-RESPONSE` Header Payload

The `X-PAYMENT-RESPONSE` header is base64 encoded and returned to the client from the resource server.

Once decoded, the `X-PAYMENT-RESPONSE` is a JSON string with the following properties:

```json
{
  "success": true,
  "transaction": "DkHxB7qZ9P5vN3rL2wM8fQ4sJ6tK1yC3aR5nB9xE7mD2",
  "network": "near-mainnet",
  "relayer": "facilitator.near"
}
```


## Verification

Steps to verify a payment for the `exact` scheme on NEAR:

1. **Deserialize** the Borsh-encoded `SignedDelegateAction`
2. **Verify signature** using ED25519 against the `sender_id`'s public key
3. **Validate DelegateAction fields**:
   - `nonce` hasn't been used (query NEAR RPC for used nonces)
   - `max_block_height` hasn't been exceeded (check current block height)
   - `public_key` matches the sender's account access keys
4. **Inspect actions**:
   - Must contain exactly one `FunctionCall` action
   - `method_name` must be `"ft_transfer"`
   - `receiver_id` in args matches `payTo`
   - `amount` in args >= `maxAmountRequired`
   - `deposit` is exactly `"1"` (1 yoctoNEAR)
   - Contract ID matches expected FT contract
5. **Check sender balance**: Query `ft_balance_of` on the FT contract to ensure sufficient funds
6. **Simulate execution** (optional): Use NEAR RPC `call` method in view mode to test the transfer would succeed


## Settlement

Settlement is performed by the facilitator:

1. **Wrap SignedDelegateAction**: Create a NEAR transaction containing `Action::Delegate(signedDelegateAction)`
2. **Sign as relayer**: Sign the transaction with the facilitator's account key
3. **Submit transaction**: Send to NEAR RPC endpoint via `broadcast_tx_commit` or `broadcast_tx_async`
4. **Wait for confirmation**: Monitor transaction status until finalized
5. **Return settlement response**: Include transaction hash and status


## Security Considerations

### 1. Nonce Management
- The facilitator MUST track used nonces to prevent replay attacks
- NEAR protocol validates nonces on-chain, but verification should happen before settlement

### 2. Block Height Expiration
- `max_block_height` provides time-bound validity
- Clients should set this to current_block + reasonable_buffer (e.g., 100 blocks ≈ 100 seconds)

### 3. Signature Verification
- ED25519 signature verification is critical
- The `public_key` in `DelegateAction` must match an access key on `sender_id`'s account

### 4. Gas Estimation
- Facilitators must ensure sufficient gas for the `ft_transfer` call
- Typical gas: 30 TGas (30,000,000,000,000 gas units)

### 5. Storage Deposit
- NEP-141 requires accounts to be registered with the FT contract
- The `payTo` account MUST be registered before settlement
- Registration typically requires ~0.00125 NEAR storage deposit


## Differences from EVM/SVM Implementations

### vs. EVM (EIP-3009)
- NEAR uses `DelegateAction` instead of structured authorization parameters
- No domain separator or typed data hashing (uses Borsh serialization)
- Nonce management is per-transaction, not per-token-contract

### vs. SVM (Solana)
- NEAR requires fully-signed `DelegateAction` from client, not partially-signed transaction
- NEAR relayer wraps the `SignedDelegateAction` rather than adding a fee payer signature
- NEAR has explicit expiration via `max_block_height` vs Solana's blockhash expiration


## References

- [NEP-366: Meta Transactions](https://github.com/near/NEPs/pull/366)
- [NEP-141: Fungible Token Standard](https://nomicon.io/Standards/Tokens/FungibleToken/Core)
- [NEAR Protocol Documentation](https://docs.near.org/)
- [Building a Meta Transaction Relayer](https://docs.near.org/chain-abstraction/meta-transactions-relayer)
- [NEAR Transaction Specification](https://nomicon.io/RuntimeSpec/Transactions)
