# TON in x402

**Rails:** `TON/exact`  supports native TON and Jettons via TonConnect.

- **Network IDs (CAIP‑2):** `ton:mainnet` , `ton:testnet` 
- **Assets:**
  - Native TON (decimals = 9)
  - Jetton (decimals per token, read metadata; USDT commonly 6)
- **Memo/Reference:**
  - Native: comment text = `invoiceId` 
  - Jetton: `forward_payload`  should carry `invoiceId`  (e.g. `x402:<id>` ) and `forward_ton_amount=1` 
- **Facilitator:** verifies incoming payment by (to, amount, memo) for native, or Jetton transfer event by (to, master, amount, memo) for jettons.
- **RPC:** pluggable; configure via `TON_RPC` .
