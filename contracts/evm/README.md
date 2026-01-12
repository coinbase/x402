# x402 EVM Contracts

Smart contracts for the x402 payment protocol on EVM chains.

## Overview

The `x402Permit2Proxy` contract enables trustless, gasless payments using [Permit2](https://github.com/Uniswap/permit2). It acts as a proxy that:

- Uses the **witness pattern** to cryptographically bind payment destinations
- Prevents facilitators from redirecting funds
- Supports both standard Permit2 and EIP-2612 flows
- Deploys to the **same address on all EVM chains** via CREATE2

**Deployed Address:** `0x40203F636c4EDFaFc36933837FFB411e1c031B50` (all chains)

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)

## Installation

```bash
# Install dependencies
forge install

# Build contracts
forge build
```

## Testing

```bash
# Run all tests
forge test

# Run with verbosity
forge test -vvv

# Run specific test file
forge test --match-path test/x402Permit2Proxy.t.sol

# Run with gas reporting
forge test --gas-report

# Run fuzz tests with more runs
forge test --fuzz-runs 1000

# Run invariant tests
forge test --match-contract X402InvariantsTest
```

### Fork Testing

Fork tests run against real Permit2 on Base Sepolia:

```bash
# Set up environment
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"

# Run fork tests
forge test --match-contract X402Permit2ProxyForkTest --fork-url $BASE_SEPOLIA_RPC_URL
```

## Deployment

### Compute Expected Address

```bash
forge script script/ComputeAddress.s.sol
```

### Deploy to Testnet

```bash
# Set environment variables
export PRIVATE_KEY="your_private_key"
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export BASESCAN_API_KEY="your_api_key"

# Deploy with verification
forge script script/Deploy.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify
```

### Deploy to Mainnet

```bash
export BASE_RPC_URL="https://mainnet.base.org"

forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify
```

## Vanity Address Mining

The deployment uses a vanity address starting with `0x4020`. To mine a new salt:

```bash
# Simple Solidity miner (slower)
forge script script/MineVanity.s.sol

# For faster mining, use create2crunch or the TypeScript miner
```

## Contract Architecture

```
src/
├── x402Permit2Proxy.sol      # Main proxy contract
└── interfaces/
    └── IPermit2.sol          # Permit2 interface

test/
├── x402Permit2Proxy.t.sol    # Unit tests
├── x402Permit2Proxy.fork.t.sol # Fork tests
├── invariants/
│   └── X402Invariants.t.sol  # Invariant tests
└── mocks/
    ├── MockERC20.sol
    ├── MockERC20Permit.sol
    ├── MockPermit2.sol
    └── MaliciousReentrant.sol

script/
├── Deploy.s.sol              # CREATE2 deployment
├── ComputeAddress.s.sol      # Address computation
└── MineVanity.s.sol          # Vanity address miner
```

## Key Functions

### `settle()`

Standard settlement path when user has already approved Permit2.

```solidity
function settle(
    ISignatureTransfer.PermitTransferFrom calldata permit,
    uint256 amount,
    address owner,
    Witness calldata witness,
    bytes calldata signature
) external;
```

### `settleWith2612()`

Settlement with EIP-2612 permit for fully gasless flow.

```solidity
function settleWith2612(
    EIP2612Permit calldata permit2612,
    ISignatureTransfer.PermitTransferFrom calldata permit,
    uint256 amount,
    address owner,
    Witness calldata witness,
    bytes calldata signature
) external;
```

## Security

- **Immutable:** No upgrade mechanism
- **No custody:** Contract never holds tokens
- **Destination locked:** Witness pattern enforces payTo address
- **Reentrancy protected:** Uses OpenZeppelin's ReentrancyGuard
- **Deterministic:** Same address on all chains via CREATE2

## Coverage

```bash
# Full coverage report (includes test/script files)
forge coverage

# Coverage for src/ contracts only (excludes mocks, tests, scripts)
forge coverage --no-match-coverage "(test|script)/.*" --offline
```

Current coverage: **100%** (lines, statements, branches, functions)

## Gas Snapshots

```bash
# Create snapshot
forge snapshot

# Compare against baseline
forge snapshot --diff
```

## License

Apache-2.0

