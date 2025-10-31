# Scheme: `channel` — Rooch binding

**Status**: Reference implementation validated on Rooch testnet.

**Integration context**: This binding demonstrates how the x402 `channel` scheme maps to an existing, validated payment channel implementation on Rooch. The focus is on x402 integration points—showing how Rooch's payment channels align with the protocol—rather than teaching implementation from scratch.

**Prerequisites**: Read `./scheme_channel.md` for core protocol concepts (channel, sub-channel, epoch, receipt, proposal, delta). This document focuses on Rooch-specific mappings and technical details.

**Reference implementations**:
- Contracts (Move): [rooch-framework/sources/payment_channel.move](https://github.com/rooch-network/rooch/blob/main/frameworks/rooch-framework/sources/payment_channel.move)
- SDK (TypeScript): [nuwa-kit/typescript/packages/payment-kit](https://github.com/nuwa-protocol/nuwa/tree/main/nuwa-kit/typescript/packages/payment-kit)

## Network slugs
- `rooch-mainnet`
- `rooch-testnet`
- `rooch-devnet`

## Rooch-specific technical points

1. **DID-based identity**: Uses `did:rooch` with verification method fragments for multi-device/session support
2. **BCS encoding**: SubRAV struct serialized with BCS for on-chain signature verification
3. **Move generics**: Channels bound to asset type via `<CoinType>` parameter for type safety
4. **In-band domain separation**: `chainId` included in signed SubRAV (vs EVM's EIP-712 domain)
5. **Dual operation mode**: Supports both client-initiated (direct blockchain) and facilitator-proxied (x402 aligned) workflows
6. **On-chain authorization**: Sub-channel verification methods can be authorized with key material snapshots for enhanced security

## Identity and signatures

### payerId format

The `payerId` field is a DID identifier of the payer (controller address). Fragments are not included in `payerId`; the verification method is selected by `subChannelId`.

```json
{ "payerId": "did:rooch:0x123abc..." }
```

- `did:rooch:0x123abc...`: identifies the DID controller (Rooch account address)

### Resolution and authorization

- Resolution: resolve `did:rooch` → DID Document; select a `verificationMethod` by `subChannelId` (fragment string without `#`).
- Authorization model:
  - Sub-channel is explicitly authorized on-chain by the payer via `authorize_sub_channel(channel_id, vm_id_fragment)`.
  - The contract snapshots the VM metadata (public key multibase + method type) to prevent off-chain removal bypass.
  - The payer MUST have an on-chain DID document to open a channel.
  - The referenced verification method MUST have the `authentication` relationship in the DID Document.
  - Only the channel sender can authorize verification methods; each `vm_id_fragment` can be authorized once per channel.
  - Key rotation: authorize a new `vm_id_fragment` and start using it for new receipts.
- Signature: payer signs a SubRAV (see below). On-chain verification uses the stored VM metadata and `did::verify_signature_by_type`.

### Receipt canonicalization and encoding
- Transport: JSON for `X-PAYMENT` payload.
- Settlement: BCS encoding of the Move `SubRAV` struct prior to signature verification on-chain.

#### Complete field mapping (Move SubRAV ↔ JSON Transport)

The following table shows the complete mapping between Move struct fields (used for on-chain verification) and JSON transport fields (used in `X-PAYMENT` header):

| JSON Field (Transport) | JSON Type | Move Field (SubRAV) | Move Type | Notes |
|------------------------|-----------|---------------------|-----------|-------|
| `version` | number | `version` | u8 | ✅ Names match |
| `chainId` | number\|string | `chain_id` | u64 | JSON camelCase → Move snake_case; **Required** for Rooch (in-band domain separation) |
| `channelId` | string (hex) | `channel_id` | ObjectID | JSON camelCase → Move snake_case; Hex-encoded ObjectID |
| `epoch` | number\|string | `channel_epoch` | u64 | Field name differs: `epoch` (JSON) → `channel_epoch` (Move) |
| `subChannelId` | string | `vm_id_fragment` | String | Field name differs completely |
| `accumulatedAmount` | string (decimal) | `accumulated_amount` | u256 | JSON camelCase → Move snake_case; Decimal string to handle u256 safely |
| `nonce` | number\|string | `nonce` | u64 | ✅ Names match; Monotonic per sub-channel |

Note: `subChannelId` MUST equal the DID verification method fragment without the leading `#` (e.g., `#key-1` → `key-1`).

#### Fields NOT in SubRAV (handled separately)

The following fields appear in the JSON transport but are NOT part of the SubRAV struct that gets signed:

| JSON Field (Transport) | Purpose | Where it's used |
|------------------------|---------|-----------------|
| `payerId` | Payer DID identifier (no fragment) | Used to resolve the DID Document; VM selected by `subChannelId` |
| `payeeId` | Payee DID or address | Compared against channel's `receiver` field during verification |
| `payerSignature` | Hex-encoded signature bytes | Verified against BCS-encoded SubRAV using the resolved key |

#### BCS encoding

SubRAV is serialized using BCS for on-chain signature verification. The signature is computed over BCS bytes of the Move struct fields (including `chainId` for in-band domain separation). See reference SDK for encoding implementation details.

## Units and assets
- `asset`: Rooch asset type identifier (e.g., `0x3::gas_coin::RGas`).
- Amounts are expressed in the asset's base units (atomic units).

### Asset binding (Rooch-specific)

Rooch channels are **strongly bound to a single asset type** via the generic parameter `<CoinType>`:

- `open_channel<CoinType>(sender, receiver)` creates a channel for that specific `CoinType`
- The `coin_type` is part of the `ChannelKey`: `{ sender, receiver, coin_type }`
- `channel_id = object::custom_object_id<ChannelKey, PaymentChannel>(key)`
- **SubRAV does NOT include `coin_type` field** because it is implicitly bound to `channel_id`
- To pay with different assets, open separate channels for each asset type

This design provides:
- **Type safety** at the Move VM level (leveraging Move's generics)
- **Smaller SubRAV structures** (no redundant asset field, reducing signature size)
- **Simpler verification logic** (asset validated via `channel_id` lookup from channel state)
- **Prevention of asset confusion** (each `channel_id` uniquely represents one asset type)

### Channel ID derivation

The `channelId` is **deterministically derived** from the `(payer, payee, asset)` tuple using Rooch's custom object ID mechanism:

```move
struct ChannelKey has copy, drop, store {
    sender: address,
    receiver: address,
    coin_type: String,
}

channel_id = object::custom_object_id<ChannelKey, PaymentChannel<CoinType>>(
    ChannelKey { sender, receiver, coin_type }
)
```

- **Deterministic**: Given the same `(payer, payee, asset)` tuple, the `channelId` is always the same.
- **Unique**: Each `(payer, payee, asset)` combination maps to a unique `channelId`.
- **Asset-bound**: The `coin_type` is part of the derivation, ensuring asset type safety.

Client implementations SHOULD use the binding-specific derivation logic to compute `channelId` before constructing receipts. For Rooch TypeScript SDK, see the reference implementation in `nuwa-kit/typescript/packages/payment-kit`.

## Lifecycle and x402 integration

**Protocol flow**: See `scheme_channel.md` §2 for the overall postpaid request/response cycle and Appendix D for detailed interaction flows.

### Integration modes

Rooch payment channels support both **client-initiated** and **facilitator-proxied** operation modes. For x402 integration, the facilitator-proxied mode is recommended:

**Facilitator-proxied mode** (x402 aligned):

1. **Hub setup** (one-time):
   - Facilitator calls `create_payment_hub()` for the payer
   - Payer deposits via facilitator: `deposit_to_hub_entry<CoinType>(amount)`
   
2. **Lazy channel open** (first request):
   - Protocol: see `scheme_channel.md` §2 "How it works"
   - Rooch: facilitator calls `apply_receipt()` with (epoch=0, nonce=0, amount=0)
   - Contract creates channel if not exists; no settlement (delta=0)
   
3. **Sub-channel authorization** (optional, can be done multiple ways):
   - During setup: pre-authorize verification methods
   - With lazy open: authorize when creating channel
   - Before first settlement: authorize before first receipt with delta>0
   - Facilitator calls `authorize_sub_channel(channel_id, vm_id_fragment)`
   - Snapshots VM metadata (pk_multibase, method_type) on-chain
   - Each device/session/app needs separate authorization for independent key management
   
4. **Settlement** (subsequent requests):
   - Protocol: see `scheme_channel.md` Appendix D "Regular N/N+1 cycle"
   - Rooch: facilitator calls `apply_receipt()` with SubRAV + signature
   - Contract enforces: authorized sub-channel (if delta>0), strict monotonicity, withdraws from hub
   
5. **All operations**: Facilitator pays gas fees; client only signs receipts

**Client-initiated mode** (direct blockchain access):
- Client directly calls contract functions and pays gas fees
- Not covered in x402 integration scenarios
- Documented in reference contract and SDK

**Channel closure**: Channels can be closed by either party (via facilitator in x402 mode). Upon closure, epoch increments; reopening resets state with new epoch.

## Implementation notes

**Protocol**: See `scheme_channel.md` for verification steps (Appendix B) and settlement specification (Appendix C).

**Rooch-specific verification**:
1. **BCS encoding**: Serialize SubRAV struct (Move field order) before signature verification
2. **Identity resolution**: 
   - Resolve `payerId` (did:rooch) → DID Document
   - Select verification method by `subChannelId` (fragment without `#`)
   - For delta>0 receipts: verify sub-channel is authorized on-chain (optional but recommended)
3. **Field mapping**: JSON camelCase → Move snake_case (see Field Mapping table above)
   - `subChannelId` (JSON) → `vm_id_fragment` (Move)
   - `epoch` (JSON) → `channel_epoch` (Move)
4. **In-band domain separation**: `chainId` included in SubRAV for signature scope
5. **Asset binding**: Asset type implicitly bound to `channelId` via `<CoinType>` generic

## Facilitator interface examples

**Request/response shape**: Follows x402 core specification. See `scheme_channel.md` §4 for the general structure.

### POST /verify (channel / Rooch)

Rooch-specific example with DID-based `payerId` and complete field mapping:

Request
```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "channel",
    "network": "rooch-testnet",
    "payload": {
      "version": 1,
      "payerId": "did:rooch:0x123...",
      "clientTxRef": "c-20251027-0001",
      "receipt": {
        "chainId": "3",
        "channelId": "0xabc123...",
        "epoch": 3,
        "subChannelId": "key-1",
        "accumulatedAmount": "1234567890",
        "nonce": 42,
        "payeeId": "did:rooch:0xdef...",
        "payerSignature": "0x..."
      }
    }
  },
  "paymentRequirements": {
    "scheme": "channel",
    "network": "rooch-testnet",
    "maxAmountRequired": "1000000000",
    "resource": "https://api.example.com/llm/stream",
    "payTo": "0x<service_address>",
    "asset": "0x3::gas_coin::RGas"
  }
}
```