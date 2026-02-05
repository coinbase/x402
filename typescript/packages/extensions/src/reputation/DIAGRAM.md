# 8004-Reputation Extension - Visual Diagrams

## Quick Reference Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    x402 Payment Flow                            │
│              with 8004-Reputation Extension                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Agent      │────────▶│   Client     │────────▶│ Facilitator  │
│ (Server)     │ 402     │              │ Payload │              │
└──────────────┘         └──────────────┘         └──────────────┘
      │                        │                        │
      │ Declare                │                        │
      │ Reputation             │                        │
      ▼                        │                        │
┌──────────────┐               │                        │
│ Reputation   │               │                        │
│ Extension    │               │                        │
│ Declaration  │               │                        │
└──────────────┘               │                        │
      │                        │                        │
      │                        │                        │
      │                        │  Settlement +         │
      │                        │  Attestation           │
      │                        │◀───────────────────────┘
      │                        │
      │                        │ Submit Feedback
      │                        ▼
      │                 ┌──────────────┐
      │                 │  Aggregator  │
      │                 │   Service    │
      │                 └──────────────┘
      │                        │
      │                        │ Batch & Submit
      │                        ▼
      │                 ┌──────────────┐
      │                 │  Blockchain   │
      │                 │   Registry    │
      │                 └──────────────┘
      │                        │
      │                        │ Query
      │                        ▼
      │                 ┌──────────────┐
      │                 │  Reputation  │
      │                 │   Score      │
      │                 └──────────────┘
```

## Evidence Level Decision Tree

```
                    Feedback Submission
                           │
                           ▼
                    ┌──────────────┐
                    │ Has taskRef?  │
                    └──────────────┘
                           │
            ┌───────────────┴───────────────┐
            │                                │
           NO                               YES
            │                                │
            ▼                                ▼
    ┌──────────────┐                ┌──────────────┐
    │ NONE (0)     │                │ PAYMENT (25) │
    └──────────────┘                └──────────────┘
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │ Has attestation?│
                                    └──────────────┘
                                            │
                            ┌───────────────┴───────────────┐
                            │                                │
                           NO                               YES
                            │                                │
                            ▼                                ▼
                    ┌──────────────┐                ┌──────────────┐
                    │ PAYMENT (25) │                │SETTLEMENT(50)│
                    └──────────────┘                └──────────────┘
                                                            │
                                                            ▼
                                                    ┌──────────────┐
                                                    │ Has agent    │
                                                    │ signature?   │
                                                    └──────────────┘
                                                            │
                            ┌───────────────────────────────┴───────────────────────────────┐
                            │                                                               │
                           NO                                                              YES
                            │                                                               │
                            ▼                                                               ▼
                    ┌──────────────┐                                                ┌──────────────┐
                    │SETTLEMENT(50)│                                                │SERVICE (75)  │
                    └──────────────┘                                                └──────────────┘
                                                                                            │
                                                                                            ▼
                                                                                    ┌──────────────┐
                                                                                    │ Has both +   │
                                                                                    │ recent?      │
                                                                                    └──────────────┘
                                                                                            │
                                    ┌───────────────────────────────────────────────────────┴──────────────┐
                                    │                                                                      │
                                   NO                                                                     YES
                                    │                                                                      │
                                    ▼                                                                      ▼
                            ┌──────────────┐                                                    ┌──────────────┐
                            │SERVICE (75)  │                                                    │ FULL (100)   │
                            └──────────────┘                                                    └──────────────┘
```

## Cross-Chain Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Cross-Chain Reputation                        │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────┐              ┌─────────────────────┐
│   EVM Networks      │              │  Solana Networks    │
│                     │              │                     │
│  Base (8453)        │              │  Mainnet (5eykt4)   │
│  Base Sepolia       │              │  Devnet (EtWTR)      │
│  (84532)            │              │                     │
└─────────────────────┘              └─────────────────────┘
         │                                    │
         │ ERC-8004                           │ SATI
         │ Contracts                          │ Program
         ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│ Identity Registry   │              │  Agent Program       │
│ Reputation Registry │              │  (PDAs)              │
└─────────────────────┘              └─────────────────────┘
         │                                    │
         └────────────────┬───────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  ChainFeedbackFetcher │
              │  Factory              │
              └───────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌─────────────────────┐        ┌─────────────────────┐
│ EVMFeedbackFetcher  │        │ SolanaFeedbackFetcher│
│ - viem/ethers       │        │ - @solana/web3.js    │
│ - Contract calls    │        │ - Account queries    │
└─────────────────────┘        └─────────────────────┘
          │                               │
          └───────────────┬───────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Aggregate Reputation │
              │  - Weighted scoring   │
              │  - Time decay         │
              │  - Evidence quality   │
              └───────────────────────┘
```

