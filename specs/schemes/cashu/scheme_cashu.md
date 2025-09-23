# cashu-token Scheme (Draft)

> **Status:** Experimental

The `cashu-token` scheme enables HTTP 402 resource servers to accept blinded
Cashu ecash tokens as payment for agentic workloads. The scheme composes the
x402 payment flow with a Cashu mint so that agents can present previously minted
proofs in exchange for access to a resource.

The goals are:

- support push-style settlement where the client supplies pre-minted proofs;
- keep the resource server stateless by delegating proof verification to a
  facilitator service that integrates with a Cashu mint;
- embed enough metadata in the payment to reconcile the spend and emit
  Agent Payments Protocol (AP2) Payment Mandates.

## Payment Requirements

```json5
{
  "scheme": "cashu-token",
  "network": "bitcoin-testnet",
  "resource": "https://merchant.example/api/report",
  "description": "Usage-based access to merchant report API",
  "mimeType": "application/json",
  "maxAmountRequired": "5000",          // milli-satoshis or satoshis depending on `unit`
  "maxTimeoutSeconds": 300,
  "payTo": "cashu:pubkey:nymmerchant",
  "asset": "SAT",                        // optional, informational
  "extra": {
    "mintUrl": "https://nofees.testnut.cashu.space/",
    "facilitatorUrl": "https://facilitator.example", // optional
    "keysetId": "keyset-2025-01",                     // optional preferred keyset
    "unit": "sat"                                      // optional, defaults to `sat`
  }
}
```

Key points:

- `network` identifies a logical Cashu domain. `bitcoin-mainnet` and
  `bitcoin-testnet` are provided out of the box, but additional values may be
  registered by deployments that manage their own facilitator network.
- `payTo` references the merchant destination. The recommended format is a
  `cashu:` URI that can be dereferenced by the facilitator to determine the
  merchant's wallet or blinded output parameters.
- `extra.mintUrl` is mandatory. It tells the client which mint issued the
  acceptable proofs.
- Implementations MAY default to `https://nofees.testnut.cashu.space/` for
  bitcoin-testnet and `https://mint.minibits.cash/Bitcoin` for bitcoin-mainnet
  if no custom mint catalog is provided.
- `extra.unit` defaults to `sat`. Implementations sending milli-satoshi proofs
  SHOULD set the unit explicitly to `msat`.

## Payment Payload

The client responds with an `X-PAYMENT` header whose decoded payload conforms to
this structure:

```json5
{
  "x402Version": 1,
  "scheme": "cashu-token",
  "network": "bitcoin-testnet",
  "payload": {
    "mint": "https://nofees.testnut.cashu.space/",     // MUST match requirements.extra.mintUrl
    "proofs": [
      {
        "amount": 2000,
        "secret": "...",
        "C": "...",
        "id": "keyset-2025-01"
      },
      {
        "amount": 3000,
        "secret": "...",
        "C": "...",
        "id": "keyset-2025-01"
      }
    ],
    "memo": "optional description",       // optional
    "keysetId": "keyset-2025-01",         // optional override
    "payer": "agent-ledger-id",           // optional, propagated to AP2 Payment Mandate
    "expiry": 1735689600                   // optional unix timestamp
  }
}
```

The facilitator verifies the proofs against the mint (checking spend status and
keyset validity), confirms that the summed `amount` field meets or exceeds the
required price, and finally melts or swaps the proofs on behalf of the merchant.

## Facilitator Expectations

The facilitator for this scheme SHOULD expose `/verify` and `/settle` endpoints
that:

1. call the Cashu mint's `/check` (or equivalent) endpoint to confirm the
   proofs are unspent;
2. ensure that the mint URL and optional keyset match the requirements;
3. optionally perform a swap so the merchant receives freshly blinded tokens;
4. return a deterministic receipt hash that the merchant can include in an AP2
   Payment Mandate.

If the facilitator cannot validate the proofs, it MUST return `isValid: false`
with one of the Cashu-specific error codes:
`invalid_cashu_payload_proofs`, `invalid_cashu_payload_amount_mismatch`, or
`invalid_cashu_payment_requirements_extra`.

## AP2 Integration Notes

- The Shopping Agent's Credentials Provider can map each Cashu mint to a
  `cashu-token` payment capability, allowing agents to surface available balances.
- Merchant Payment Processor Agents advertise support by including this scheme
  in their `PaymentRequirements`. Upon settlement, the facilitator receipt can be
  recorded inside the AP2 Payment Mandate so issuers can audit the push payment.
- User Agents SHOULD prompt the user before submitting proofs, as the spend is
  irreversible once the mint records the tokens as used.

This document will continue to evolve as the facilitator and merchant
implementations mature.
