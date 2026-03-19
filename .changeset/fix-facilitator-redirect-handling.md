---
"@x402/core": patch
---

Fix HTTPFacilitatorClient redirect handling for x402.org facilitator

The HTTPFacilitatorClient now properly follows HTTP redirects when making requests to facilitator endpoints. This fixes an issue where the middleware would silently pass through requests (returning 200 instead of 402) when the facilitator URL returned a 308 redirect, causing the middleware to fail to fetch supported payment kinds and render the payment protection non-functional.

Addresses issue #1692 by adding `redirect: "follow"` option to all fetch calls in HTTPFacilitatorClient.