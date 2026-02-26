---
'@x402/evm': patch
---

Separated v1 legacy network name resolution from v2 CAIP-2 resolution; getEvmChainId now only accepts eip155:CHAIN_ID format, v1 code uses getEvmChainIdV1 from v1/index
