---
'@x402/svm': patch
---

Fixed SVM `upto` facilitator behavior found while building the Go implementation, so the two
SDKs stay interoperable:

- Channel account reads now use the `confirmed` commitment instead of the RPC default
  (`finalized`), which lags a freshly broadcast open by seconds and could report a live channel
  as missing on the next request.
- Rent cleanup no longer stops scanning records when the per-run close cap is reached, so a
  backlog of closable channels cannot starve reclaims of channels that are ready to return rent.
- Rent cleanup passes are serialized, so an operator calling `cleanup()` cannot race the
  interval loop into submitting the same close or reclaim twice.
- Rent cleanup reports an unrecognized channel status through `onError` instead of silently
  leaving the record in storage forever.
- `extra.tokenProgram` is validated as one of the two supported SPL token programs, and an
  unusable `extra.memo`, `feePayer`, `receiverAuthorizer`, `requirements.asset`, or `payload.from`
  is rejected as a payment-requirements/payer failure rather than an opaque open-transaction
  mismatch. The client applies the same validation as the facilitator, so a broken challenge
  fails naming the field instead of after a round trip.
- Rent cleanup reports every channel in a reclaim batch that failed to broadcast, instead of
  only the first, so an operator watching `onError` sees the whole stuck batch.
- `getStablecoinTokenProgram` falls back to SPL Token for a stablecoin symbol registered without
  a token program, instead of returning `undefined`.
- A non-string `extra.memo` is treated as absent rather than coerced into memo data.
- `validateSvmAddress` now also requires the base58 to decode to 32 bytes. The charset/length
  regex alone accepted strings that no Solana runtime would, which reported a malformed address
  as an open-transaction mismatch instead of naming the bad field.
