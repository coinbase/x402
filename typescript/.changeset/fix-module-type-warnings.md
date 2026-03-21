---
"@x402/core": patch
"@x402/evm": patch
"@x402/svm": patch
"@x402/aptos": patch
"@x402/stellar": patch
"@x402/extensions": patch
"@x402/mcp": patch
"@x402/axios": patch
"@x402/express": patch
"@x402/fetch": patch
"@x402/hono": patch
"x402": patch
"x402-axios": patch
"x402-express": patch
"x402-fetch": patch
"x402-hono": patch
---

fix: resolve MODULE_TYPELESS_PACKAGE_JSON warnings by adding "type": "module" to package.json files

Fixes ESLint warnings where Node.js couldn't determine the module type of eslint.config.js files that use ES module syntax (import/export). By adding "type": "module" to package.json files, Node.js correctly identifies these as ES modules without needing to reparse them.

All packages maintain their dual CommonJS/ES module exports via their existing export configurations, so this change only affects how Node.js interprets the package's own source files during development.