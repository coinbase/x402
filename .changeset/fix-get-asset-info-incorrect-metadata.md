---
"@x402/mechanisms-evm": patch
"@x402/mechanisms-svm": patch
---

Fix get_asset_info() returning incorrect metadata for unregistered tokens. Now raises ValueError for unknown tokens instead of returning misleading metadata with default token decimals/name but custom address, which could cause payment calculation errors and silent failures.