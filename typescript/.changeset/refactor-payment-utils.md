---
"x402": patch
---

Refactor paymentUtils to shared location - Moved paymentUtils functions from `schemes/exact/evm/utils/` to `schemes/utils/` as they are used by both EVM and SVM code. This improves code organization and reduces duplication while maintaining backward compatibility through existing exports.