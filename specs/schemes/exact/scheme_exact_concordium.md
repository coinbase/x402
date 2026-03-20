# Exact Payment Scheme for Concordium (`exact`)

This document specifies the `exact` payment scheme for the x402 protocol on Concordium.

This scheme facilitates payments of a specific amount of CCD or CIS-2 tokens (e.g., PLT) on the Concordium blockchain using sponsored transactions (V1).

## Scheme Name

`exact`

## Protocol Flow

The protocol flow for `exact` on Concordium is client-driven with facilitator sponsorship.

1.  **Client** makes a request to a **Resource Server**.
2.  **Resource Server** responds with a payment required signal containing `PaymentRequired`. The `extra` field in the requirements contains a **sponsorAddress** which is the account address of the identity that will sponsor (pay gas for) the transaction. This is the facilitator.
3.  **Client** fetches its own account nonce from the Concordium network.
4.  **Client** constructs a sponsored transaction containing a transfer to the resource server's wallet address for the specified amount, with the facilitator set as the sponsor.
5.  **Client** signs the transaction with their wallet (sender signature only). The sponsor signature slot remains empty.
6.  **Client** serializes the signed transaction to JSON.
7.  **Client** sends a new request to the resource server with the `PaymentPayload` containing the serialized partially-signed transaction.
8.  **Resource Server** receives the request and forwards the `PaymentPayload` and `PaymentRequirements` to a **Facilitator Server's** `/verify` endpoint.
9.  **Facilitator** deserializes the transaction and inspects it to ensure it is valid and contains the expected payment parameters.
10. **Facilitator** returns a `VerifyResponse` to the **Resource Server**.
11. **Resource Server**, upon successful verification, forwards the payload to the facilitator's `/settle` endpoint.
12. **Facilitator Server** adds its sponsor signature and submits the now fully-signed transaction to the Concordium network.
13. **Facilitator Server** waits for ConcordiumBFT finalization (~10 seconds deterministic finality).
14. Upon successful on-chain settlement, the **Facilitator Server** responds with a `SettlementResponse` to the **Resource Server**.
15. **Resource Server** grants the **Client** access to the resource in its response.

## `PaymentRequirements` for `exact`

In addition to the standard x402 `PaymentRequirements` fields, the `exact` scheme on Concordium requires the following inside the `extra` field:

```json
{
  "scheme": "exact",
  "network": "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
  "amount": "1000000",
  "asset": "",
  "payTo": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
  "maxTimeoutSeconds": 60,
  "extra": {
    "sponsorAddress": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW"
  }
}
```

- `asset`: Empty string `""` for native CCD, or the token name (e.g., `"EURR"`) for PLT/CIS-2 tokens.
- `extra.sponsorAddress`: The account address of the facilitator that will sponsor the transaction fees.

### Network Identifiers

Concordium uses CAIP-2 format with the `ccd` namespace:

| Network | CAIP-2 Identifier |
|---------|-------------------|
| Mainnet | `ccd:9dd9ca4d19e9393877d2c44b70f89acb` |
| Testnet | `ccd:4221332d34e1694168c2a0c0b3fd0f27` |

### Asset Format

| Asset Type | Format       | Example  |
|------------|--------------|----------|
| Native CCD | Empty string | `""`     |
| PLT Token  | Token name   | `"EURR"` |

### Amount Format

All amounts are expressed in the smallest unit (atomic):

