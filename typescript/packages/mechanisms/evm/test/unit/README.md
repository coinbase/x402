# EVM Unit Tests

Comprehensive unit test suite for the x402 EVM mechanism.

## Test Structure

```
test/unit/
├── index.test.ts          # Smoke tests for main exports
├── constants.test.ts      # EIP-712 types and EIP-3009 ABI tests
├── types.test.ts          # Payload type structure tests
├── signer.test.ts         # Signer converter function tests
├── utils.test.ts          # Utility function tests (chain ID, nonce)
├── service.test.ts        # ExactEvmService tests (price parsing)
└── v1/
    ├── index.test.ts      # V1 exports smoke tests
    ├── client.test.ts     # ExactEvmClientV1 tests
    └── facilitator.test.ts # ExactEvmFacilitatorV1 tests
```

## Test Coverage

### Core Components (44 tests)
- **index.test.ts** (4 tests) - Export verification
- **constants.test.ts** (8 tests) - authorizationTypes, eip3009ABI validation
- **types.test.ts** (3 tests) - ExactEvmPayloadV1/V2 structure
- **signer.test.ts** (2 tests) - Identity converter functions
- **utils.test.ts** (10 tests) - Chain ID mapping, nonce generation
- **service.test.ts** (17 tests) - Price parsing for all networks and formats

### V1 Implementation (21 tests)
- **v1/index.test.ts** (4 tests) - V1 export verification
- **v1/client.test.ts** (8 tests) - V1 client payload creation
  - V1 payload structure (scheme/network fields)
  - maxAmountRequired usage
  - EIP-712 signing
  - Authorization field validation
  - Time window validation
- **v1/facilitator.test.ts** (9 tests) - V1 facilitator verification & settlement
  - Scheme/network matching
  - Amount verification (maxAmountRequired)
  - Balance checks
  - Recipient validation
  - Settlement flow

## Running Tests

```bash
# Run all unit tests (fast, no network calls)
pnpm test

# Watch mode for development
pnpm test:watch

# Run with coverage
vitest run --coverage
```

## Key Test Scenarios

### Price Parsing
- ✅ Dollar strings: `$0.10`
- ✅ Simple numbers: `0.10`, `1.00`
- ✅ Explicit currency: `0.10 USDC`, `1.00 USD`
- ✅ Number input: `0.1`, `100.5`
- ✅ Pre-parsed objects: `{amount, asset, extra}`
- ✅ All supported networks: Base, Base Sepolia, Ethereum, Sepolia
- ✅ Error cases: invalid formats, unsupported assets/networks

### Chain ID Mapping
- ✅ Base (8453)
- ✅ Base Sepolia (84532)
- ✅ Ethereum (1)
- ✅ Sepolia (11155111)
- ✅ Polygon (137)
- ✅ Polygon Amoy (80002)
- ✅ Unknown network handling

### EIP-712 & EIP-3009
- ✅ TransferWithAuthorization type structure
- ✅ ABI function definitions
- ✅ Both signature formats (split v/r/s and bytes)
- ✅ View functions (balanceOf, version)

### V1 Specifics
- ✅ V1 payload structure (scheme/network fields)
- ✅ maxAmountRequired vs amount
- ✅ V1 type compatibility
- ✅ Network string format (not CAIP-2)

## Total: 65 Unit Tests

All tests are fast (<1 second total execution time) and require no external dependencies or network calls.

