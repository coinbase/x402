---
"@x402/svm": patch
---

Reject invalid smart-wallet compute-unit and priority-fee limits when smart-wallet verification is enabled or its exported verification helpers are called, preventing non-finite or fractional configuration values from silently disabling fee protections or causing misleading payment failures. Export `assertSmartWalletLimits` and `SmartWalletLimits` for pre-validation. Dormant limits remain ignored while smart-wallet verification is disabled.
