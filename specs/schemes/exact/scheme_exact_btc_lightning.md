# Scheme: `exact` on `btc-lightning`

## Summary

The `exact` scheme on Bitcoin Lightning uses **Lightning invoices (BOLT11)** to receive a specific amount of BTC (in SATS) from the payer to the resource server.

The client pays a Lightning invoice off-chain, and the facilitator only **verifies** that the invoice has been paid with sufficient amount to the correct payee. The facilitator cannot move funds arbitrarily; it can only check the state of invoices that the client has chosen to pay.

This scheme is intended for:

- fixed-price, **pay-per-request** APIs
- simple **paywalls** for content or downloads
- small, real-time payments by humans or agents (from a few sats up to larger amounts per call, depending on channel liquidity and application design)

Supported Lightning networks are identified via `network`, for example:

- `btc-lightning-mainnet`
- `btc-lightning-signet`

---

## `X-PAYMENT` header payload

The `payload` field of the `X-PAYMENT` header for Lightning MUST contain:

- `bolt11`: The BOLT11 Lightning invoice string (e.g. `lnbc...`) that the client has paid or will pay.

It MAY also contain:

- `invoiceId`: An implementation-specific identifier (e.g. internal ID, payment hash, label) that allows the facilitator to look up the invoice more efficiently.

A minimal Lightning `payload` object:

```json
{
  "bolt11": "lnbc10u1pjexample..."
}
```

A richer `payload` with an additional backend reference:

```json
{
  "bolt11": "lnbc10u1pjexample...",
  "invoiceId": "abc123"
}
```

Full `X-PAYMENT` header (mainnet):

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "btc-lightning-mainnet",
  "payload": {
    "bolt11": "lnbc10u1pjexample...",
    "invoiceId": "abc123"
  }
}
```

Full `X-PAYMENT` header (testnet):

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "btc-lightning-signet",
  "payload": {
    "bolt11": "lnbc10u1pjexample...",
    "invoiceId": "abc123"
  }
}
```

### Relation to `PaymentRequirements`

For `exact` on Lightning, the `PaymentRequirements` object MUST include:

- `scheme`: `"exact"`
- `network`: e.g. `"btc-lightning-mainnet"` or `"btc-lightning-signet"`
- `maxAmountRequired`: required amount in **sats**, as a base-10 string (e.g. `"1000"`)
- `asset`: `"BTC"`
- `payTo`: Lightning payee identifier (e.g.: node pubkey, LNURL-pay, or another implementation-defined Lightning recipient identifier)
- `resource`, `description`, `mimeType`, `maxTimeoutSeconds`, `extra`: as per the core x402 spec

An example `paymentRequirements` entry for Lightning `exact`:

```json
{
  "scheme": "exact",
  "network": "btc-lightning-mainnet",
  "maxAmountRequired": "1000",
  "asset": "BTC",
  "payTo": "lnurl1dp68gurn8ghj7cts...",
  "resource": "https://api.example.com/premium-data",
  "description": "Access to premium market data",
  "mimeType": "application/json",
  "outputSchema": null,
  "maxTimeoutSeconds": 60,
  "extra": {
    "unit": "sats",
    "expirySeconds": 300
  }
}
```

A typical client flow is:

1. Receive `PaymentRequirementsResponse` with a Lightning `accepts` entry.
2. Ask a Lightning-aware wallet, facilitator, or backend to **create a BOLT11 invoice** that matches these requirements (amount, destination, expiry, etc.).
3. Pay that invoice with its Lightning wallet.
4. Send the `X-PAYMENT` header containing the `bolt11` invoice (and optionally `invoiceId`) that the facilitator can use to verify payment.

---

## Verification

Facilitators implementing `exact` on Lightning SHOULD perform the following steps when verifying a payment:

1. **Basic checks**

   - Decode the `X-PAYMENT` header.
   - Verify `x402Version` is supported.
   - Verify `scheme is "exact"`.
   - Verify `network` matches `paymentRequirements.network`.

2. **PaymentRequirements validation**

   - Validate that `paymentRequirements.maxAmountRequired` is a non-negative base-10 integer string (satoshis).
   - Validate that `paymentRequirements.asset is "BTC"`.
   - Validate that `paymentRequirements.payTo` is a syntactically valid Lightning recipient identifier for the given network.

3. **Invoice parsing and lookup**

   - Parse the `payload.bolt11` invoice string according to the BOLT11 specification.
   - Confirm that the invoice is for the expected network (e.g. mainnet vs signet/testnet).
   - Optionally, use `payload.invoiceId` to perform an efficient backend lookup (e.g. by internal ID, payment hash, or label) if supported by the Lightning backend.

