# Scheme: `escrow` on `EVM`

## Summary

The `escrow` scheme on EVM uses a two-contract architecture:

- **Escrow Vault**: Singleton contract for internal balance accounting and lock/unlock
- **Session Manager**: Lifecycle management (open, record usage, settle)

This separation allows multiple session types to share one liquidity pool while maintaining independent lifecycle logic.

## Contract Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Escrow Vault (Singleton)                   │
├──────────────────────────────────────────────────────────────┤
│  State:                                                       │
│  - balances[user][token] → uint256                           │
│  - sessionLocks[sessionId] → uint256                         │
├──────────────────────────────────────────────────────────────┤
│  Functions:                                                   │
│  - deposit(token, amount)                                    │
│  - withdraw(token, amount)                                   │
│  - lockForSession(sessionId, agent, provider, token, amount) │
│  - unlockSession(sessionId, usedAmount)                      │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ Authorized calls only
                              │
┌──────────────────────────────────────────────────────────────┐
│                      Session Manager                          │
├──────────────────────────────────────────────────────────────┤
│  - openSession(gateway, deposit, duration) → sessionId       │
│  - recordUsage(sessionId, amount)                            │
│  - settleSession(sessionId)                                  │
│  - cancelSession(sessionId)                                  │
└──────────────────────────────────────────────────────────────┘
```

## PaymentPayload

### Session Open

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/session"
  },
  "accepted": {
    "scheme": "escrow",
    "network": "eip155:84532",
    "escrow": "0x...",
    "minDeposit": "1000000"
  },
  "payload": {
    "action": "open",
    "deposit": "5000000",
    "duration": "86400",
    "gatewaySlug": "my-api"
  }
}
```

### Usage Recording (Off-chain Signed)

```json
{
  "sessionId": "0x...",
  "usageAmount": "100000",
  "timestamp": 1703123456,
  "providerSignature": "0x..."
}
```

## Verification

Facilitators verify escrow payments by:

1. **Balance Check**: Client has sufficient vault balance for required deposit
2. **Session State**: Session is ACTIVE and not expired
3. **Usage Limit**: Request cost + current usage ≤ session deposit
4. **Provider Auth**: Provider signature valid for usage attestations

## Settlement

Settlement is atomic and handled by the escrow vault:

1. Session Manager calls `unlockSession(sessionId, usedAmount)`
2. Escrow Vault distributes: `usedAmount → provider balance`
3. Escrow Vault refunds: `deposit - usedAmount → client balance`
4. Events emitted for off-chain indexing

## Appendix

### Gas Efficiency

Internal balance accounting avoids ERC-20 transfers for each operation:

| Operation | With Internal Balances | Without |
|-----------|----------------------|---------|
| Deposit | 1 ERC-20 transfer | 1 ERC-20 transfer |
| 100 API calls | 0 transfers | 100 transfers |
| Settlement | 0-2 transfers | 0-2 transfers |

### Cross-Chain Considerations

For cross-chain sessions (e.g., client on Solana, provider on Base):

- Settlement proofs bridged via authorized relay
- Escrow vault validates relay signature
- Replay prevention via processed session tracking
