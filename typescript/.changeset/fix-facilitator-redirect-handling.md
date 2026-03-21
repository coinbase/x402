---
'@x402/core': patch
---

Fix HTTPFacilitatorClient redirect handling for x402.org facilitator. Adds explicit redirect: 'follow' option to all fetch requests (verify, settle, getSupported) to properly handle HTTP 308 redirects returned by facilitators like x402.org. Resolves middleware silently passing through protected requests when facilitators return redirects instead of direct responses.