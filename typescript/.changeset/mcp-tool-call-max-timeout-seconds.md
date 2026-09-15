---
"@x402/mcp": patch
---

MCP tool calls derive their request timeout from the accept's `maxTimeoutSeconds` (default 300s when missing) instead of the MCP SDK's 60s default. A client-owned `maxRequestTimeoutSeconds` ceiling (default 600s) bounds hostile accepts; raise it when you need to wait longer. The initial 402 probe uses `min(300s, cap)` unless the caller passes an explicit per-call `timeout`. Auto-pay now forwards the original call options into the paid retry so accept timeouts apply.
