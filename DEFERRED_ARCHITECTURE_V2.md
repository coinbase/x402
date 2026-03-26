# Deferred Scheme Architecture

This document describes the x402 deferred payment scheme implementation, covering the flow between client (buyer), server (seller), facilitator, and blockchain.

---

## Overview

The deferred scheme enables aggregated micropayments through signed vouchers. Instead of settling each payment on-chain, vouchers accumulate and are settled later in batches.

**Actors:**
- **Client (Buyer)**: Requests resources and signs vouchers
- **Server (Seller)**: Protects resources and holds voucher state
- **Facilitator**: Verifies payments, manages escrow interactions
- **Blockchain**: Escrow contract holding buyer deposits

**Key Concepts:**
- `PAYER-IDENTIFIER` identifies the buyer, allowing the seller to consider voucher history when sending payment requirements
- Sellers hold voucher state, optionally delegating storage to facilitators
- Settling stores the voucher (server or facilitator), not on-chain
- On-chain settlement happens separately, triggered manually or periodically

---

## Resource Request Flow

```
Client (Buyer)          Server (Seller)              Facilitator              Blockchain
     │                        │                           │                        │
     │  1. GET /api           │                           │                        │
     │  PAYER-IDENTIFIER      │                           │                        │
     │  ──────────────────►   │                           │                        │
     │                        │  2a. /deferred/buyers/:buyer                       │
     │                        │  ─────────────────────────►                        │
     │                        │                           │  2b. Get on-chain balance
     │                        │                           │  ─────────────────────►│
     │                        │                           │  2c. Balance data      │
     │                        │                           │  ◄─────────────────────│
     │                        │  2d. Buyer state          │                        │
     │                        │  ◄─────────────────────────                        │
     │                        │                           │                        │
     │  3. 402 PAYMENT-REQUIRED                           │                        │
     │  ◄──────────────────   │                           │                        │
     │                        │                           │                        │
     │  4. GET /api           │                           │                        │
     │  PAYMENT-SIGNATURE     │                           │                        │
     │  (+ deposit auth)      │                           │                        │
     │  ──────────────────►   │                           │                        │
     │                        │  5a. POST /verify         │                        │
     │                        │  ─────────────────────────►                        │
     │                        │                           │  5b. Get on-chain state│
     │                        │                           │  ─────────────────────►│
     │                        │                           │  5c. On-chain state    │
     │                        │                           │  ◄─────────────────────│
     │                        │  5d. 200 Verification     │                        │
     │                        │  ◄─────────────────────────                        │
     │                        │                           │                        │
     │                  ┌─────┴─────┐                     │                        │
     │                  │ 6. Do work│                     │                        │
     │                  └─────┬─────┘                     │                        │
     │                        │                           │                        │
     │                        │  7a. POST /settle         │                        │
     │                        │  ─────────────────────────►                        │
     │                        │                           │  7b. Execute deposit   │
     │                        │                           │  ─────────────────────►│
     │                        │                           │  7c. Deposit confirmed │
     │                        │                           │  ◄─────────────────────│
     │                        │  7d. 200 Settled          │                        │
     │                        │  ◄─────────────────────────                        │
     │                        │                           │                        │
     │  8. 200 OK             │                           │                        │
     │  PAYMENT-RESPONSE      │                           │                        │
     │  ◄──────────────────   │                           │                        │
```

---

## Step 1: Initial Request

**Client → Server:** `GET /api` with optional `PAYER-IDENTIFIER` header

### Client

**Action:** Send request with optional buyer identifier header.

**SDK:** No SDK changes needed. Client includes header in fetch request.

```typescript
const response = await fetchWithPayment('https://api.example.com/resource', {
  headers: { 'PAYER-IDENTIFIER': wallet.address }
});
```

The `PAYER-IDENTIFIER` header is optional but recommended. It allows the server to look up existing voucher state before returning payment requirements, enabling voucher aggregation.

### Server

**Action:** Receive request, check for payment header, extract buyer identifier.

**SDK:** Standard x402 middleware checks for payment header. If no payment, continues to build 402 response. The `DeferredEvmScheme` extracts the buyer address from the `PAYER-IDENTIFIER` header via transport context.

---

## Steps 2a-2d: Buyer State Lookup

**Server → Facilitator → Blockchain → Facilitator → Server**

