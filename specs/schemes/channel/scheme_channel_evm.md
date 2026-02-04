# Scheme: `channel` — EVM binding (experimental proposal)

**Status**: Early-stage proposal; no production implementation or testing yet. This document is intended to spark discussion and gather feedback from EVM developers.

**Purpose**: Outline how the chain-agnostic `channel` scheme could map to EVM chains using EIP-712 signatures and smart contract settlement. The goal is to enable EVM developers to understand the approach and explore feasibility, not to provide a complete implementation guide.

**Prerequisites**: Read `./scheme_channel.md` first for the core protocol concepts (channel, sub-channel, epoch, receipt, proposal, delta). This document focuses on EVM-specific mappings.

## Network slugs (examples)
- `base`, `base-sepolia`
- `avalanche`, `avalanche-fuji`
- `ethereum-mainnet`, `sepolia`

## EVM-specific design points

1. **EIP-712 signatures**: Payers sign receipts using EIP-712 (typed structured data), supporting both EOA and contract wallets (EIP-1271).
2. **Lazy channel initialization**: First receipt with `(epoch=0, nonce=0, amount=0)` triggers on-chain channel creation via facilitator (see flow below).
3. **Pooled collateral (Hub)**: A shared payment hub holds ERC20 balances per payer; settlement contracts pull deltas from the hub when claiming receipts.
4. **Asset binding via channelId**: `channelId = keccak256(payer, payee, asset)` ensures the asset type is implicitly bound to channel identity.

## Field name mapping

**Good news**: Since both JSON transport and EIP-712 use camelCase, field name mapping is greatly simplified!

| JSON Field (Transport) | JSON Type | EIP-712 Field (On-chain) | EIP-712 Type | Notes |
|------------------------|-----------|--------------------------|--------------|-------|
| `channelId` | string (hex) | `channelId` | bytes32 | ✅ Names match! Parse hex string to bytes32 |
| `epoch` | number\|string | `epoch` | uint256 | ✅ Names match! Parse to uint256 |
| `subChannelId` | string (hex) | `subChannelId` | bytes32 | ✅ Names match! 32-byte identifier (e.g., keccak256 of device ID) |
| `accumulatedAmount` | string (decimal) | `accumulatedAmount` | uint256 | ✅ Names match! Parse decimal string to uint256 |
| `nonce` | number\|string | `nonce` | uint256 | ✅ Names match! Parse to uint256 |
| `payeeId` | string (address) | `payee` | address | ⚠️ Field name differs: `payeeId` (JSON) → `payee` (EIP-712) |

Additional notes:
- **chainId**: Not included in receipt (provided by EIP-712 domain separator as `chainId`)
- **asset**: Not included in receipt (implicitly bound to `channelId`)
- **payerSignature**: EIP-712 signature bytes (0x-prefixed hex string in transport, bytes in verification)

## Identity and signatures

### payerId format

The `payerId` identifies the payer. EVM implementations should support:

**EOA (required)**:
```json
{ "payerId": "0x857b06519E91e3A54538791bDbb0E22373e36b66" }
```
Verify using `ecrecover` from the EIP-712 signature.

**Contract wallet / EIP-1271 (required)**:
```json
{ "payerId": "0x1234...5678" }
```
Verify via `isValidSignature(bytes32, bytes)` on the contract.

**DID (optional)**:
```json
{ "payerId": "did:ethr:0x857b..." }
{ "payerId": "did:pkh:eip155:1:0x857b..." }
```
Facilitator resolves DID → address, then applies EOA/1271 verification.

### EIP-712 typed data

Domain (binds to contract and chain):
```js
{
  name: "ChannelReceipt",
  version: "1",
  chainId,                              // Cross-chain replay protection
  verifyingContract: SETTLEMENT_ADDRESS
}
```

Typed struct:
```js
{
  ChannelReceipt: [
    { name: "channelId", type: "bytes32" },
    { name: "epoch", type: "uint256" },
    { name: "subChannelId", type: "bytes32" },
    { name: "accumulatedAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "payee", type: "address" }
  ]
}
```

**Key points**:
- `asset` is NOT included (implicitly bound to `channelId`).
- `chainId` is in the EIP-712 domain (out-of-band separation).
- `channelId = keccak256(abi.encode(payer, payee, asset))` ensures asset binding at the identity level.

## Architecture sketch

The EVM implementation uses two main contracts:

### 1. Settlement Contract

**Purpose**: Manages channel lifecycle and validates/settles receipts.

**State**:
- `channels[channelId] => { payer, payee, asset, epoch, active }`
- `subStates[channelId][epoch][subChannelId] => { lastAmount, lastNonce }`

**Key operations**:
- `applyReceipt(receipt, signature)`: Unified entrypoint that handles both channel creation and settlement
  - If channel doesn't exist: creates channel with `epoch=0`, registers with Hub (lazy open)
  - If channel exists: verifies monotonicity, pulls `delta` from Hub if `delta > 0`
