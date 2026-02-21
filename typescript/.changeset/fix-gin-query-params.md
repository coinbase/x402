---
"@x402/go": patch
---

Fix Gin middleware to preserve query parameters in paywall redirects

The Gin adapter's `GetURL()` method was previously only returning the URL path, which stripped query parameters from payment-gated endpoints. After users completed payments, the paywall JavaScript would retry requests without the original query parameters.

Fixed by using `RequestURI` instead of `URL.Path` to preserve the complete request URI including query parameters. Browser-initiated requests to payment-gated endpoints with query params (e.g., `/api/data?foo=bar`) now correctly retry with the full URL after payment completion.