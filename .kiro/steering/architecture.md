5.1 The Interception Points
The entire x402 server-side flow goes through two objects in @x402/core:
HTTPFacilitatorClient — makes the verify and settle calls to the facilitator
paymentMiddleware — the Express/Next/Hono middleware function itself

Your observer wraps HTTPFacilitatorClient using a JavaScript Proxy. Every call to verify() and settle() is intercepted, timed, logged to SQLite, and then the original call proceeds normally. No facilitator behavior changes.
5.2 Data Flow
HTTP Request → observedPaymentMiddleware → [LOG: request_received]
  → 402 returned → [LOG: payment_required]
  → PAYMENT header received → [LOG: payment_header_received]
  → facilitatorProxy.verify() → [LOG: verify_called]
  → verify result → [LOG: verify_result]
  → facilitatorProxy.settle() → [LOG: settle_called]
  → settle result → [LOG: settle_result, txHash captured]
  → 200 returned → [LOG: workflow_completed]
5.3 Storage
SQLite via better-sqlite3. No Postgres, no Docker, no setup. File stored at .x402-observed/events.db in the project root. This is the same philosophy as Prisma's local dev database — zero infrastructure for local dev tooling.
5.4 Dashboard Tech Stack
Backend: Express serving a REST API over the SQLite file
Frontend: Next.js or plain HTML/JS served from the CLI — reuses your existing frontend codebase from the current project
Real-time: Server-Sent Events (SSE) for live workflow updates — no WebSocket complexity

