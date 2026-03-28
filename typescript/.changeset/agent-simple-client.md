---
"@x402/agent": minor
---

Add simplified @x402/agent package for zero-config AI agent payments

Addresses feedback from issue #1759 about complex x402 onboarding. This package provides a drop-in replacement for fetch that handles payments automatically with minimal setup.

Features:
- Zero-config wallet creation
- Automatic payment handling  
- Built-in spending limits
- Multi-chain support (EVM + optional Solana)
- Simple API: `const client = await createX402Client(); await client(url)`

Before: Complex setup with multiple imports, manual wallet creation, scheme registration
After: One function call, automatic wallet discovery, safety limits included

Example:
```typescript
import { createX402Client } from '@x402/agent';

const client = await createX402Client({
  maxPaymentPerCall: '0.10',
  maxPaymentPerDay: '5.0'
});

const response = await client('https://api.example.com/paid-endpoint');
```