4. **Static invoice checks**

   - Confirm that the invoice payee matches or is compatible with `paymentRequirements.payTo` (according to the implementation’s model of destination identity).
   - Confirm that the invoice amount (if fixed amount invoice is used) is **greater than or equal to** `paymentRequirements.maxAmountRequired` (in sats).
   - Confirm that the invoice has not expired according to its encoded expiry and/or `extra.expirySeconds`.

5. **Payment state checks**

   - Query the Lightning backend (node or wallet) to determine whether the `bolt11` invoice has been **paid**.
   - Confirm that the amount received is **greater than or equal to** `paymentRequirements.maxAmountRequired` (in sats).
   - Implementations MAY enforce additional rules, e.g.:
     - binding the invoice to a particular `resource`
     - preventing reuse of the same invoice for unrelated requests

6. **Error mapping**
   - If any check fails, the facilitator MUST return `isValid: false` and an appropriate `invalidReason`, using the standard x402 error codes where applicable:
     - `insufficient_funds`
     - `invalid_payment_requirements`
     - `invalid_network`
     - `invalid_scheme`
     - `invalid_exact_lightning_payload` (or similar, implementation-defined)
     - ect...

On success, the facilitator SHOULD return `isValid: true` and, if available, a `payer` identifier (e.g. a Lightning node pubkey) in the verification response.

---

## Settlement

On Lightning, **settlement occurs when the invoice is paid**. In many implementations, verification and settlement are effectively the same event. However, the `/settle` endpoint MUST still conform to the core x402 specification.

A typical flow for `exact` on Lightning:

1. **Re-validation**  
   `/settle` MUST either:

   - re-run the verification logic described above, or
   - use cached verification state that is cryptographically or operationally equivalent in safety.

2. **Mark invoice as consumed (optional but recommended)**  
   Implementations MAY mark the invoice as “consumed” for the specific resource or request, to prevent inadvertent reuse if the business logic requires one-time payment semantics.

3. **Return `SettlementResponse`**  
   On success:

   ```json
   {
     "success": true,
     "errorReason": null,
     "transaction": "inv_abc123",
     "network": "btc-lightning-mainnet",
     "payer": "03abcd...nodepubkey"
   }
   ```

   - `transaction` SHOULD be a stable reference to the Lightning payment (e.g. payment hash, invoice ID, or an internal identifier).
   - `network` MUST match the Lightning network used.
   - `payer` SHOULD be populated if a payer identifier is available.

   On failure:

   ```json
   {
     "success": false,
     "errorReason": "insufficient_funds",
     "transaction": "",
     "network": "btc-lightning-mainnet",
     "payer": "03abcd...nodepubkey"
   }
   ```

Resource servers MUST treat `success: false` as a payment failure, and MAY respond with `402 Payment Required` plus a fresh `PaymentRequirementsResponse`.

---

## Appendix

There are key differences between the EVM `exact` scheme and the Lightning `exact` scheme:

### Properties

**EVM (`EIP-3009` / `transferWithAuthorization`):**

- Client signs a **specific-amount** transfer authorization.
- Facilitator constructs and broadcasts the on-chain transaction.
- Gas is paid by the facilitator; client and server can remain “gasless”.
- Great for on-chain receipts and on-chain auditability.

**Lightning (BOLT11-based payments):**

- Client pays a **specific-amount Lightning invoice**, identified primarily by its `bolt11` string.
- Facilitator cannot move funds; it only verifies the state of invoices via a Lightning backend.
- Extremely fast, low-fee, well-suited for **micropayments** and high-frequency calls.
- No on-chain transaction per payment; settlement is off-chain from the perspective of the base layer.

### Pros

- Very low latency and fees for small and medium-sized payments.
- No need for client or resource server to manage private keys for on-chain tokens.
- Naturally fits human and agent use cases where payments are frequent, small, and interactive.
- Backend-agnostic: works with LND, Core Lightning, LNbits, custodial wallets, ect..., as long as they can verify payments for a given `bolt11`.

### Cons

- Invoices and payment state live off-chain, so auditability depends on the Lightning backend and its logs rather than the base Bitcoin chain.
- Requires Lightning-capable infrastructure (e.g.: node, wallet) on both client/facilitator side and payee side.
- Advanced features like usage-based billing or streaming payments would require additional scheme design (similar to `upto` on EVM).

Future extensions MAY add:

- enriched payloads (e.g., inclusion of payment preimages), and
- additional schemes (`upto`, streaming payments, etc.) for Lightning,

while preserving the trust-minimizing property that the facilitator cannot redirect client funds arbitrarily.
