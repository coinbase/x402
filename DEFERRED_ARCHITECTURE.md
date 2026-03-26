# Deferred Scheme Architecture

This document describes how the x402 deferred payment scheme is implemented using the SDK, covering the flow between client, server, and facilitator.

---

## Overview

The deferred scheme enables aggregated micropayments through signed vouchers. Instead of settling each payment on-chain, vouchers accumulate and are settled later in batches.

**Lifecycle:**
1. Client requests access to a resource
2. Client retries with payment (signed voucher)
3. Later: Server initiates on-chain settlement

---

## Step 1: Client Requests Access

```
Client                              Server                              Facilitator
  │                                   │                                     │
  │  GET /resource                    │                                     │
  │  PAYER-IDENTIFIER: 0x123...       │                                     │
  │  ─────────────────────────────►   │                                     │
  │                                   │                                     │
  │                             ┌─────┴─────┐                               │
  │                             │ deferred-scheme extension:                │
  │                             │                                           │
  │                             │ 1. Extract buyer from header              │
  │                             │ 2. Fetch buyer data ─────────────────────►│
  │                             │    GET /deferred/buyers/:buyer            │
  │                             │ ◄────────────────────────────────────────│
  │                             │ 3. Return extension data                  │
  │                             └─────┬─────┘                               │
  │                                   │                                     │
  │  402 Payment Required             │                                     │
  │  { extensions: {                  │                                     │
  │      deferred-scheme: {           │                                     │
  │        info: { voucher, account } │                                     │
  │      }                            │                                     │
  │  }}                               │                                     │
  │  ◄─────────────────────────────   │                                     │
```

### Client

**Action:** Send initial request with `PAYER-IDENTIFIER` header.

**SDK:** No changes needed. Client includes header in fetch request.

```typescript
const response = await fetchWithPayment('https://api.example.com/resource', {
  headers: { 'PAYER-IDENTIFIER': wallet.address }
});
```

### Server

**Action:** Return 402 with voucher state and account data.

**SDK:** Uses the `deferred-scheme` ResourceServerExtension (mandatory for servers accepting deferred payments):

```typescript
const deferredSchemeExtension: ResourceServerExtension = {
  key: 'deferred-scheme',

  // Extract buyer from PAYER-IDENTIFIER header
  enrichDeclaration: (declaration, transportContext) => {
    const ctx = transportContext as HTTPRequestContext;
    const buyer = ctx.adapter.getHeader('PAYER-IDENTIFIER');
    return { ...declaration, buyer };
  },

  // Fetch voucher state and inject into 402 response
  enrichPaymentRequiredResponse: async (declaration, context) => {
    const buyer = declaration.buyer;

    if (!buyer) {
      return { info: { type: 'new' }, schema: voucherSchema };
    }

    // Get voucherStorage mode from payment requirements
    const voucherStorage = context.requirements[0]?.extra?.voucherStorage;

    // Fetch buyer data from facilitator (account + voucher if facilitator stores them)
    const buyerData = await facilitator.getBuyerData(buyer, seller, asset, chainId);

    // Use local voucher if server stores, otherwise use facilitator's voucher
    const voucher = voucherStorage === 'server'
      ? await localVoucherStore.getLatestVoucher(buyer, seller, asset)
      : buyerData.voucher;

    return {
      info: {
        type: voucher ? 'aggregation' : 'new',
        voucher,
        account: buyerData.account
      },
      schema: voucherSchema,
    };
  },
};
```

Note: Extension hooks can only populate `response.extensions`, not modify `accepts[]` (PaymentRequirements). This is why voucher data goes in `extensions['deferred-scheme']` rather than in `accepts[].extra`.

### Facilitator

**Action:** Provide on-chain account data and voucher state (if facilitator stores vouchers).

**SDK:** `DeferredEvmScheme` exposes a custom endpoint for buyer data:

```
GET /deferred/buyers/:buyer?seller=0x...&asset=0x...&chainId=84532

Response:
{
  "account": {
    "balance": "10000000",
    "assetAllowance": "115792...",
    "assetPermitNonce": "0",
    "escrow": "0x..."
  },
  "voucher": {
    "id": "0x...",
    "nonce": 5,
    "valueAggregate": "5000000",
    ...
  },
  "signature": "0x..."
}
```

- `account` is always returned (on-chain escrow data)
- `voucher` and `signature` are returned if facilitator supports `deferred-voucher-store` extension (otherwise `null`)

Facilitators advertise voucher storage capability via `/supported`:

```json
{
  "kinds": [{ "scheme": "deferred", "network": "eip155:84532", ... }],
  "extensions": ["deferred-voucher-store"]
}
```

---

## Step 2: Client Retries with Payment