### Server (2a)

**Action:** Query facilitator for buyer's escrow state and voucher history.

**SDK:** The `DeferredEvmScheme` handles this in `enhancePaymentRequirements()`, which receives transport context:

```typescript
// In DeferredEvmScheme.enhancePaymentRequirements()
// 1. Extract buyer from PAYER-IDENTIFIER header
let buyer: string | undefined;
if (isHTTPRequestContext(transportContext)) {
  buyer = transportContext.adapter.getHeader("PAYER-IDENTIFIER");
}

// 2. Fetch buyer data from facilitator
const buyerData = buyer
  ? await this.fetchBuyerData(buyer, paymentRequirements.payTo, paymentRequirements.asset)
  : null;

// 3. Return enhanced requirements with voucher state in extra
return {
  ...paymentRequirements,
  extra: {
    ...paymentRequirements.extra,
    voucher: buyerData?.voucher,
    signature: buyerData?.signature,
    account: buyerData?.account,
  },
};
```

### Facilitator (2a → 2d)

**Action:** Query blockchain for escrow balance, return buyer state.

**SDK:** `DeferredEvmScheme` implements custom endpoint.

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
    "buyer": "0x...",
    "seller": "0x...",
    "asset": "0x...",
    "escrow": "0x...",
    "timestamp": 1703123456,
    "chainId": 84532
  },
  "signature": "0x..."
}
```

- `account` is always returned (on-chain escrow data from steps 2b-2c)
- `voucher` and `signature` are returned if facilitator supports `deferred-voucher-store` extension

### Blockchain (2b-2c)

**Action:** Return escrow contract state.

**Contract calls:**
- `escrow.balanceOf(buyer, asset)` - Buyer's deposited balance
- `asset.allowance(buyer, escrow)` - Token allowance for deposits
- `asset.nonces(buyer)` - EIP-2612 permit nonce (if supported)

---

## Step 3: Payment Required Response

**Server → Client:** `402 PAYMENT-REQUIRED`

### Server

**Action:** Build and return payment requirements with voucher state.

**SDK:** The `DeferredEvmScheme.enhancePaymentRequirements()` injects voucher state directly into `accepts[].extra`.

```typescript
// Final 402 response structure:
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "deferred",
    "network": "eip155:84532",
    "maxAmountRequired": "1000000",
    "resource": "https://api.example.com/resource",
    "payTo": "0xSellerAddress",
    "asset": "0xUSDCAddress",
    "extra": {
      // Static metadata
      "name": "USDC",
      "version": "2",
      "escrow": "0xEscrowAddress",
      "voucherStorage": "server",
      // Dynamic per-buyer data (present = aggregation, absent = new voucher)
      "voucher": {
        "id": "0x...",
        "nonce": 5,
        "valueAggregate": "5000000",
        "buyer": "0x...",
        "seller": "0x...",
        "asset": "0x...",
        "escrow": "0x...",
        "timestamp": 1703123456,
        "chainId": 84532
      },
      "signature": "0x...",
      "account": {
        "balance": "10000000",
        "assetAllowance": "115792...",
        "assetPermitNonce": "0"
      }
    }
  }]
}
```

### Client

**Action:** Receive 402, prepare payment.

**SDK:** `wrapFetchWithPayment` intercepts 402 response.

```typescript
// Client receives 402 and extracts:
// 1. Payment requirements from paymentRequired.accepts[]
// 2. Voucher state from paymentRequired.accepts[].extra (type, voucher, account, signature)
```

---

## Step 4: Payment Retry

**Client → Server:** `GET /api` with `PAYMENT-SIGNATURE` header

### Client

**Action:** Create signed voucher and retry request.

**SDK:** `DeferredEvmScheme` client implementation handles voucher creation.

```typescript
// Client creates payment:
// 1. Read payment requirements from accepts[] (scheme, network, asset, amount)
// 2. Read voucher state from accepts[].extra (voucher, signature, account)
// 3. Create new voucher:
//    - If no voucher in extra → nonce: 0, valueAggregate: paymentAmount
//    - If voucher in extra → nonce: previous + 1, valueAggregate: previous + paymentAmount
// 4. Sign voucher using EIP-712
// 5. Optionally include deposit (permit + authorization for gasless escrow funding)

