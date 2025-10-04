# TON Blockchain Integration

x402 supports payments on The Open Network (TON) blockchain, including native TON and Jetton token transfers.

## Explorer URLs

- Mainnet: https://tonviewer.com/transaction/<txid>
- Testnet: https://testnet.tonviewer.com/transaction/<txid>

## Supported Assets

- **Native TON**: `ton:mainnet` or `ton:testnet` networks
- **Jettons**: Any Jetton token (USDT, USDC, etc.) via TonConnect

### Native vs Jetton (memo placement)

| Aspect | Native TON | Jetton |
|--------|------------|--------|
| Memo location | Transaction comment (`memo`) | Jetton transfer `forward_payload` |
| Fee structure | Gas only | Gas + `forward_ton_amount` (≥ 1 nanoton typical) |
| Verification | Lookup tx by `to, amount, memo` | Parse Jetton transfer event by `to, master, amount, memo` |

## Fees and Requirements

### Minimal TON Balance Required
Even for Jetton payments, users need a small TON balance (~0.01-0.02 TON) for:
- Gas fees for Jetton transfer transaction
- forward_ton_amount in Jetton payload (typical minimum ≥ 1 nanoton)

### Transaction Fees
- Native TON: ~0.005-0.01 TON per transaction
- Jetton transfers: ~0.01-0.02 TON (includes Jetton wallet interaction + forward fees)

## Implementation

### RPC Client

x402 provides a multi-provider RPC client with automatic fallback:

```typescript
import { createTonApiRpc, createTonCenterRpc, createMultiProviderRpc } from 'x402';

// Single provider (TonAPI)
const rpc = createTonApiRpc(process.env.TONAPI_KEY);

// Single provider (TonCenter)
const rpc = createTonCenterRpc(process.env.TONCENTER_KEY);

// Multi-provider with fallback
const rpc = createMultiProviderRpc({
  tonApiKey: process.env.TONAPI_KEY,
  toncenterKey: process.env.TONCENTER_KEY,
  customEndpoints: [
    { name: 'custom', endpoint: 'https://custom.ton.api', apiKey: 'key' }
  ]
});
```

**Features:**
- Automatic address normalization (bounceable ↔ non-bounceable)
- Multi-provider fallback (tonapi → toncenter)
- Retry logic with configurable attempts and delay
- Support for native TON and Jetton transfers

### Facilitator Helpers

```typescript
import { verifyTonPayment, verifyTonPaymentBatch, verifyTonPaymentWithRetry } from 'x402';

// Single payment verification
const result = await verifyTonPayment({
  memo: 'x402:invoice-001',
  to: 'UQA...',
  asset: { kind: 'native', symbol: 'TON', decimals: 9 },
  amountAtomic: 1000000n,
  network: 'ton:mainnet',
  rpc,
  validUntil: Date.now() + 3600000,
  usedTxIds: new Set(['tx1', 'tx2'])
});

// Batch verification
const results = await verifyTonPaymentBatch([
  { memo: 'x402:inv-1', ... },
  { memo: 'x402:inv-2', ... },
]);

// With automatic retry (for indexing delays)
const result = await verifyTonPaymentWithRetry(
  { memo: 'x402:invoice', ... },
  { maxRetries: 5, retryDelay: 2000 }
);
```

**Response:**
```typescript
{
  success: true,
  txHash: 'abc123...',
  explorerUrl: 'https://tonviewer.com/transaction/abc123...',
  network: 'ton:mainnet'
}
```

## TonConnect Integration

x402 uses TonConnect for wallet connections and transaction signing.

### X-PAYMENT Header Example
```http
X-PAYMENT: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzY2hlbWU...
```

### Request Flow
1. Client receives 402 response with TON payment requirements
2. User connects TON wallet via TonConnect
3. Client builds transaction payload (native or Jetton)
4. Wallet signs and broadcasts transaction
5. Facilitator verifies payment on-chain using `verifyTonPayment()`

## API Examples

### Verify Payment (cURL)
```bash
curl -X POST https://api.facilitator.com/x402/verify/ton/exact \
  -H "Content-Type: application/json" \
  -d '{
    "scheme": "exact",
    "network": "ton:mainnet",
    "txid": "0x...",
    "asset": {"kind": "native", "symbol": "TON", "decimals": 9},
    "amountAtomic": "1000000000",
    "memo": "x402:invoice123"
  }'
```

#### Verify with optional parameters
```bash
curl -X POST https://api.facilitator.com/x402/verify/ton/exact \
  -H "Content-Type: application/json" \
  -d '{
    "scheme": "exact",
    "network": "ton:testnet",
    "to": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
    "asset": {"kind": "native", "symbol": "TON", "decimals": 9},
    "amountAtomic": "1000000000",
    "memo": "x402:invoice_optional",
    "validUntil": 1735753200000,
    "usedTxIds": ["EIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXYZ"]
  }'
```

Notes:
- `validUntil` (ms epoch) – opcjonalna data wygaśnięcia; po czasie verifier zwróci `EXPIRED`.
- `usedTxIds` – opcjonalna lista/zbiór txid użytych już wcześniej; verifier zwróci `REPLAY_DETECTED` przy duplikacie.

