# Scheme: `exact` on `Hyperliquid`

## Versions supported

- ❌ `v1` - not supported.
- ✅ `v2`

## Supported Networks

This spec uses a custom [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) namespace for Hyperliquid L1 (HyperCore):

- `hyperliquid:mainnet` — Hyperliquid mainnet
- `hyperliquid:testnet` — Hyperliquid testnet

These identifiers refer to HyperCore (the native L1 execution environment), not HyperEVM. All transfers use HyperCore's `sendAsset` action, which is gasless and does not involve EVM transactions.

## Summary

The `exact` scheme on Hyperliquid uses HyperCore's native [`sendAsset`](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#send-asset) action. The client signs an [EIP-712](https://eips.ethereum.org/EIPS/eip-712) typed data message authorizing a token transfer between spot and/or perps balances. The verifier checks the signed action against the payment requirements and submits it to the Hyperliquid exchange API.

Since HyperCore actions are gasless, no fee sponsorship is involved. This enables a **direct mode** where the resource server performs verification and settlement itself, without a separate facilitator server.

### Spot and Perps Support

`sendAsset` supports transfers between spot and perps (default USDC DEX) balances:

- **`sourceDex`**: Where funds come from — `"spot"` for spot balance, `""` for perps balance. Chosen by the client.
- **`destinationDex`**: Where funds arrive — `"spot"` for spot balance, `""` for perps balance. Specified by the server via `extra.destinationDex` (defaults to `"spot"`).

Perps transfers only support USDC. Non-USDC tokens from a perps source MUST be rejected.

## Protocol Flow

1. **Client** makes a request to a **Resource Server**.
2. **Resource Server** responds with `402 Payment Required` and a `PaymentRequired` header containing `PaymentRequirements`.
3. **Client** constructs a `sendAsset` action with `destination`, `token`, `amount`, `sourceDex`, and `destinationDex` from the requirements. The `nonce` field is set to the current millisecond timestamp.
4. **Client** signs the action as EIP-712 typed data using the `HyperliquidTransaction:SendAsset` primary type and the `HyperliquidSignTransaction` domain.
5. **Client** sends a new request to the resource server with the `PaymentPayload` containing the signature and action parameters.
6. **Resource Server** verifies the destination, token, amount, destinationDex, temporal validity, and client balance.
7. **Resource Server** submits the signed action to the Hyperliquid exchange API (`POST https://api.hyperliquid.xyz/exchange`).
8. **Resource Server** confirms the response indicates success and grants the **Client** access to the resource.

> [!NOTE]
> A facilitator-based flow is also possible (steps 6–8 delegated to a facilitator server) but provides no security or cost benefit, since the facilitator needs no private key and bears no gas cost. Direct mode is the recommended deployment.

## `PaymentRequirements` for `exact`

```json
{
  "scheme": "exact",
  "network": "hyperliquid:mainnet",
  "amount": "1.5",
  "asset": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
  "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  "maxTimeoutSeconds": 60,
  "extra": {
    "destinationDex": "spot"
  }
}
```

**Field Definitions:**

- `asset`: HyperCore token identifier in `tokenName:tokenId` format (e.g., `USDC:0x6d1e7cde53ba9467b783cb7c530ce054`). Matches the `token` field in Hyperliquid's `sendAsset` API.
- `payTo`: 42-character hex address of the recipient.
- `amount`: Human-readable token amount as a string (e.g., `"1.5"`).
- `maxTimeoutSeconds`: Maximum acceptable age of the `nonce` field in the signed action.
- `extra.destinationDex`: (optional) Destination balance — `"spot"` for spot (default), `""` for perps. The server uses this to control where received funds land.

## PaymentPayload `payload` Field

The `payload` field of the `PaymentPayload` contains:

```json
{
  "signature": {
    "r": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a128325976417360",
    "s": "0xa2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    "v": 28
  },
  "action": {
    "destination": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "sourceDex": "spot",
    "destinationDex": "spot",
    "token": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
    "amount": "1.5",
    "nonce": 1716531066415
  }
}
```

- `signature`: EIP-712 signature components (`r`, `s`, `v`).
- `action`: The parameters that were signed and will be submitted to the Hyperliquid exchange API.
- `action.sourceDex`: Source balance chosen by the client — `"spot"` for spot, `""` for perps.
- `action.destinationDex`: Destination balance specified by the server — `"spot"` for spot, `""` for perps.
- `action.nonce`: Millisecond timestamp acting as the nonce.