const paymentPayload = {
  x402Version: 2,
  scheme: "deferred",
  network: "eip155:84532",
  payload: {
    voucher: {
      id: "0x...",
      nonce: 6,
      valueAggregate: "6000000",
      buyer: "0x...",
      seller: "0x...",
      asset: "0x...",
      escrow: "0x...",
      timestamp: 1703123500,
      chainId: 84532
    },
    signature: "0x...",
    // Optional: gasless deposit
    deposit: {
      permit: { ... },
      authorization: { ... }
    }
  }
};
```

**Request:**
```
GET /api
PAYMENT-SIGNATURE: base64(paymentPayload)
```

### Server

**Action:** Receive payment, forward to facilitator for verification.

**SDK:** Standard x402 flow - server automatically forwards payment to facilitator's `/verify` endpoint.

---

## Steps 5a-5d: Verification

**Server → Facilitator → Blockchain → Facilitator → Server**

### Server (5a)

**Action:** Forward payment to facilitator for verification.

**SDK:** Standard x402 verification flow.

```
POST /verify
Content-Type: application/json

{
  "paymentSignature": { ... },
  "paymentRequired": { ... }
}
```

### Facilitator (5a → 5d)

**Action:** Verify voucher signature and check escrow balance.

**SDK:** `DeferredEvmScheme` implements verification logic.

**Verification steps:**
1. Decode voucher from payment payload
2. Verify EIP-712 signature matches buyer address
3. Validate voucher fields:
   - `nonce == previousNonce + 1` (or `nonce == 0` for new voucher)
   - `valueAggregate >= previousValueAggregate + paymentAmount`
   - `seller`, `asset`, `escrow`, `chainId` match payment requirements
4. Query blockchain for escrow balance (steps 5b-5c)
5. Verify `balance >= valueAggregate`

**Response:**
```json
{
  "valid": true,
  "invalidReason": null
}
```

### Blockchain (5b-5c)

**Action:** Return current escrow state for verification.

**Contract calls:**
- `escrow.balanceOf(buyer, asset)` - Verify sufficient balance for voucher

---

## Step 6: Do Work

**Server:** Execute protected resource logic

### Server

**Action:** After successful verification, execute the protected resource handler.

**SDK:** Application-specific logic runs here.

```typescript
// Verification passed - execute protected handler
const result = await protectedHandler(request);
```

**Important:** Work is done BEFORE settlement. If settlement fails, the server has already done the work but may not store the voucher. Servers should handle this gracefully.

---

## Steps 7a-7d: Settlement

**Server → Facilitator → Blockchain → Facilitator → Server**

### Server (7a)

**Action:** Request settlement (store voucher, optionally execute deposit).

**SDK:** Standard x402 settlement flow.

```
POST /settle
Content-Type: application/json

{
  "paymentSignature": { ... },
  "paymentRequired": { ... }
}
```

### Facilitator (7a → 7d)

**Action:** Store voucher, optionally execute deposit.

**SDK:** `DeferredEvmScheme` implements settlement logic.

**Settlement steps:**
1. Store voucher if `requirements.extra.voucherStorage === "facilitator"`
2. If deposit included:
   - Execute `permit` call to approve escrow (step 7b)
   - Execute `deposit` call to transfer tokens to escrow (step 7b)
   - Wait for transaction confirmation (step 7c)

**Response:**
```json
{
  "success": true,
  "network": "eip155:84532",
  "transaction": "0x...",  // Only if deposit was executed
  "payer": "0xBuyerAddress"
}
```

### Blockchain (7b-7c)

**Action:** Execute deposit if authorization provided.

**Contract calls (if deposit auth present):**
- `asset.permit(buyer, escrow, amount, deadline, v, r, s)` - Approve escrow
- `escrow.deposit(buyer, asset, amount)` - Transfer tokens to escrow

### Server (post-7d)

**Action:** Store voucher locally if using local storage mode.

**SDK:** `onAfterSettle` hook. Stores voucher if `requirements.extra.voucherStorage === "server"`.

```typescript
const serverHooks = {
  onAfterSettle: async (result, context) => {
    const voucherStorage = context.requirements.extra?.voucherStorage;
    if (voucherStorage === 'server') {
      await localVoucherStore.storeVoucher(
        context.paymentPayload.payload.voucher,
        context.paymentPayload.payload.signature
      );
    }
  }
};
```

---

## Step 8: Success Response

**Server → Client:** `200 OK` with `PAYMENT-RESPONSE` header

### Server

**Action:** Return protected resource with payment confirmation.

**SDK:** Standard x402 response flow.

```
HTTP/1.1 200 OK
PAYMENT-RESPONSE: base64({
  "success": true,
  "network": "eip155:84532",
  "transaction": "0x...",
  "payer": "0xBuyerAddress"
})
Content-Type: application/json