## Multi-Aggregator Submission

```
                    Client Submission
                           │
                           ▼
              ┌────────────────────────┐
              │  submitToMultiple     │
              │  Aggregators()        │
              └────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Primary     │  │  Fallback 1   │  │  Fallback 2  │
│  Aggregator  │  │               │  │               │
└──────────────┘  └──────────────┘  └──────────────┘
        │                  │                  │
        │ POST /feedback   │ POST /feedback   │ POST /feedback
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Response 1  │  │  Response 2  │  │  Response 3   │
└──────────────┘  └──────────────┘  └──────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Check minimum         │
              │  successful (default:1)│
              └────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌──────────────┐                    ┌──────────────┐
│  ✓ Success   │                    │  ✗ Failure   │
│  (≥1 success)│                    │  (all failed)│
└──────────────┘                    └──────────────┘
```

## Facilitator Attestation Creation

```
┌─────────────────────────────────────────────────────────────┐
│         Facilitator Attestation Message Building            │
└─────────────────────────────────────────────────────────────┘

Input Parameters:
├── taskRef: "eip155:8453:0x123abc..."
├── settledAmount: "1000"
├── settledAsset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
├── payTo: "0xPayTo..."
├── payer: "0xPayer..."
├── settledAt: 1737763200
└── validUntil: 1740355200 (settledAt + 30 days)

                           │
                           ▼
              ┌────────────────────────┐
              │  Concatenate Fields   │
              │  (UTF-8 encoding)      │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Build Message:        │
              │  taskRef || amount ||   │
              │  asset || payTo ||      │
              │  payer || settledAt || │
              │  validUntil            │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Hash Message          │
              │  keccak256(message)    │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Sign Hash             │
              │  sign(hash, privateKey) │
              └────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  FacilitatorAttestation│
              │  - facilitatorId       │
              │  - settledAt           │
              │  - validUntil          │
              │  - attestationSignature│
              └────────────────────────┘
```

## Rate Limiting & Validation Flow

```
                    Feedback Submission
                           │
                           ▼
              ┌────────────────────────┐
              │  Check Duplicate      │
              │  (by taskRef)         │
              └────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
       YES                                   NO
        │                                     │
        ▼                                     ▼
┌──────────────┐                    ┌──────────────┐
│  Reject:     │                    │  Check       │
│  duplicate   │                    │  Expiration  │
└──────────────┘                    └──────────────┘
                                            │
                            ┌───────────────┴───────────────┐
                            │                                │
                          EXPIRED                          VALID
                            │                                │
                            ▼                                ▼
                    ┌──────────────┐                ┌──────────────┐
                    │  Reject:     │                │  Check       │
                    │  expired     │                │  Settlement  │
                    └──────────────┘                └──────────────┘
                                                            │
                                            ┌───────────────┴───────────────┐
                                            │                                │
                                         NOT FOUND                        FOUND
                                            │                                │
                                            ▼                                ▼
                                    ┌──────────────┐                ┌──────────────┐
                                    │  Reject:     │                │  Check       │
                                    │  invalid_ref │                │  Min Payment │
                                    └──────────────┘                └──────────────┘
                                                                           │
                                                           ┌───────────────┴───────────────┐
                                                           │                                │
                                                        BELOW                           MEETS
                                                           │                                │
                                                           ▼                                ▼
                                                   ┌──────────────┐                ┌──────────────┐
                                                   │  Reject:     │                │  Check       │
                                                   │  below_min   │                │  Rate Limit │
                                                   └──────────────┘                └──────────────┘
                                                                                           │
                                                                           ┌───────────────┴───────────────┐
                                                                           │                                │
                                                                        EXCEEDED                        WITHIN
                                                                           │                                │
                                                                           ▼                                ▼
                                                                   ┌──────────────┐                ┌──────────────┐
                                                                   │  Reject:     │                │  Verify      │
                                                                   │  rate_limit  │                │  Signature   │
                                                                   └──────────────┘                └──────────────┘
                                                                                                           │
                                                                                           ┌───────────────┴───────────────┐
                                                                                           │                                │
                                                                                        INVALID                         VALID
                                                                                           │                                │
                                                                                           ▼                                ▼
                                                                                   ┌──────────────┐                ┌──────────────┐
                                                                                   │  Reject:     │                │  ✓ Accept   │
                                                                                   │  invalid_sig │                │  & Queue    │
                                                                                   └──────────────┘                └──────────────┘
```
