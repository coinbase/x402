---
"@x402/fastify": patch
---

Fixed a payment gate bypass in `@x402/fastify`: an HTTP/1.1 request using an absolute-form request-target (e.g. `GET https://attacker.com/protected-route HTTP/1.1`, per RFC 7230 §5.3.2) let `request.url` retain the scheme and authority, causing the route-matching regex to fail and skip payment verification, while Fastify's router (`find-my-way`) still stripped the prefix and dispatched to the protected handler. Path extraction in `FastifyAdapter.getPath()` and the `onRequest` hook now mirrors find-my-way's own stripping logic so the payment gate and the router always agree on the routed path.
