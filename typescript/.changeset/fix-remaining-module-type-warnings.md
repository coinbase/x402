---
"@x402/core": patch
"@x402/stellar": patch
"@x402/aptos": patch
"@x402/svm": patch
"@x402/evm": patch
"@x402/extensions": patch
"@x402/mcp": patch
"@x402/express": patch
"@x402/fetch": patch
"@x402/hono": patch
"@x402/axios": patch
"x402": patch
"x402-express": patch
"x402-axios": patch
"x402-fetch": patch
"x402-hono": patch
---

fix: eliminate remaining MODULE_TYPELESS_PACKAGE_JSON warnings

Adds "type": "module" to package.json files for all remaining packages that emit MODULE_TYPELESS_PACKAGE_JSON warnings during ESLint execution. This follows up on previous fixes and provides comprehensive coverage across the entire monorepo.

**Fixed packages:**
- @x402/core, @x402/stellar, @x402/aptos, @x402/svm, @x402/evm
- @x402/extensions, @x402/mcp
- @x402/express, @x402/fetch, @x402/hono, @x402/axios
- x402, x402-express, x402-axios, x402-fetch, x402-hono (legacy)

**Impact:**
- Eliminates all remaining MODULE_TYPELESS_PACKAGE_JSON warnings during lint execution
- Improves build performance by removing unnecessary parsing overhead
- Maintains full backward compatibility with dual CommonJS/ES module exports
- No breaking changes to public APIs or runtime behavior
- Clean lint output with zero warnings across entire monorepo