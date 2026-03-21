---
"@x402/core": patch
---

fix: HTTPFacilitatorClient now follows HTTP redirects

Fixed HTTPFacilitatorClient to properly follow HTTP redirects when making requests to facilitator endpoints. Added `redirect: "follow"` option to all fetch calls (verify, settle, getSupported). Resolves critical issue where Express middleware silently passes through protected requests when using the x402.org facilitator that returns 308 redirects.