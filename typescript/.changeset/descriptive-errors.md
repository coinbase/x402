---
"@x402/core": patch
---

Improve error messages throughout the core package to be more descriptive and actionable.

Error messages now include:
- What was expected vs what was received
- Which header or field to check
- Suggestions for fixing the issue
- Context about registered versions, networks, and schemes

This helps developers diagnose x402 integration issues faster without guessing.
