---
"@x402/core": patch
---

Fix HTTPFacilitatorClient redirect handling and improve error resilience

- Enhanced error handling in HTTPFacilitatorClient.getSupported() to properly handle network failures and redirects
- Added retry logic for network errors in addition to existing 429 rate limit retries  
- Improved error messages to distinguish between HTTP errors and network failures
- Added comprehensive test coverage for redirect handling and error scenarios
- This fixes issue #1692 where middleware would silently pass through requests when facilitator redirect handling failed