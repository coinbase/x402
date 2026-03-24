---
"x402-express": patch  
"x402-hono": patch
---

feat: rename outputSchema to requestStructure in payment requirements

Completed the renaming of `outputSchema` to `requestStructure` in payment requirements objects for TypeScript Express and Hono middleware, addressing TODO comments from PR #1764. This change aligns with the Python implementation and improves API consistency across all x402 SDKs.

Changes:
- Express middleware: renamed `outputSchema` to `requestStructure` in payment requirements
- Hono middleware: renamed `outputSchema` to `requestStructure` in payment requirements  
- Removed corresponding TODO comments
- Maintains backward compatibility as this is an internal property structure change

This completes the output_schema → request_structure migration across all middleware implementations.