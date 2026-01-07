# @x402/evm-contracts Quickstart

## ✅ Setup Complete!

Your Hardhat project is integrated into the pnpm monorepo at `typescript/packages/contracts/evm/`.

## 🚀 Quick Commands

All commands can be run from anywhere in the monorepo using `pnpm --filter`:

### Build Package
```bash
pnpm --filter @x402/evm-contracts build
```

This runs:
1. `hardhat compile` → `dist-hardhat/` (artifacts, typechain)
2. `extract-abis.ts` → `src/abis/` (x402* ABIs only)
3. `tsup` → `dist/` (ESM + CJS package)

### Run Tests
```bash
# All tests
pnpm --filter @x402/evm-contracts test

# Unit tests only
pnpm --filter @x402/evm-contracts test:unit

# Fork tests (real Permit2 on Base Sepolia)
pnpm --filter @x402/evm-contracts test:fork

# With coverage
pnpm --filter @x402/evm-contracts test:coverage
```

### Local Development
```bash
# Start local Hardhat node
pnpm --filter @x402/evm-contracts node

# Deploy to local network (in another terminal)
pnpm --filter @x402/evm-contracts deploy:local
```

### Deployment
```bash
# Compute deterministic address
pnpm --filter @x402/evm-contracts compute-address

# Deploy to networks
pnpm --filter @x402/evm-contracts deploy:base-sepolia
pnpm --filter @x402/evm-contracts deploy:sepolia
pnpm --filter @x402/evm-contracts deploy:base

# Verify on block explorer
pnpm --filter @x402/evm-contracts verify:base-sepolia <address> <permit2-address>
```

### Code Quality
```bash
# Lint Solidity
pnpm --filter @x402/evm-contracts lint

# Format all code
pnpm --filter @x402/evm-contracts format

# Clean build artifacts
pnpm --filter @x402/evm-contracts clean
```

## 📁 Project Structure

```
packages/contracts/evm/
├── contracts/              # Solidity contracts
│   ├── x402Permit2Proxy.sol   # Main protocol contract
│   ├── interfaces/            # IPermit2, etc.
│   └── mocks/                 # Test mocks
├── scripts/                # Build & deploy scripts
│   ├── deploy-x402-proxy.ts   # CREATE2 deployment
│   ├── compute-address.ts     # Address computation
│   ├── extract-abis.ts        # ABI extraction
│   └── constants.ts           # Internal constants
├── test/                   # Contract tests
│   ├── x402Permit2Proxy.test.ts      # Unit tests (118 passing)
│   └── x402Permit2Proxy.fork.test.ts # Fork tests (9 passing)
├── src/                    # Package exports
│   ├── index.ts               # Main entry
│   ├── constants.ts           # Public constants
│   └── abis/                  # Auto-generated ABIs
├── dist/                   # Built package (gitignored)
│   ├── cjs/                   # CommonJS
│   └── esm/                   # ES Modules
└── dist-hardhat/           # Hardhat output (gitignored)
    ├── artifacts/
    ├── cache/
    └── typechain-types/
```

## 🔧 Environment Variables

Create a `.env` file for deployments:

```bash
# Required for live deployments
PRIVATE_KEY=your-private-key-here

# RPC URLs (optional, has defaults)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
SEPOLIA_RPC_URL=https://rpc.sepolia.org

# For contract verification
BASESCAN_API_KEY=your-basescan-api-key
```

## 📦 Package Exports

When published, the package exports:

```typescript
// Main entry
import { 
  x402Permit2ProxyAbi,
  PERMIT2_ADDRESS,
  X402_PERMIT2_PROXY_ADDRESS 
} from "@x402/evm-contracts";

// Just constants
import { PERMIT2_ADDRESS } from "@x402/evm-contracts/constants";

// Just ABIs
import { x402Permit2ProxyAbi } from "@x402/evm-contracts/abis";
```

## 💡 Tips

- ABIs are exported with `as const` for full TypeScript inference with viem
- The x402Permit2Proxy deploys to the same address on all chains (CREATE2)
- Use `compute-address` to verify the address before deploying
- Fork tests use real Permit2 on Base Sepolia for integration testing
- Gas reports: `REPORT_GAS=true pnpm --filter @x402/evm-contracts test`

## 📚 Resources

- [Hardhat Docs](https://hardhat.org/docs)
- [Permit2 Docs](https://docs.uniswap.org/contracts/permit2/overview)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Viem Docs](https://viem.sh/)
- [ABIType](https://abitype.dev/) - TypeScript types for ABIs