| Asset Type | Unit | Decimals | Example: 10 CCD / 5 EURR |
|------------|------|----------|---------------------------|
| Native CCD | microCCD | 6 | `"10000000"` |
| PLT Token | Smallest subunit | 6 | `"5000000"` |

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` contains:

```json
{
  "signedTransaction": { ... },
  "sender": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN"
}
```

- `signedTransaction`: The JSON-serialized `Transaction.SignableV1` object, containing the sender's signature but with an empty sponsor signature slot.
- `sender`: The sender's Concordium account address (base58).

The `signedTransaction` is a V1 transaction with:
- `signatures.sender` populated (client's signature)
- `signatures.sponsor` empty (facilitator adds during settlement)

Full `PaymentPayload` object (native CCD):

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
    "network": "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
    "amount": "1000000",
    "asset": "",
    "payTo": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
    "maxTimeoutSeconds": 60,
    "extra": {
      "sponsorAddress": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW"
    }
  },
  "payload": {
    "signedTransaction": {
      "version": 1,
      "header": {
        "sender": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN",
        "nonce": 42,
        "expiry": 1700000300,
        "numSignatures": 1,
        "sponsor": {
          "address": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
          "numSignatures": 1
        }
      },
      "payload": { "...": "CCD simple transfer payload" },
      "signatures": {
        "sender": { "0": { "0": "a1b2c3..." } },
        "sponsor": {}
      }
    },
    "sender": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN"
  }
}
```

Full `PaymentPayload` object (PLT token — EURR):

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
    "network": "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
    "amount": "5000000",
    "asset": "EURR",
    "payTo": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
    "maxTimeoutSeconds": 60,
    "extra": {
      "sponsorAddress": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW"
    }
  },
  "payload": {
    "signedTransaction": {
      "version": 1,
      "header": {
        "sender": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN",
        "nonce": 42,
        "expiry": 1700000300,
        "numSignatures": 1,
        "sponsor": {
          "address": "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
          "numSignatures": 1
        }
      },
      "payload": { "...": "PLT token update payload" },
      "signatures": {
        "sender": { "0": { "0": "d4e5f6..." } },
        "sponsor": {}
      }
    },
    "sender": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN"
  }
}
```

## `SettlementResponse`

The `SettlementResponse` for the exact scheme on Concordium:

```json
{
  "success": true,
  "transaction": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
  "network": "ccd:9dd9ca4d19e9393877d2c44b70f89acb",
  "payer": "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN"
}
```

## Facilitator Verification Rules (MUST)

A facilitator verifying an `exact`-scheme Concordium payment MUST enforce all of the following checks before sponsoring and broadcasting the transaction:

1. Transaction version

- The transaction MUST be version `1` (V1 sponsored transaction format).
- The transaction MUST deserialize successfully via `Transaction.signableFromJSON()`.

2. Sender identity

- `transaction.header.sender` MUST match `payload.sender`.
- `payload.sender` MUST be a valid Concordium account address (base58).

3. Sponsor identity

- `transaction.header.sponsor.address` MUST match the facilitator's own sponsor address.
- The facilitator MUST NOT sponsor transactions that name a different sponsor.

4. Transfer destination

- For native CCD (`asset` is `""`): the `toAddress` in the simple transfer payload MUST equal `PaymentRequirements.payTo`.
- For PLT tokens: the `recipient` in the token update operations MUST equal `PaymentRequirements.payTo`.

5. Amount

- For native CCD: the transfer `amount` MUST be ≥ `PaymentRequirements.amount` (in microCCD).
- For PLT tokens: the transfer `amount` MUST be ≥ `PaymentRequirements.amount` (in smallest token units).

6. Asset

- For native CCD: the transaction MUST be a `SimpleTransfer` or `SimpleTransferWithMemo` type.
- For PLT tokens: the transaction MUST be a `TokenUpdate` type, and the `tokenId` MUST correspond to `PaymentRequirements.asset`.

7. Transaction expiry

- `transaction.header.expiry` MUST be in the future.
- The expiry SHOULD NOT exceed 10 minutes from the current time.

8. Sender signature

- `transaction.signatures.sender` MUST contain at least one credential signature.
- The sender signature SHOULD be verified cryptographically against the sender's on-chain account credentials using `Transaction.Signable.verifySignature()`.

9. Transaction payload safety

- The transaction MUST contain exactly one transfer operation (no bundled or unexpected operations).
- The facilitator's sponsor address MUST NOT appear as the sender, recipient, or authority of the transfer.

These checks are security-critical to ensure the sponsor cannot be tricked into paying gas for unintended transactions. Implementations MAY introduce stricter limits (e.g., shorter expiry caps, mandatory cryptographic signature verification) but MUST NOT relax the above constraints.