---
"@x402/core": patch
---

Fix HTTPFacilitatorClient redirect handling (#1692)

Improve HTTP redirect handling in HTTPFacilitatorClient.getSupported() to better handle 308 permanent redirects from facilitator URLs. The fix includes:
- Explicit redirect: "follow" option for fetch requests
- Enhanced error messages with redirect information
- Specific error handling for 3xx redirect responses with guidance
- Better error classification using FacilitatorResponseError

This resolves middleware initialization failures where facilitators return redirects instead of direct responses, preventing silent pass-through of protected requests.