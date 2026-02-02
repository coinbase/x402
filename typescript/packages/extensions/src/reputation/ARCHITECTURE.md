# 8004-Reputation Extension Architecture

## System Overview

```mermaid
graph TB
    subgraph "Resource Server (Agent)"
        RS[Resource Server]
        RE[Reputation Extension]
        DECL[declareReputationExtension]
    end
    
    subgraph "Client"
        CLIENT[x402 Client]
        FEEDBACK[Feedback Submission]
        AGG_CLIENT[Aggregator Client]
    end
    
    subgraph "Facilitator"
        FACIL[Facilitator]
        ATTEST[Attestation Enricher]
        SIGN[Sign Attestation]
    end
    
    subgraph "Aggregator"
        AGG[Aggregator Service]
        VALID[Validate Feedback]
        BATCH[Batch Submissions]
    end
    
    subgraph "Blockchain Networks"
        EVM[EVM Chains<br/>Base, Base Sepolia]
        SOL[Solana<br/>Mainnet, Devnet]
        REG[ERC-8004 Registries]
    end
    
    RS -->|PaymentRequired| CLIENT
    RE -->|Declare Identity| DECL
    CLIENT -->|PaymentPayload| FACIL
    FACIL -->|Settlement| ATTEST
    ATTEST -->|Signed Attestation| CLIENT
    CLIENT -->|Submit Feedback| AGG_CLIENT
    AGG_CLIENT -->|POST /feedback| AGG
    AGG -->|Validate| VALID
    VALID -->|Batch| BATCH
    BATCH -->|On-chain| EVM
    BATCH -->|On-chain| SOL
    EVM --> REG
    SOL --> REG
```

## Reputation Flow

```mermaid
sequenceDiagram
    participant Agent as Resource Server
    participant Client as x402 Client
    participant Facilitator
    participant Aggregator
    participant EVM as EVM Registry
    participant Solana as Solana Registry

    Note over Agent: 1. Agent declares reputation support
    Agent->>Client: PaymentRequired<br/>extensions.8004-reputation
    
    Note over Client: 2. Client makes payment
    Client->>Facilitator: PaymentPayload<br/>extensions.8004-reputation
    
    Note over Facilitator: 3. Facilitator settles payment
    Facilitator->>Client: SettlementResponse<br/>+ facilitatorAttestation
    
    Note over Client: 4. Client submits feedback
    Client->>Aggregator: POST /feedback<br/>+ taskRef + attestation
    
    Note over Aggregator: 5. Aggregator validates
    Aggregator->>Aggregator: Validate taskRef<br/>Check signature<br/>Verify attestation
    
    Note over Aggregator: 6. Batch submission
    Aggregator->>EVM: giveFeedback()<br/>(if EVM payment)
    Aggregator->>Solana: giveFeedback()<br/>(if Solana payment)
```

## Component Architecture

```mermaid
graph LR
    subgraph "Extension Modules"
        TYPES[types.ts<br/>Type Definitions]
        SERVER[server.ts<br/>Server Extension]
        ATTEST[attestation.ts<br/>Attestation Logic]
        AGG[aggregator.ts<br/>Client Submission]
        FACIL[facilitator.ts<br/>Validation & Utils]
        FETCH[fetchers/<br/>Chain Fetchers]
        AGGR[aggregation.ts<br/>Cross-Chain]
    end
    
    subgraph "Core Features"
        TB[Time-Bounded<br/>Attestations]
        EL[Evidence Level<br/>Hierarchy]
        FI[Facilitator<br/>Identity]
        RL[Rate Limiting]
        MA[Multi-Aggregator]
        CC[Cross-Chain<br/>Aggregation]
    end
    
    TYPES --> TB
    TYPES --> EL
    TYPES --> FI
    TYPES --> RL
    TYPES --> MA
    TYPES --> CC
    
    SERVER --> ATTEST
    SERVER --> TYPES
    ATTEST --> TB
    AGG --> EL
    AGG --> MA
    FACIL --> FI
    FACIL --> RL
    FACIL --> EL
    FETCH --> CC
    AGGR --> CC
```