**Full `PaymentPayload` object:**

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "hyperliquid:mainnet",
    "amount": "1.5",
    "asset": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
    "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "maxTimeoutSeconds": 60,
    "extra": {
      "destinationDex": "spot"
    }
  },
  "payload": {
    "signature": {
      "r": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a128325976417360",
      "s": "0xa2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
      "v": 28
    },
    "action": {
      "destination": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "sourceDex": "spot",
      "destinationDex": "spot",
      "token": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
      "amount": "1.5",
      "nonce": 1716531066415
    }
  }
}
```

## EIP-712 Typed Data Structure

The client signs the following EIP-712 typed data message. This matches the format used by Hyperliquid's [`sign_user_signed_action`](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/hyperliquid/utils/signing.py).

```json
{
  "domain": {
    "name": "HyperliquidSignTransaction",
    "version": "1",
    "chainId": 999,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
  },
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "HyperliquidTransaction:SendAsset": [
      { "name": "hyperliquidChain", "type": "string" },
      { "name": "destination", "type": "string" },
      { "name": "sourceDex", "type": "string" },
      { "name": "destinationDex", "type": "string" },
      { "name": "token", "type": "string" },
      { "name": "amount", "type": "string" },
      { "name": "fromSubAccount", "type": "string" },
      { "name": "nonce", "type": "uint64" }
    ]
  },
  "primaryType": "HyperliquidTransaction:SendAsset",
  "message": {
    "hyperliquidChain": "Mainnet",
    "destination": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "sourceDex": "spot",
    "destinationDex": "spot",
    "token": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
    "amount": "1.5",
    "fromSubAccount": "",
    "nonce": 1716531066415
  }
}
```

The signing `chainId` MUST match the HyperEVM chain ID for the target network: `999` for mainnet, `998` for testnet. Browser wallets enforce that the EIP-712 domain `chainId` matches the connected chain, so the signing chainId must equal the HyperEVM chain ID. The `signatureChainId` in the exchange API request body must be the hex encoding of the same value (`"0x3e7"` for mainnet, `"0x3e6"` for testnet). The `hyperliquidChain` field (`"Mainnet"` or `"Testnet"`) determines the execution environment.

The `fromSubAccount` field is always set to `""` (empty string) — sub-account transfers are not supported in this scheme.

## Verification Rules (MUST)

The verifier MUST enforce all of the following before submitting the action.

> [!IMPORTANT]
> All correctness checks MUST compare `payload.action` fields against `requirements` (the resource server's payment requirements), **not** against `payload.accepted`. The client controls the entire `PaymentPayload` including `accepted`, so a malicious client can set `accepted` to match a fraudulent action. The `requirements` object is the source of truth.

### 1. Protocol Validation

- `x402Version` MUST be `2`.
- `requirements.scheme` MUST be `"exact"`.
- `requirements.network` MUST be `hyperliquid:mainnet` or `hyperliquid:testnet`.

### 2. Transfer Correctness

These checks are security-critical. The Hyperliquid API validates that a transfer is *legitimate* (valid signature, sufficient balance), but has no concept of what the resource server *required*. Without these checks, a client could submit a valid transfer of the wrong token, insufficient amount, or to the wrong address.

- `payload.action.token` MUST equal `requirements.asset`.
- `payload.action.amount` MUST equal `requirements.amount`.
- `payload.action.destination` MUST equal `requirements.payTo` (case-insensitive hex comparison).
- `payload.action.destinationDex` MUST equal `requirements.extra.destinationDex` (defaults to `"spot"` if not specified).

### 3. Temporal Validity

- `payload.action.nonce` MUST be a millisecond timestamp.
- The verifier MUST reject actions where `currentTimeMs - payload.action.nonce` exceeds `maxTimeoutSeconds * 1000`.
- The verifier MUST reject actions where `payload.action.nonce - currentTimeMs` exceeds `5000` (clock skew tolerance).

### 4. Balance Verification

The verifier MUST check the client's balance based on the `sourceDex` field:

- **Spot source** (`sourceDex === "spot"`): Query via `POST https://api.hyperliquid.xyz/info` with `{"type": "spotClearinghouseState", "user": "<payer_address>"}`. The client MUST have sufficient balance of the specified token.
- **Perps source** (`sourceDex === ""`): Query via `POST https://api.hyperliquid.xyz/info` with `{"type": "clearinghouseState", "user": "<payer_address>"}`. The client MUST have sufficient `withdrawable` balance. Only USDC is supported for perps transfers — the verifier MUST reject non-USDC tokens when `sourceDex` is `""`.

Unlike EVM transactions, `sendAsset` cannot be simulated or atomically reverted. If the submission fails due to insufficient balance, the resource may have already been granted. The balance check is the only pre-flight guard against this.

### 5. Signature Verification

- The verifier MUST recover the signer address from the EIP-712 signature using the `HyperliquidTransaction:SendAsset` typed data, `HyperliquidSignTransaction` domain, and signing `chainId` matching the network (`999` for mainnet, `998` for testnet).
- Set `hyperliquidChain` to `"Mainnet"` or `"Testnet"` based on `requirements.network`.
- The recovered address identifies the payer for balance checks and logging.
- Verification and settlement are separate steps — the resource server may grant access after verification but before settlement completes. An invalid signature that passes verification would fail at settlement, but the resource may have already been served. The verifier MUST validate the signature locally to prevent this.

### 6. Facilitator Safety

Since `sendAsset` is gasless and the submitter only relays a pre-signed action, there is no attack surface for fund redirection or self-enrichment. The submitter cannot alter signed fields and bears no gas cost. Duplicate submission is handled by Hyperliquid's nonce uniqueness enforcement.

