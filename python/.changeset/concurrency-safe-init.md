---
"@x402/python": "patch"
---

fix(middleware): make lazy facilitator initialization concurrency-safe

Prevents race conditions when multiple simultaneous requests trigger facilitator initialization on first protected request. Uses asyncio.Lock for FastAPI and threading.Lock for Flask middleware variants. Adds centralized error propagation when initialization fails.