## Evidence Level Hierarchy

```mermaid
graph TD
    START[Feedback Submission] --> CHECK1{Has taskRef?}
    CHECK1 -->|No| NONE[EvidenceLevel.NONE<br/>Score: 0]
    CHECK1 -->|Yes| PAYMENT[EvidenceLevel.PAYMENT<br/>Score: 25]
    
    PAYMENT --> CHECK2{Has facilitator<br/>attestation?}
    CHECK2 -->|No| PAYMENT
    CHECK2 -->|Yes| SETTLEMENT[EvidenceLevel.SETTLEMENT<br/>Score: 50-65]
    
    SETTLEMENT --> CHECK3{Has agent<br/>signature?}
    CHECK3 -->|No| SETTLEMENT
    CHECK3 -->|Yes| SERVICE[EvidenceLevel.SERVICE<br/>Score: 75]
    
    SERVICE --> CHECK4{Has both<br/>attestation + signature<br/>AND recent?}
    CHECK4 -->|No| SERVICE
    CHECK4 -->|Yes, <1hr| FULL[EvidenceLevel.FULL<br/>Score: 100]
    CHECK4 -->|Yes, >1hr| SERVICE_DECAY[EvidenceLevel.FULL<br/>Score: 90-75]
```

## Cross-Chain Support

```mermaid
graph TB
    subgraph "EVM Chains"
        BASE[Base Mainnet<br/>eip155:8453]
        BASESEP[Base Sepolia<br/>eip155:84532]
        EVM_REG[ERC-8004 Contracts<br/>Identity + Reputation]
    end
    
    subgraph "Solana Chains"
        SOL_MAIN[Solana Mainnet<br/>solana:5eykt4...]
        SOL_DEV[Solana Devnet<br/>solana:EtWTR...]
        SOL_REG[SATI Program<br/>PDAs]
    end
    
    subgraph "Cross-Chain Utilities"
        NORM[normalizeAddress<br/>EVM: lowercase hex<br/>Solana: base58]
        ALGO[validateSignerAlgorithm<br/>EVM: secp256k1<br/>Solana: ed25519]
        FETCHER[ChainFeedbackFetcher<br/>EVMFeedbackFetcher<br/>SolanaFeedbackFetcher]
    end
    
    BASE --> EVM_REG
    BASESEP --> EVM_REG
    SOL_MAIN --> SOL_REG
    SOL_DEV --> SOL_REG
    
    NORM --> BASE
    NORM --> SOL_MAIN
    ALGO --> BASE
    ALGO --> SOL_MAIN
    FETCHER --> EVM_REG
    FETCHER --> SOL_REG
```

## Multi-Aggregator Flow

```mermaid
graph LR
    CLIENT[Client] -->|1. Submit| PRIMARY[Primary Aggregator<br/>https://x402.dexter.cash/feedback]
    CLIENT -->|2. Fallback| FALLBACK1[Fallback 1<br/>https://backup1.com/feedback]
    CLIENT -->|3. Fallback| FALLBACK2[Fallback 2<br/>https://backup2.com/feedback]
    
    PRIMARY -->|Success| RESULT[Result]
    FALLBACK1 -->|Success| RESULT
    FALLBACK2 -->|Success| RESULT
    
    PRIMARY -->|Failure| FALLBACK1
    FALLBACK1 -->|Failure| FALLBACK2
    
    RESULT -->|Minimum 1 success| OK[✓ Accepted]
    FALLBACK2 -->|All failed| ERR[✗ Rejected]
```

## Facilitator Attestation Flow