{ "data": "protected resource content" }
```

### Client

**Action:** Receive response and payment confirmation.

**SDK:** `wrapFetchWithPayment` returns the successful response to caller.

---

## Payment Settlement (On-Chain)

```
Server (Seller)              Facilitator              Blockchain
     │                           │                        │
     │  1. POST /deferred/vouchers/settle                 │
     │  ─────────────────────────►                        │
     │                           │  2. Submit voucher     │
     │                           │  ─────────────────────►│
     │                           │  3. Tx confirmed       │
     │                           │  ◄─────────────────────│
     │  4. Settled               │                        │
     │  ◄─────────────────────────                        │
```

On-chain settlement is a separate flow, triggered manually or periodically by the server or facilitator.

### Server (Step 1)

**Action:** Initiate on-chain settlement when ready.

**SDK:** Out-of-band operation. Server calls facilitator directly.

```typescript
// Server decides when to settle (threshold, schedule, manual)
async function settleVouchersOnChain() {
  const vouchers = await voucherStore.getVouchersReadyForSettlement();

  for (const { voucher, signature } of vouchers) {
    const result = await facilitatorClient.post('/deferred/vouchers/settle', {
      voucher,
      signature
    });

    if (result.success) {
      await voucherStore.markAsSettled(voucher.id, result.txHash);
    }
  }
}
```

**Request:**
```
POST /deferred/vouchers/settle
Content-Type: application/json

{
  "voucher": {
    "id": "0x...",
    "nonce": 10,
    "valueAggregate": "50000000",
    "buyer": "0x...",
    "seller": "0x...",
    "asset": "0x...",
    "escrow": "0x...",
    "timestamp": 1703200000,
    "chainId": 84532
  },
  "signature": "0x..."
}
```

### Facilitator (Steps 2-3)

**Action:** Submit voucher to escrow contract.

**SDK:** `DeferredEvmScheme` implements collection logic.

**Contract call:**
```solidity
escrow.collect(voucher, signature)
// Transfers valueAggregate from buyer's escrow balance to seller
```

### Facilitator (Step 4)

**Action:** Return settlement confirmation.

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "blockNumber": 12345678
}
```

---

## Extensions

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

Servers check this capability before configuring `voucherStorage: "facilitator"` in their payment requirements.

---

## PaymentRequirements.extra

The deferred scheme uses `extra` in `PaymentRequirements` for both static metadata and dynamic per-buyer state:

```typescript
extra: {
  // Static metadata (from facilitator supportedKind)
  name: "USDC",                                // EIP-712 domain name
  version: "2",                                // EIP-712 domain version
  escrow: "0x...",                             // Escrow contract address
  voucherStorage: "server" | "facilitator",   // Who stores vouchers

  // Dynamic per-buyer data (from scheme's enhancePaymentRequirements)
  voucher?: { ... },                           // Latest voucher (if exists)
  signature?: "0x...",                         // Voucher signature (if exists)
  account?: {                                  // Buyer's escrow account state
    balance: "10000000",
    assetAllowance: "115792...",
    assetPermitNonce: "0"
  }
}
// If voucher/signature present → aggregate; if absent → new voucher
```

The `voucherStorage` field declares where vouchers are stored. Both server and facilitator read this to determine their behavior.

---

## Voucher Storage Modes

Servers declare storage mode via `extra.voucherStorage` in payment requirements:

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

## Facilitator Custom Endpoints

The deferred scheme requires facilitator endpoints beyond the standard x402 interface:

| Endpoint | Purpose |
|----------|---------|
| `GET /deferred/buyers/:buyer` | Query on-chain account data + voucher (if facilitator stores vouchers) |
| `POST /deferred/vouchers/settle` | Submit voucher for on-chain settlement |
| `POST /deferred/vouchers/settleMany` | Batch on-chain settlement |