```
Client                              Server                              Facilitator
  │                                   │                                     │
  │  GET /resource                    │                                     │
  │  PAYMENT-SIGNATURE: <voucher>     │                                     │
  │  ─────────────────────────────►   │                                     │
  │                                   │                                     │
  │                             ┌─────┴─────┐                               │
  │                             │ onBeforeVerify                            │
  │                             └─────┬─────┘                               │
  │                                   │                                     │
  │                                   │  POST /verify                       │
  │                                   │  ────────────────────────────────►  │
  │                                   │  ◄────────────────────────────────  │
  │                                   │                                     │
  │                             ┌─────┴─────┐                               │
  │                             │ onAfterVerify                             │
  │                             └─────┬─────┘                               │
  │                                   │                                     │
  │                             ┌─────┴─────┐                               │
  │                             │ onBeforeSettle                            │
  │                             └─────┬─────┘                               │
  │                                   │                                     │
  │                                   │  POST /settle (store voucher)       │
  │                                   │  ────────────────────────────────►  │
  │                                   │  ◄────────────────────────────────  │
  │                                   │                                     │
  │                             ┌─────┴─────┐                               │
  │                             │ onAfterSettle                             │
  │                             │ (store voucher locally if needed)         │
  │                             └─────┬─────┘                               │
  │                                   │                                     │
  │  200 OK + response                │                                     │
  │  ◄─────────────────────────────   │                                     │
```

### Client

**Action:** Create signed voucher and send payment.

**SDK:** Uses `DeferredEvmScheme` client implementation for payment creation. The client:

1. Reads payment requirements from `paymentRequired.accepts[]` (scheme, network, asset, amount)
2. Reads voucher state from `paymentRequired.extensions['deferred-scheme']` (current voucher, account balance)
3. Creates new voucher by incrementing nonce and adding payment amount to valueAggregate
4. Signs voucher using EIP-712
5. Sends payment header with signed voucher

### Server

**Action:** Verify voucher, store it, grant access.

**SDK:** Uses existing hooks:
- `onAfterSettle` - Store voucher if `requirements.extra.voucherStorage === "server"`

### Facilitator

**Action:** Verify voucher signature, check escrow balance, store voucher.

**SDK:** `DeferredEvmScheme` implements standard `/verify` and `/settle` endpoints with deferred-specific logic.
- `/settle` stores voucher if `requirements.extra.voucherStorage === "facilitator"`

---

## Step 3: On-Chain Settlement

```
Server                              Facilitator                         Blockchain
  │                                   │                                     │
  │  POST /deferred/collect           │                                     │
  │  { voucher, signature }           │                                     │
  │  ─────────────────────────────►   │                                     │
  │                                   │  collect(voucher, signature)        │
  │                                   │  ────────────────────────────────►  │
  │                                   │  ◄────────────────────────────────  │
  │                                   │                                     │
  │  { txHash }                       │                                     │
  │  ◄─────────────────────────────   │                                     │
```

### Server

**Action:** Initiate settlement when ready (threshold, schedule, manual).

**SDK:** Out-of-band operation. Server calls facilitator's custom endpoint directly, implemented by `DeferredEvmScheme`

```typescript
// Server decides when to settle (not tied to x402 hooks)
async function settleVouchers() {
  const vouchers = await voucherStore.getVouchersReadyForSettlement();
  for (const { voucher, signature } of vouchers) {
    await facilitatorClient.collect({ voucher, signature });
  }
}
```

### Facilitator

**Action:** Submit voucher to escrow contract on-chain.

**SDK:** Custom endpoint for deferred settlement.

```
POST /deferred/collect
{ voucher, signature }

Response:
{ txHash: "0x..." }
```

---

## Extensions

### Server Extension: `deferred-scheme`

The `deferred-scheme` extension is a **ResourceServerExtension** that servers must register to accept deferred payments. It handles:

1. **`enrichDeclaration`**: Extracts buyer address from `PAYER-IDENTIFIER` header
2. **`enrichPaymentRequiredResponse`**: Fetches voucher state and injects into 402 response

The extension uses both hooks internally - `enrichDeclaration` runs first for all extensions, then `enrichPaymentRequiredResponse` can access the enriched declaration.

### Facilitator Extension: `deferred-voucher-store`

The `deferred-voucher-store` extension is a **FacilitatorExtension** that facilitators can optionally support. It indicates the facilitator can store vouchers on behalf of servers.

**Advertised in `/supported`:**
```json
{
  "kinds": [{ "scheme": "deferred", ... }],
  "extensions": ["deferred-voucher-store"]
}
```

**What it enables:**
- `GET /deferred/buyers/:buyer` returns stored vouchers
- `POST /settle` stores vouchers when `voucherStorage === "facilitator"`