## Settlement Logic

### Phase 1: Action Construction

Construct the exchange API request from the payload:

```json
{
  "action": {
    "type": "sendAsset",
    "hyperliquidChain": "Mainnet",
    "signatureChainId": "0x3e7",
    "destination": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "sourceDex": "spot",
    "destinationDex": "spot",
    "token": "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
    "amount": "1.5",
    "fromSubAccount": "",
    "nonce": 1716531066415
  },
  "nonce": 1716531066415,
  "signature": {
    "r": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a128325976417360",
    "s": "0xa2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
    "v": 28
  }
}
```

- `action.type` is always `"sendAsset"`.
- `action.signatureChainId` is `"0x3e7"` for mainnet, `"0x3e6"` for testnet.
- `action.hyperliquidChain` is `"Mainnet"` for `hyperliquid:mainnet`, `"Testnet"` for `hyperliquid:testnet`.
- `action.fromSubAccount` is always `""`.
- `nonce` MUST equal `payload.action.nonce`.

### Phase 2: Submission

1. Submit to `POST https://api.hyperliquid.xyz/exchange` (mainnet) or `POST https://api.hyperliquid-testnet.xyz/exchange` (testnet).
2. A successful response is `{"status": "ok", "response": {"type": "default"}}`.
3. Any other response indicates failure. The verifier MUST NOT report success unless the API returns the above.

### Phase 3: `SettlementResponse`

```json
{
  "success": true,
  "transaction": "",
  "network": "hyperliquid:mainnet",
  "payer": "0x857b06519E91e3A54538791bDbb0E22373e36b66"
}
```

- `payer`: Address recovered from the signature.
- `transaction`: Empty string. HyperCore `sendAsset` does not return a transaction hash; the transfer is applied atomically when the API returns success.

## Appendix

### Token Identifier Format

Hyperliquid spot tokens use `tokenName:tokenId`:

- `tokenName`: Human-readable symbol (e.g., `USDC`, `PURR`, `HYPE`)
- `tokenId`: Globally unique hash generated at token deployment (e.g., `0x6d1e7cde53ba9467b783cb7c530ce054`)

Used in both the `asset` field of `PaymentRequirements` and the `token` field of the signed action.

Token identifiers can be discovered by querying the Hyperliquid spot metadata endpoint:

```bash
curl -X POST https://api.hyperliquid.xyz/info \
  -H 'Content-Type: application/json' \
  -d '{"type": "spotMeta"}'
```

The response contains a `tokens` array. Each entry includes `name` and `tokenId`:

```json
{
  "tokens": [
    {
      "name": "USDC",
      "tokenId": "0x6d1e7cde53ba9467b783cb7c530ce054",
      ...
    }
  ]
}
```

The `asset` value is constructed as `name:tokenId` (e.g., `USDC:0x6d1e7cde53ba9467b783cb7c530ce054`).

### DEX Identifiers

| Value    | Meaning                           |
| -------- | --------------------------------- |
| `"spot"` | Spot balance                      |
| `""`     | Default USDC perps DEX            |

- `sourceDex`: Chosen by the client. Determines which balance funds are drawn from.
- `destinationDex`: Specified by the server via `extra.destinationDex`. Determines where funds arrive. Defaults to `"spot"`.

### EIP-712 Signing Constants

| Constant           | Value                                        |
| ------------------ | -------------------------------------------- |
| Domain name        | `HyperliquidSignTransaction`                 |
| Domain version     | `1`                                          |
| Signing chain ID   | `999` (`0x3e7`) mainnet, `998` (`0x3e6`) testnet |
| Verifying contract | `0x0000000000000000000000000000000000000000` |
| Primary type       | `HyperliquidTransaction:SendAsset`           |

### Hyperliquid API Reference

| Endpoint               | URL                                            |
| ---------------------- | ---------------------------------------------- |
| Exchange API (mainnet) | `https://api.hyperliquid.xyz/exchange`         |
| Exchange API (testnet) | `https://api.hyperliquid-testnet.xyz/exchange` |
| Info API (mainnet)     | `https://api.hyperliquid.xyz/info`             |
| Info API (testnet)     | `https://api.hyperliquid-testnet.xyz/info`     |

### Replay Protection

1. **Nonce uniqueness**: The `nonce` field acts as a nonce. Hyperliquid rejects actions with previously-used nonces for the same address.
2. **Temporal bounds**: The verifier enforces `maxTimeoutSeconds` to reject stale signatures.

### Why No Gas Sponsorship

HyperCore actions are gasless — signed messages included directly in L1 consensus, not EVM transactions. No gas token cost for the submitter. This eliminates the need for fee sponsorship, proxy contracts, or facilitator isolation checks.

### Why No Facilitator

On other chains, the facilitator holds private keys to co-sign transactions or sponsor gas. On Hyperliquid, the client's EIP-712 signature is the complete authorization. The submitter needs no private key and bears no cost. The resource server can verify and settle directly.
