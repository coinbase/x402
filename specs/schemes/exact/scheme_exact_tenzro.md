# Scheme: `exact` on Tenzro

## Summary

The `exact` scheme on Tenzro transfers a fixed amount of an asset to a recipient on the Tenzro Network L1. A single Tenzro chain hosts three execution-layer façades over shared state (EVM, SVM, and Canton/DAML), and `exact` reuses the existing per-VM mechanisms unchanged. Network selection picks a façade; settlement happens against the same underlying balance.

The Tenzro chain is identified by a single CAIP-2 reference (the genesis-hash prefix) regardless of which façade a payment uses; see the [CAIP-2 profile](https://github.com/ChainAgnostic/namespaces/pull/184) for the registration.

## `X-Payment` header payload

The payload shape is determined by the façade selected via `network`:

| Façade | `network` | Payload | Mechanism |
| :----- | :-------- | :------ | :-------- |
| EVM | `tenzro:<genesis-prefix>` with `extra.facade: "evm"` | As in [`scheme_exact_evm.md`](scheme_exact_evm.md) | EIP-3009, Permit2, or ERC-7710 |
| SVM | `tenzro:<genesis-prefix>` with `extra.facade: "svm"` | As in [`scheme_exact_svm.md`](scheme_exact_svm.md) | SPL TransferChecked (9-decimal precision) |
| Canton/DAML | `tenzro:<genesis-prefix>` with `extra.facade: "canton"` | See [Canton payload](#canton-payload) below | CIP-56 holding transfer |

The CAIP-2 reference for Tenzro testnet is `tenzro:92bd27db9713293097f0e63476e3911e`. EVM tooling may also retrieve the integer chain id via `eth_chainId` (returns `1337` on testnet), but that integer is **not** the CAIP-2 reference.

### EVM façade

Identical to [`scheme_exact_evm.md`](scheme_exact_evm.md) with `network` set to the Tenzro CAIP-2 reference. EIP-3009 is the recommended path; assets that support it on Tenzro testnet include the wTNZO ERC-20 pointer and bridged USDC. Permit2 and ERC-7710 follow the upstream EVM rules unchanged.

### SVM façade

Identical to [`scheme_exact_svm.md`](scheme_exact_svm.md) with two notes:

1. SPL Token instructions on Tenzro are mapped to the unified token registry shared across façades. SPL amounts are 9-decimal values; the registry truncates to the underlying token's stored precision before the transfer is committed to shared state.
2. The Lighthouse and SPL Memo program addresses are the same as on Solana mainnet. The fee-payer safety rules and instruction-layout MUST checks in the upstream SVM spec apply unchanged.

### Canton payload

```json
{
  "x402Version": 2,
  "accepted": {
    "scheme": "exact",
    "network": "tenzro:92bd27db9713293097f0e63476e3911e",
    "amount": "1000",
    "asset": "USDC",
    "payTo": "Bob::1220abc...",
    "maxTimeoutSeconds": 60,
    "extra": {
      "facade": "canton",
      "templateId": "Tenzro.Token.Cip56:Holding",
      "instrument": "USDC@tenzro-domain"
    }
  },
  "payload": {
    "transaction": "<base64-encoded DAML command submission>"
  }
}
```

- `payTo` is a Canton party identifier (`name::fingerprint`).
- `extra.templateId` is the CIP-56 holding template the transfer targets.
- `extra.instrument` is the qualified instrument id on the Canton domain.
- `payload.transaction` is a base64-encoded DAML command submission proposing a CIP-56 two-step transfer (`create` step). The facilitator countersigns and submits via the Canton JSON Ledger API.

## Verification

The verifier reads `accepted.extra.facade` and dispatches:

- `evm` → upstream EVM verification rules ([`scheme_exact_evm.md`](scheme_exact_evm.md), Phase 2/3 per asset transfer method).
- `svm` → upstream SVM verification rules ([`scheme_exact_svm.md`](scheme_exact_svm.md), MUST checks 1–6).
- `canton` → Canton verification rules below.

The verifier MUST reject payloads where the `network` reference does not match a known Tenzro chain, regardless of whether `chain_id` (1337) appears compatible with EVM tooling.

### Canton verification (MUST)

The facilitator MUST:

1. Decode `payload.transaction` and parse the DAML command submission.
2. Verify the command targets `extra.templateId` and contains exactly one `create` of a CIP-56 holding proposal directed at `payTo`.
3. Verify the proposed holding `amount` equals `accepted.amount` and the instrument equals `extra.instrument`.
4. Verify the submitting party controls the source holding sufficient to cover `amount`, by querying the Canton JSON Ledger API for active CIP-56 contracts under that party.
5. Verify the submission's `commandId` has not been seen before (replay defence; see [Security](#security)).

The facilitator MUST NOT relax these checks on the basis that the EVM or SVM façade reads the same shared state. Canton-side authorization is enforced through DAML signatories and is independent of the other façades.

## Settlement

- **EVM:** as in upstream EVM scheme; the facilitator broadcasts the `transferWithAuthorization` / Permit2 / ERC-7710 transaction to the Tenzro JSON-RPC endpoint.
- **SVM:** as in upstream SVM scheme; the facilitator countersigns the partially-signed transaction as fee payer and submits via the Tenzro RPC `sendTransaction` route.
- **Canton:** the facilitator countersigns the DAML command submission and submits it to the Canton JSON Ledger API. On confirmation it returns the `transactionId` as the settlement receipt.

A successful settlement on any façade is final on the underlying Tenzro chain. There is no per-façade ledger; the same balance change is observable to readers of any façade after the block containing the transaction is finalized.

### `SettlementResponse`

```json
{
  "success": true,
  "transaction": "<facade-specific id>",
  "network": "tenzro:92bd27db9713293097f0e63476e3911e",
  "payer": "<facade-specific identifier>"
}
```

- EVM: `transaction` is a `0x`-prefixed transaction hash; `payer` is a `0x`-prefixed address.
- SVM: `transaction` is a base58 transaction signature; `payer` is a base58 public key.
- Canton: `transaction` is the Canton `transactionId`; `payer` is the source party identifier.

## Security

- **Replay.** EVM follows the EIP-3009 / Permit2 / ERC-7710 nonce / `validBefore` rules. SVM relies on the blockhash + Memo deduplication described in the upstream SVM spec. Canton settlements MUST be deduplicated by `commandId` for at least 120 seconds; the facilitator SHOULD also reject duplicate `payload.transaction` submissions in a short-term cache.
- **Cross-façade replay.** A signed payload on one façade MUST NOT settle on another. The verifier enforces this by binding signatures to façade-native preimages (EIP-712 typed data on EVM, the SVM transaction message on SVM, the DAML submission hash on Canton).
- **Authorization scope.** The facilitator on the EVM and SVM façades cannot redirect funds; the destination is bound by the signed authorization. On Canton, the destination is bound by the DAML signatory ruleset on the CIP-56 template.

## Appendix

### Tenzro endpoints

- JSON-RPC: `https://rpc.tenzro.network` (chain_id `1337`, CAIP-2 `tenzro:92bd27db9713293097f0e63476e3911e`).
- Facilitator: under discussion; once deployed, the canonical address will be added here.

### References

- [CAIP-2 Tenzro namespace registration (PR #184)](https://github.com/ChainAgnostic/namespaces/pull/184)
- [Tenzro Network repository](https://github.com/tenzro/tenzro-network)
- [CIP-56 (Canton holdings)](https://github.com/canton-network/cips)