- `closeChannel(channelId)`: Marks inactive, increments epoch on reopen

### 2. Payment Hub

**Purpose**: Holds pooled ERC20 balances per payer (per asset); settlement contracts pull deltas on claims.

**State**:
- `balances[payer][asset] => amount`
- `settlementAuth[payer][settlement] => bool`
- `channelRegistry[payer][asset][channelId] => bool`

**Key operations**:
- `deposit(asset, amount)`: Payer adds funds
- `withdraw(asset, amount, to)`: Payer reclaims unused funds (subject to active channel constraints)
- `setSettlementAuthorization(settlement, allowed)`: Payer authorizes settlement contract to pull on their behalf
- `pull(payer, asset, delta, channelId)`: Settlement calls this to transfer `delta` to payee (only if authorized + channelId registered)

**Security model**:
- Payer authorizes specific settlement contracts
- Settlement registers channels when created (`onChannelOpened`)
- `pull()` only succeeds if caller is authorized AND channelId is registered for `(payer, asset)`

### Flow (lazy channel open + payment)

```
Setup:
1. Payer deposits USDC to Hub
2. Payer authorizes Settlement contract via Hub.setSettlementAuthorization()

First request (lazy open):
3. Client discovers requirements via 402 response
4. Client constructs first receipt: (epoch=0, nonce=0, amount=0), signs with EIP-712
5. Client sends request with X-PAYMENT header containing signed receipt
6. Facilitator verifies receipt off-chain (signature + structure)
7. Facilitator calls Settlement.applyReceipt(receipt, sig) with delta=0
   → Settlement detects channel doesn't exist
   → Creates channel, registers channelId with Hub
   → No funds transferred (delta=0)
8. Facilitator serves resource, returns proposal (nonce=1, amount=<cost>)

Subsequent requests:
9. Client signs proposal, sends next request with new receipt
10. Facilitator verifies off-chain, calls Settlement.applyReceipt() with delta>0
    → Settlement verifies signature, checks monotonicity
    → Settlement calls Hub.pull(payer, USDC, delta, channelId)
    → Hub transfers USDC to payee
11. Facilitator serves resource, returns next proposal
```

**Note**: Unlike client-initiated `openChannel()`, the lazy open pattern delegates channel creation to the facilitator, who pays gas fees and triggers creation by submitting the first receipt.

## PaymentRequirements example

For network-specific fields, see the core spec (`scheme_channel.md` §4). EVM-specific additions:

```json
{
  "scheme": "channel",
  "network": "base-sepolia",
  "maxAmountRequired": "100000000000000",
  "resource": "https://api.example.com/llm/stream",
  "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  "asset": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "extra": {
    "verifyingContract": "0xSettlementContractAddress",
    "hub": "0xPaymentHubAddress",
    "assetDecimals": 6
  }
}
```

## X-PAYMENT payload example

For payload structure, see the core spec (`scheme_channel.md` §4). EVM example with address-based `payerId`:

```json
{
  "x402Version": 1,
  "scheme": "channel",
  "network": "base-sepolia",
  "payload": {
    "version": 1,
    "payerId": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "clientTxRef": "c-20251027-0001",
    "receipt": {
      "channelId": "0xabcd...",
      "epoch": 1,
      "subChannelId": "0x9f...",
      "accumulatedAmount": "100000000000000",
      "nonce": 7,
      "payeeId": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "payerSignature": "0x..."
    }
  }
}
```

## Implementation notes

**Protocol flow**: See `scheme_channel.md` §2 for the overall request/response cycle and `scheme_channel.md` Appendix D for detailed interaction flows.

**Verification (off-chain)**:
- Facilitator verifies EIP-712 signature (EOA via `ecrecover` or contract via EIP-1271)
- Enforces monotonicity using off-chain state (see `scheme_channel.md` Appendix B)
- If `delta == 0`: treat as idempotent retry or channel initialization (no settlement)

**Settlement (on-chain)**:
- Settlement contract enforces strict monotonicity: `nonce > lastNonce`, `delta > 0` (except channel creation where `delta == 0` is allowed once)
- Gas optimization: batch multiple claims when possible
- Idempotency: track settled receipts to prevent replay

**Security considerations**:
- See `scheme_channel.md` §6 for core security requirements
- EVM-specific: Hub authorization model ensures only authorized settlements can pull funds for registered channels
- Event logging for audit trails

## Open questions for discussion

1. **Gas efficiency**: How to optimize batch settlement for hundreds of micro-receipts?
2. **Hub security**: What's the right balance between withdrawal flexibility and channel protection?
3. **EIP-1271 key management**: Best practices for mapping `subChannelId` to distinct keys in contract wallets?
4. **Dispute resolution**: Should we add challenge periods or rely on off-chain reputation?
5. **Cross-L2 channels**: Can we extend this to unified channels across multiple L2s sharing the same Hub?

---

**Feedback welcome**: This is an early proposal. We're looking for input from EVM developers on feasibility, security trade-offs, and better design patterns. Please open issues or join the discussion!