---

## Extensions Summary

| Extension | Type | Purpose |
|-----------|------|---------|
| `deferred-voucher-store` | FacilitatorExtension (optional) | Voucher storage capability for facilitators |

**Note:** No `ResourceServerExtension` is required for the deferred scheme. The `DeferredEvmScheme` handles buyer identification and voucher state injection directly via `enhancePaymentRequirements()` with transport context.

---

## Key Design Decisions

### 1. PAYER-IDENTIFIER Header

**Decision:** Client sends `PAYER-IDENTIFIER` header on initial request to identify themselves before payment.

**Rationale:** The x402 framework doesn't have a built-in mechanism to identify the payer before receiving a payment. In the standard flow, the server only learns who the payer is when they receive the signed payment. However, the deferred scheme requires knowing the buyer's identity upfront to:
- Look up their existing voucher history for aggregation
- Fetch their escrow account balance
- Determine if this is a new voucher or an aggregation

Without this header, every request would create a new voucher, defeating the purpose of aggregation.

### 2. Scheme-Based Voucher State (via `enhancePaymentRequirements`)

**Decision:** Dynamic per-buyer data (voucher state, account balances) is injected directly into `PaymentRequirements.extra` by the scheme's `enhancePaymentRequirements()` method.

**Rationale:** This requires an SDK modification to pass transport context to `enhancePaymentRequirements()`. With this change, the scheme can:
1. Extract the buyer from the `PAYER-IDENTIFIER` header via transport context
2. Fetch buyer state from the facilitator
3. Inject voucher data directly into `accepts[].extra`

This approach:
- Keeps all deferred scheme logic in the scheme implementation (not split between scheme and extension)
- Follows the same type guard pattern that extensions already use for transport-specific code
- Eliminates the need for a `deferred-scheme` ResourceServerExtension

**Alternative considered:** Using a `deferred-scheme` extension was considered, but extension hooks run after `enhancePaymentRequirements()` and can only write to `response.extensions`, not modify `accepts[].extra`. See "Proposed SDK Modification" section for details.

### 3. Facilitator Voucher Storage as Capability

**Decision:** The `deferred-voucher-store` is advertised as an optional capability in the facilitator's `/supported` response.

**Rationale:** Not all facilitators need to store vouchers. Some deployments prefer server-side storage for portability. Making it a capability allows:
- Facilitators to opt-in to the additional infrastructure requirement
- Servers to verify the capability before configuring `voucherStorage: "facilitator"`
- Clear contract between server and facilitator about who's responsible for storage

### 4. Pluggable Voucher Storage

**Decision:** Server chooses where to store vouchers via `extra.voucherStorage`. Both server and facilitator read this to determine behavior.

**Rationale:** Different deployment scenarios have different needs:
- **Server storage:** Portable, can switch facilitators, but requires database infrastructure
- **Facilitator storage:** Simpler for servers, but creates facilitator lock-in

Declaring this in `PaymentRequirements` ensures both parties agree on who's responsible.

### 5. Work Before Settlement

**Decision:** Server executes protected handler after verification but before settlement. Settlement failure doesn't block response.

**Rationale:** This follows the existing x402 pattern. For deferred payments specifically, "settlement" just stores the voucher—it doesn't move money on-chain yet. The risk of settlement failure is low and the voucher can be re-stored.

### 6. Separate On-Chain Settlement

**Decision:** On-chain settlement is decoupled from request lifecycle. Triggered manually or periodically.

**Rationale:** This is the core value proposition of the deferred scheme—batching many small payments into fewer on-chain transactions. Coupling settlement to each request would defeat this purpose.

### 7. Optional Gasless Deposit

**Decision:** Client can include a `deposit` object with permit and authorization signatures for gasless escrow funding during settlement.

**Rationale:** New buyers need to fund their escrow before vouchers are valid. Requiring a separate deposit transaction adds friction. The permit pattern (EIP-2612) combined with an escrow authorization allows the facilitator to execute the deposit on behalf of the buyer, creating a smoother onboarding experience.

---

## Proposed SDK Modification

The deferred scheme requires injecting per-buyer voucher state into `PaymentRequirements.extra`. Currently, the `SchemeNetworkServer.enhancePaymentRequirements()` hook doesn't receive transport context (HTTP headers, etc.), which prevents schemes from accessing request-specific data like the `PAYER-IDENTIFIER` header.

