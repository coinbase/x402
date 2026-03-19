---
'@x402/core': patch
---

Improve 402 response bodies for autonomous agent discovery and recovery. Default response body now includes structured payment information, human-readable error messages, and actionable next steps instead of empty object, enabling agents to programmatically understand payment requirements and recover from failures without needing to decode base64 headers.