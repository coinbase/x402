---
"@x402/core": minor
---

Add amount utility functions for x402 payment processing

Adds a new utilities module `@x402/core/utils/amounts` with helpful functions for working with payment amounts in the x402 protocol:

- `dollarStringToAtomic(dollarString, tokenDecimals)` - Convert dollar strings (e.g., "$0.01") to atomic units
- `atomicToDollarString(atomicAmount, tokenDecimals)` - Convert atomic units back to dollar strings  
- `isValidAtomicAmount(amount)` - Validate atomic amount strings
- `compareAtomicAmounts(a, b)` - Compare two atomic amounts
- `TOKEN_DECIMALS` - Constants for common token decimal values (ETH: 18, USDC: 6, etc.)

These utilities help developers work with the amount conversions commonly needed when integrating x402 payments, especially when converting between user-friendly dollar amounts and the atomic unit strings required by payment requirements.

Example usage:
```typescript
import { dollarStringToAtomic, TOKEN_DECIMALS } from '@x402/core/utils';

// Convert $0.01 to USDC atomic units
const atomicAmount = dollarStringToAtomic("$0.01", TOKEN_DECIMALS.USDC);
console.log(atomicAmount); // "10000"
```