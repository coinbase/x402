---
"@x402/evm": patch
---

Fixed Base payment timeout race condition by adding network-specific timeout configuration. Base networks now use 60s timeout instead of default 15s to accommodate slower block confirmation times (10-28s). Ethereum networks use 30s timeout. Custom timeouts can be configured via ExactEvmSchemeV1Config.networkTimeouts.