---
"@x402/core": patch
---

Enhance documentation to clarify that the initial payment discovery round trip is optional for successive requests within extended timeouts. This optimization allows clients with known payment amounts to skip the discovery phase and include payment headers directly with the initial request, improving user experience for stable pricing endpoints.