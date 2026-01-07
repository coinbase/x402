# @x402/evm-contracts

Smart contracts and ABIs for the x402 EVM payment protocol.

## Installation

```bash
npm install @x402/evm-contracts
# or
pnpm add @x402/evm-contracts
```

## Usage

```typescript
import { 
  x402Permit2ProxyAbi, 
  PERMIT2_ADDRESS, 
  X402_PERMIT2_PROXY_ADDRESS 
} from "@x402/evm-contracts";
import { getContract } from "viem";

// Use with viem - full type inference!
const contract = getContract({
  address: X402_PERMIT2_PROXY_ADDRESS,
  abi: x402Permit2ProxyAbi,
  client,
});

// TypeScript knows all function signatures
await contract.read.PERMIT2();
await contract.write.settle([permit, amount, owner, witness, signature]);
```

## Exports

| Export | Description |
|--------|-------------|
| `x402Permit2ProxyAbi` | ABI for the x402Permit2Proxy contract |
| `PERMIT2_ADDRESS` | Canonical Permit2 address (same on all chains) |
| `X402_PERMIT2_PROXY_ADDRESS` | x402Permit2Proxy address (same on all chains via CREATE2) |

## Development

### Setup

From the monorepo root:

```bash
cd typescript
pnpm install
```

### Commands

```bash
# Build (compile contracts + extract ABIs + bundle)
pnpm --filter @x402/evm-contracts build

# Run tests
pnpm --filter @x402/evm-contracts test

# Run fork tests (against real Permit2 on Base Sepolia)
pnpm --filter @x402/evm-contracts test:fork

# Run local Hardhat node
pnpm --filter @x402/evm-contracts node

# Deploy to local network
pnpm --filter @x402/evm-contracts deploy:local

# Deploy to Base Sepolia
pnpm --filter @x402/evm-contracts deploy:base-sepolia

# Compute deterministic deployment address
pnpm --filter @x402/evm-contracts compute-address

# Lint Solidity
pnpm --filter @x402/evm-contracts lint

# Format code
pnpm --filter @x402/evm-contracts format

# Clean build artifacts
pnpm --filter @x402/evm-contracts clean
```

## Project Structure

```
packages/contracts/evm/
├── contracts/           # Solidity smart contracts
│   ├── x402Permit2Proxy.sol
│   ├── interfaces/      # Contract interfaces
│   └── mocks/           # Test mocks
├── scripts/             # Deployment and utility scripts
│   ├── deploy-x402-proxy.ts
│   ├── compute-address.ts
│   └── extract-abis.ts
├── test/                # Contract tests
│   ├── x402Permit2Proxy.test.ts
│   └── x402Permit2Proxy.fork.test.ts
├── src/                 # TypeScript exports (auto-generated ABIs)
│   ├── index.ts
│   ├── constants.ts
│   └── abis/
├── dist/                # Built package (ESM + CJS)
└── dist-hardhat/        # Hardhat artifacts (gitignored)
```

## Deterministic Deployment

The x402Permit2Proxy contract is deployed to the same address on all EVM chains using CREATE2:

```
x402Permit2Proxy: 0xcE4c4C3721A5234A63ba39760Eb4Be0b1021a90a
```

Run `pnpm compute-address` to verify the address computation.

## Resources

- [Hardhat Documentation](https://hardhat.org/docs)
- [Permit2 Documentation](https://docs.uniswap.org/contracts/permit2/overview)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Viem Documentation](https://viem.sh/)