**Additional endpoints provided by this extension:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/deferred/vouchers` | GET | Query vouchers (filter by buyer, seller, asset) |
| `/deferred/vouchers/:id` | GET | Get voucher series by ID |
| `/deferred/vouchers/:id/:nonce` | GET | Get specific voucher by ID and nonce |

Servers retrieve vouchers via these endpoints, then use the standard `/deferred/vouchers/collect` to settle.

Servers check this capability before configuring `voucherStorage: "facilitator"` in their payment requirements.

---

## PaymentRequirements.extra

The deferred scheme uses `extra` in `PaymentRequirements` for scheme-specific metadata:

```typescript
extra: {
  name: "USDC",                      // EIP-712 domain name
  version: "2",                      // EIP-712 domain version
  escrow: "0x...",                   // Escrow contract address
  voucherStorage: "server" | "facilitator"  // Who stores vouchers
}
```

The `voucherStorage` field declares where vouchers are stored. Both server and facilitator read this to determine their behavior.

---

## Voucher Storage Modes

Servers declare storage mode via `extra.voucherStorage` in payment requirements:

```
Server                              Facilitator
  │                                   │
  │  Step 1: GET /buyers/:buyer       │  (account + voucher if stored)
  │  ─────────────────────────────►   │
  │  ◄─────────────────────────────   │
  │                                   │
  │  Step 2: POST /settle             │
  │  ─────────────────────────────►   │
  │  ◄─────────────────────────────   │
```

### Mode A: Server Stores (`voucherStorage: "server"`)

- Server queries local database for latest voucher
- Server stores voucher in `onAfterSettle` hook
- Facilitator skips voucher storage in `/settle`

**Pros:** Portable - can switch facilitators without losing voucher history
**Cons:** Server needs database infrastructure

### Mode B: Facilitator Stores (`voucherStorage: "facilitator"`)

- Server uses `voucher` from facilitator response
- Facilitator stores voucher as part of `/settle`
- Server skips local storage

**Pros:** Simpler server implementation, no database needed
**Cons:** Tied to facilitator - switching means losing voucher history

### How Each Actor Uses voucherStorage

| Actor | Reads `voucherStorage` | Action |
|-------|------------------------|--------|
| Server (402 response) | `"server"` | Query local DB for voucher |
| Server (402 response) | `"facilitator"` | Use voucher from facilitator |
| Server (`onAfterSettle`) | `"server"` | Store voucher locally |
| Server (`onAfterSettle`) | `"facilitator"` | Skip local storage |
| Facilitator (`/settle`) | `"server"` | Skip voucher storage |
| Facilitator (`/settle`) | `"facilitator"` | Store voucher |

---

## Extensions Summary

| Extension | Type | Purpose |
|-----------|------|---------|
| `deferred-scheme` | ResourceServerExtension (mandatory) | Extract buyer header, fetch voucher state, inject into 402 |
| `deferred-voucher-store` | FacilitatorExtension (optional) | Voucher storage capability for facilitators |

---

## Facilitator Custom Endpoints

The deferred scheme requires facilitator endpoints beyond the standard x402 interface:

| Endpoint | Purpose |
|----------|---------|
| `GET /buyers/:buyer` | Query on-chain account data + voucher (if facilitator stores vouchers) |
| `POST /deferred/collect` | Submit voucher for on-chain settlement |
| `POST /deferred/collectMany` | Batch settlement |
| `POST /deferred/deposit` | Execute gasless deposit (with permit) |

When facilitator provides storage, vouchers are stored automatically as part of `/settle`.

---

## Hooks Summary

| Hook | When | Used By |
|------|------|---------|
| `enrichDeclaration` | Before building 402 | `deferred-scheme`: Extract buyer from header |
| `enrichPaymentRequiredResponse` | Building 402 response | `deferred-scheme`: Fetch and inject voucher state |
| `onAfterSettle` | After settlement | Server: Store voucher if `voucherStorage === "server"` |

---

## Key Design Decisions

1. **Payer identification via header**: Client sends `PAYER-IDENTIFIER` on initial request. No SDK changes needed - client just includes header in fetch.

2. **Single server extension**: The `deferred-scheme` extension handles both header extraction and voucher state injection. Simpler than separate extensions.

3. **Facilitator voucher storage as capability**: The `deferred-voucher-store` is advertised in facilitator's `/supported` response. Servers check this before configuring `voucherStorage: "facilitator"`.

4. **Pluggable voucher storage**: Server chooses where to store vouchers via `extra.voucherStorage`. Both server and facilitator read this to determine behavior.

5. **Out-of-band settlement**: On-chain settlement is not tied to HTTP request lifecycle. Server calls facilitator directly when ready.

6. **Facilitator custom endpoints**: Deferred-specific operations (account data, collect) require endpoints beyond standard x402 facilitator interface.
