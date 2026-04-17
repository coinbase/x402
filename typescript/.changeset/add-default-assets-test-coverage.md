---
"@x402/evm": patch
---

test: add comprehensive test coverage for defaultAssets functionality

Added comprehensive test coverage for the `getDefaultAsset` function and `DEFAULT_STABLECOINS` constant in the EVM package, including:

- Complete validation of all supported mainnet and testnet networks  
- Verification of asset configuration for recently added Arbitrum One and Arbitrum Sepolia networks
- Validation of special configurations like MegaETH's permit2 support
- Type consistency checks and error handling for unsupported networks
- Network coverage validation and uniqueness checks

This addresses the missing test coverage for critical default asset functionality that determines which stablecoins are available on each supported EVM network. The tests ensure configuration correctness and prevent regressions when new networks are added.