### Current Constraint

| Hook | Can modify `accepts[].extra`? | Has transport context? |
|------|------------------------------|------------------------|
| `SchemeNetworkServer.enhancePaymentRequirements()` | ✅ Yes | ❌ No |
| `ResourceServerExtension.enrichPaymentRequiredResponse()` | ❌ No (writes to `extensions`) | ✅ Yes |

Extensions already receive transport context and use type guards to handle different transports (HTTP, MCP). However, extensions can only write to `response.extensions`, not modify `accepts[].extra`.

### Proposed Change

Add an optional `transportContext` parameter to `enhancePaymentRequirements()`:

```typescript
// In @x402/core/types/mechanisms.ts
interface SchemeNetworkServer {
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    facilitatorExtensions: string[],
    transportContext?: unknown,  // NEW - optional parameter
  ): Promise<PaymentRequirements>;
}
```

### Implementation in x402ResourceServer

Pass transport context through the call chain:

```typescript
// In x402ResourceServer.buildPaymentRequirements()
const requirement = await SchemeNetworkServer.enhancePaymentRequirements(
  baseRequirements,
  { ...supportedKind, x402Version },
  facilitatorExtensions,
  transportContext,  // Pass through from HTTP/MCP layer
);
```

### Deferred Scheme Usage

The deferred scheme would use the same pattern as existing extensions (type guard + cast):

```typescript
import type { HTTPRequestContext } from "@x402/core/http";

function isHTTPRequestContext(ctx: unknown): ctx is HTTPRequestContext {
  return ctx !== null && typeof ctx === "object" && "method" in ctx && "adapter" in ctx;
}

export class DeferredEvmScheme implements SchemeNetworkServer {
  readonly scheme = "deferred";

  constructor(private facilitatorUrl: string) {}

  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: { x402Version: number; scheme: string; network: Network; extra?: Record<string, unknown> },
    facilitatorExtensions: string[],
    transportContext?: unknown,
  ): Promise<PaymentRequirements> {
    // Extract buyer from HTTP header (transport-specific)
    let buyer: string | undefined;
    if (isHTTPRequestContext(transportContext)) {
      buyer = transportContext.adapter.getHeader("PAYER-IDENTIFIER");
    }
    // Future: add MCP support
    // else if (isMCPToolContext(transportContext)) {
    //   buyer = transportContext._meta?.payerIdentifier;
    // }

    // Fetch buyer state from facilitator
    const buyerData = buyer
      ? await this.fetchBuyerData(buyer, paymentRequirements.payTo, paymentRequirements.asset)
      : null;

    return {
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        // Static metadata (from facilitator supportedKind)
        escrow: supportedKind.extra?.escrow,
        name: supportedKind.extra?.name,
        version: supportedKind.extra?.version,
        voucherStorage: supportedKind.extra?.voucherStorage,
        // Dynamic per-buyer data (present = aggregation, absent = new voucher)
        voucher: buyerData?.voucher,
        signature: buyerData?.signature,
        account: buyerData?.account,
      },
    };
  }

  private async fetchBuyerData(buyer: string, seller: string, asset: string) {
    const res = await fetch(
      `${this.facilitatorUrl}/deferred/buyers/${buyer}?seller=${seller}&asset=${asset}`
    );
    return res.json();
  }
}
```

### Impact Assessment

| Component | Change Required |
|-----------|----------------|
| `SchemeNetworkServer` interface | Add optional `transportContext?: unknown` param |
| `x402ResourceServer` | Pass context through ~2-3 call sites |
| Existing schemes (EVM, SVM, Stellar, Aptos) | None - parameter is optional, ignored |
| Deferred scheme | Implement transport-aware logic with type guards |

### Why This Approach

1. **Follows existing patterns**: Extensions already use type guards for transport-specific code (see `bazaar`, `offer-receipt` extensions)
2. **Non-breaking**: Optional parameter means existing schemes work unchanged
3. **Transport-agnostic**: Uses `unknown` type with runtime type guards, not tied to HTTP
4. **Minimal core changes**: ~10-15 lines in core, rest in deferred scheme
5. **Eliminates extension workaround**: No need for `deferred-scheme` ResourceServerExtension; scheme handles everything directly