### Jetton Transfer Payload Structure
```json
{
  "address": "EQC8rUZLpFGnD8V4V3x2XjWNJM8I0m5OUNwXa5qjHKMHqbk",
  "amount": "0",
  "payload": "base64-encoded-jetton-transfer-cell"
}
```

## Additional cURL Examples

### Verify Jetton Payment (cURL)
```bash
curl -X POST https://api.facilitator.com/x402/verify/ton/exact \
  -H "Content-Type: application/json" \
  -d '{
    "scheme": "exact",
    "network": "ton:testnet",
    "txid": "0x...",
    "to": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
    "asset": {"kind": "jetton", "master": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c", "decimals": 6},
    "amountAtomic": "1000000",
    "memo": "x402:invoice123"
  }'
```

### 2) Verify Native TON by memo (no txid)
```bash
curl -X POST https://api.facilitator.com/x402/verify/ton/exact \
  -H "Content-Type: application/json" \
  -d '{
    "scheme": "exact",
    "network": "ton:testnet",
    "to": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
    "asset": {"kind": "native", "symbol": "TON", "decimals": 9},
    "amountAtomic": "1000000000",
    "memo": "x402:testnet_invoice_001"
  }'
```

### 3) Verify Jetton (e.g. USDT 6 decimals)
```bash
curl -X POST https://api.facilitator.com/x402/verify/ton/exact \
  -H "Content-Type: application/json" \
  -d '{
    "scheme": "exact",
    "network": "ton:mainnet",
    "to": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
    "asset": {"kind": "jetton", "master": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c", "decimals": 6},
    "amountAtomic": "2500000",
    "memo": "x402:invoice_jetton_777"
  }'
```

### 4) With expiry (validUntil)
```bash
curl -X POST https://api.facilitator.com/x402/verify/ton/exact \
  -H "Content-Type: application/json" \
  -d '{
    "scheme": "exact",
    "network": "ton:mainnet",
    "txid": "EIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABCD",
    "to": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
    "asset": {"kind": "native", "symbol": "TON", "decimals": 9},
    "amountAtomic": "1000000000",
    "memo": "x402:limited_time_invoice",
    "validUntil": 1735753200000
  }'
```

### 5) With replay protection (usedTxIds)
```bash
curl -X POST https://api.facilitator.com/x402/verify/ton/exact \
  -H "Content-Type: application/json" \
  -d '{
    "scheme": "exact",
    "network": "ton:testnet",
    "txid": "EIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXYZ",
    "to": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
    "asset": {"kind": "native", "symbol": "TON", "decimals": 9},
    "amountAtomic": "1000000000",
    "memo": "x402:invoice_replay_guard",
    "usedTxIds": ["EIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXYZ"]
  }'
```

### 6) Jetton + expiry + replay (combined)
```bash
curl -X POST https://api.facilitator.com/x402/verify/ton/exact \
  -H "Content-Type: application/json" \
  -d '{
    "scheme": "exact",
    "network": "ton:testnet",
    "to": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
    "asset": {"kind": "jetton", "master": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c", "decimals": 6},
    "amountAtomic": "5000000",
    "memo": "x402:pack_jetton_01",
    "validUntil": 1735753200000,
    "usedTxIds": ["EIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPQR"]
  }'
```

## Error Codes

| Error Code | Description | Suggested HTTP Status |
|------------|-------------|----------------------|
| `TX_NOT_FOUND` | Transaction not found on-chain | 402 Payment Required |
| `AMOUNT_MISMATCH` | Payment amount doesn't match expected | 400 Bad Request |
| `TO_MISMATCH` | Recipient address doesn't match | 400 Bad Request |
| `MEMO_MISMATCH` | Memo/comment doesn't match expected | 400 Bad Request |
| `INVALID_MEMO` | Memo contains invalid characters | 400 Bad Request |
| `EXPIRED` | Payment expired (past validUntil) | 410 Gone |
| `REPLAY_DETECTED` | Transaction ID already used | 409 Conflict |
| `JETTON_MASTER_MISMATCH` | Jetton contract doesn't match | 400 Bad Request |

## Best Practices

### Security
- ✅ Always use `x402:` prefix for memos
- ✅ Validate `amountAtomic` matches expected value
- ✅ Use `usedTxIds` Set to prevent replay attacks
- ✅ Set reasonable `validUntil` timeouts (e.g., 1 hour)
- ✅ Store API keys in environment variables

### Performance
- ✅ Use `createMultiProviderRpc()` for automatic fallback
- ✅ Use `verifyTonPaymentBatch()` for multiple invoices
- ✅ Use `verifyTonPaymentWithRetry()` for indexing delays
- ✅ Cache RPC client instances (don't create per request)

### Monitoring
- ✅ Log all verification attempts with txid and reason
- ✅ Monitor `TX_NOT_FOUND` rate (may indicate indexing issues)
- ✅ Track `REPLAY_DETECTED` (potential security concern)
- ✅ Alert on high error rates

### Testing
The implementation includes comprehensive test coverage:
- 29 RPC client tests (600+ lines)
- 21 facilitator helper tests (550+ lines)
- 12 integration tests (344 lines)

Run tests: `pnpm test ton`
