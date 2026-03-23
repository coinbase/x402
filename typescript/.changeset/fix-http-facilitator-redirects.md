---
"@x402/core": patch
---

fix(core): HTTPFacilitatorClient now follows HTTP redirects

Fixed critical bug where HTTPFacilitatorClient failed to follow HTTP redirects, causing Express middleware to silently pass through requests (returning 200 instead of 402) when using facilitators that return redirects like x402.org.

Added `redirect: "follow"` option to all fetch calls in HTTPFacilitatorClient:
- verify() method  
- settle() method
- getSupported() method

This ensures proper middleware functionality with all standard facilitators including the official x402.org facilitator.