```mermaid
sequenceDiagram
    participant Facilitator
    participant Settlement
    participant Message
    participant Hash
    participant Sign
    participant Attestation

    Note over Facilitator: After successful settlement
    Settlement->>Message: Build message<br/>taskRef || amount || asset ||<br/>payTo || payer ||<br/>settledAt || validUntil
    Message->>Hash: keccak256(message)
    Hash->>Sign: Sign with facilitator key
    Sign->>Attestation: Create FacilitatorAttestation
    Attestation->>Settlement: Add to response.extensions
```

## Rate Limiting & Spam Prevention

```mermaid
graph TD
    SUBMIT[Feedback Submission] --> CHECK1{Minimum payment<br/>met?}
    CHECK1 -->|No| REJECT1[Reject: payment_below_minimum]
    CHECK1 -->|Yes| CHECK2{Rate limit<br/>exceeded?}
    
    CHECK2 -->|Yes| REJECT2[Reject: rate_limited]
    CHECK2 -->|No| CHECK3{Duplicate<br/>taskRef?}
    
    CHECK3 -->|Yes| REJECT3[Reject: duplicate_feedback]
    CHECK3 -->|No| CHECK4{Attestation<br/>expired?}
    
    CHECK4 -->|Yes| REJECT4[Reject: attestation_expired]
    CHECK4 -->|No| VALIDATE[Validate signature]
    VALIDATE -->|Invalid| REJECT5[Reject: invalid_client_signature]
    VALIDATE -->|Valid| ACCEPT[✓ Accept & Queue]
```

## Cross-Chain Aggregation Process

```mermaid
graph TB
    START[Start Aggregation] --> REGS[Agent Registrations<br/>Multiple Chains]
    
    REGS --> LOOP{For each<br/>registration}
    
    LOOP --> EXTRACT[Extract Network<br/>from CAIP-10]
    EXTRACT --> FETCHER{Select<br/>Fetcher}
    
    FETCHER -->|EVM| EVM_FETCH[EVMFeedbackFetcher<br/>Query contract]
    FETCHER -->|Solana| SOL_FETCH[SolanaFeedbackFetcher<br/>Query program]
    
    EVM_FETCH --> FEEDBACK[Collect Feedback]
    SOL_FETCH --> FEEDBACK
    
    FEEDBACK --> LOOP
    LOOP -->|Done| WEIGHT[Calculate Weighted Score<br/>Time decay + Evidence quality]
    
    WEIGHT --> BREAKDOWN[Chain Breakdown]
    BREAKDOWN --> RESULT[CrossChainReputation<br/>- totalFeedbackCount<br/>- weightedScore<br/>- chainBreakdown]
```

## File Structure

```
typescript/packages/extensions/src/reputation/
├── types.ts              # Core type definitions
├── attestation.ts        # Facilitator attestation creation/verification
├── aggregator.ts         # Client feedback submission
├── facilitator.ts        # Validation & utility functions
├── server.ts             # Server extension & declaration
├── aggregation.ts        # Cross-chain reputation aggregation
├── index.ts              # Public API exports
└── fetchers/
    ├── index.ts          # Factory for chain-specific fetchers
    ├── evm.ts            # EVM feedback fetcher
    └── solana.ts         # Solana feedback fetcher
```

## Key Enhancements Summary

| Enhancement | Module | Key Features |
|------------|--------|--------------|
| **Time-Bounded Attestations** | `attestation.ts` | `validUntil` field, expiration validation |
| **Evidence Hierarchy** | `facilitator.ts`, `aggregator.ts` | 5 levels (NONE→FULL), auto-computation |
| **Facilitator Identity** | `facilitator.ts` | ERC-8004 validation, cross-chain address normalization |
| **Rate Limiting** | `facilitator.ts` | Per-client limits, minimum payment checks |
| **Multi-Aggregator** | `aggregator.ts` | Fallback endpoints, parallel submission |
| **Cross-Chain Aggregation** | `aggregation.ts`, `fetchers/` | Chain-specific fetchers, weighted scoring |
