# Scheme: `zk-relay` (EVM)

## Summary

EVM-specific implementation details for the `zk-relay` scheme. This document covers the smart contract interface, proof encoding, and on-chain verification requirements for EVM-compatible networks.

## Smart Contract Interface

### Shield (Deposit)

```solidity
function shieldETH(
    bytes calldata proof,
    bytes32 commitment,
    uint256 amount,
    uint256 assetId
) external payable;
```

The client deposits a fixed denomination of ETH and provides a commitment that encodes the note's secret, nullifier, amount, and asset identifier. The contract inserts the commitment into a 24-level Poseidon Merkle tree and emits a `Deposit` event.

### Unshield (Withdrawal via Facilitator)

```solidity
function unshield(
    bytes calldata proof,
    bytes32 nullifierHash,
    uint256 amount,
    uint256 assetId,
    address recipient,
    bytes32 root
) external;
```

Only callable by a whitelisted relayer address. The contract verifies the ZK proof on-chain using a Solidity verifier generated from the same proof system (UltraHonk). If verification passes, the contract:

1. Marks the nullifier as spent
2. Calculates the protocol fee (configurable basis points)
3. Sends `amount - fee` to the recipient
4. Sends the fee to the treasury address
5. Emits an `Unshield` event

### Access Control

- `relayers`: mapping of authorized facilitator addresses
- `owner`: can add/remove relayers, pause the contract, update fee parameters
- `treasury`: receives protocol fees

## Proof Encoding

The proof is encoded as a single `bytes` blob in the UltraHonk format:

- Generated client-side using `@aztec/bb.js` (WASM)
- Serialized as a flat byte array of field elements (32 bytes each)
- Passed directly to the Solidity verifier's `verify()` function
- The verifier is generated from `bb.js` (not the `bb` CLI) to ensure version alignment

## Public Inputs

The circuit exposes the following public inputs for on-chain verification:

| Index | Field           | Description                            |
|-------|-----------------|----------------------------------------|
| 0     | root            | Merkle tree root at time of proof      |
| 1     | nullifierHash   | Hash of (nullifier, leafIndex)         |
| 2     | amount          | Withdrawal amount in wei               |
| 3     | assetId         | Asset identifier (0 for native ETH)    |
| 4     | recipient       | Recipient address as uint256           |

## Gas Costs

| Operation       | Gas (approx) |
|-----------------|-------------|
| shieldETH       | ~320,000    |
| unshield        | ~380,000    |
| privateTransfer | ~400,000    |

## Rate Limiting

The contract enforces two tiers of rate limiting:

- **Per-address**: 50 ETH per hour for both shield and unshield operations
- **Global per-block**: configurable maximum to prevent block stuffing

## Events

```solidity
event Deposit(bytes32 indexed commitment, uint256 leafIndex, uint256 amount, uint256 assetId, uint256 timestamp);
event Unshield(bytes32 indexed nullifierHash, address indexed recipient, uint256 amount, uint256 assetId, uint256 fee);
event PrivateTransfer(bytes32 indexed nullifierHash, bytes32 indexed newCommitment, uint256 timestamp);
```

## Network Deployment

| Network | Contract Address                             | Deploy Block |
|---------|----------------------------------------------|-------------|
| Base    | `0x278652aA8383cBa29b68165926d0534e52BcD368` | 42230487    |
