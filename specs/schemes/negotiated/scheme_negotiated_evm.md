# Negotiated Scheme - EVM Implementation

## EVM-Specific Considerations

This document specifies how the negotiated scheme is implemented on EVM-compatible chains.

## Signature Scheme

Proposals use EIP-712 structured data signing:

```solidity
struct NegotiationProposal {
    bytes32 negotiationId;
    address proposer;
    address payTo;
    address asset;
    uint256 proposedAmount;
    uint256 maxAcceptable;
    uint256 volume;
    uint256 nonce;
    uint256 deadline;
}

bytes32 constant PROPOSAL_TYPEHASH = keccak256(
    "NegotiationProposal(bytes32 negotiationId,address proposer,address payTo,address asset,uint256 proposedAmount,uint256 maxAcceptable,uint256 volume,uint256 nonce,uint256 deadline)"
);
```

## Domain Separator

The EIP-712 domain separator for negotiation proposals:

```solidity
struct EIP712Domain {
    string name;
    string version;
    uint256 chainId;
    address verifyingContract;
}

EIP712Domain domain = EIP712Domain({
    name: "x402 Negotiated Payment",
    version: "1",
    chainId: block.chainid,
    verifyingContract: address(this)
});
```

## Integration with ERC-8004

The negotiated scheme can leverage ERC-8004 reputation registries for dynamic pricing:

```javascript
async function calculateReputationPrice(clientAddress, basePrice) {
    const reputation = await erc8004Registry.getReputation(clientAddress);
    const score = reputation.score;
    
    if (score >= 90) return basePrice * 0.5;  // 50% discount
    if (score >= 70) return basePrice * 0.75; // 25% discount
    if (score >= 50) return basePrice;        // Standard price
    return basePrice * 1.5;                    // Premium for low reputation
}
```

## Nonce Management

Each client address maintains a nonce to prevent replay attacks:

```typescript
interface NonceTracker {
  address: string;
  currentNonce: bigint;
  usedNonces: Set<bigint>;
}

function validateNonce(address: string, nonce: bigint): boolean {
  const tracker = getNonceTracker(address);
  if (tracker.usedNonces.has(nonce)) {
    return false;
  }
  tracker.usedNonces.add(nonce);
  return true;
}
```

## Gas Considerations

Negotiation adds minimal overhead:

- Signature verification: ~3,000 gas
- State updates: ~20,000 gas per negotiation round
- Settlement remains identical to exact scheme

## Example Implementation

```typescript
import { TypedDataDomain, TypedDataField } from 'ethers';

const domain: TypedDataDomain = {
  name: 'x402 Negotiated Payment',
  version: '1',
  chainId: 84532, // base-sepolia
  verifyingContract: '0x...'
};

const types: Record<string, TypedDataField[]> = {
  NegotiationProposal: [
    { name: 'negotiationId', type: 'bytes32' },
    { name: 'proposer', type: 'address' },
    { name: 'payTo', type: 'address' },
    { name: 'asset', type: 'address' },
    { name: 'proposedAmount', type: 'uint256' },
    { name: 'maxAcceptable', type: 'uint256' },
    { name: 'volume', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

const value = {
  negotiationId: '0x...',
  proposer: '0x...',
  payTo: '0x...',
  asset: '0x...',
  proposedAmount: BigInt('70000'),
  maxAcceptable: BigInt('80000'),
  volume: BigInt(100),
  nonce: BigInt(Date.now()),
  deadline: BigInt(Math.floor(Date.now() / 1000) + 30)
};

const signature = await wallet._signTypedData(domain, types, value);
```

## Settlement Process

Once a negotiation is accepted:

1. Server creates standard exact scheme payment requirements with the negotiated amount
2. Client provides payment using the exact scheme flow
3. Settlement proceeds identically to exact scheme
4. X-PAYMENT-RESPONSE header contains settlement proof

This ensures compatibility with existing exact scheme infrastructure while enabling dynamic pricing.

