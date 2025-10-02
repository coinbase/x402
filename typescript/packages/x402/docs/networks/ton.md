## Explorer URLs

- Mainnet: https://tonviewer.com/transaction/<txid>
- Testnet: https://testnet.tonviewer.com/transaction/<txid>

# TON Blockchain Integration

x402 supports payments on The Open Network (TON) blockchain, including native TON and Jetton token transfers.

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
5. Facilitator verifies payment on-chain

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
